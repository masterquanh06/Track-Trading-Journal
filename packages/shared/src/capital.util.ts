import Decimal from 'decimal.js';

const CANONICAL_DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;
const COMMA_THOUSANDS_REGEX = /^\d{1,3}(,\d{3})+$/;
const DOT_THOUSANDS_REGEX = /^\d{1,3}(\.\d{3})+$/;

/**
 * Pure financial number normalizer.
 * Handles thousand separators, European decimals, currency symbols, NBSP/spaces,
 * and accounting parentheses without ever dropping digits or shifting decimals:
 * - "100,000.00" -> "100000.00"
 * - "100 000.00" -> "100000.00"
 * - "99.210,50"  -> "99210.50"
 * - "-790,50"    -> "-790.50"
 * - "$99,210.00" -> "99210.00"
 * - "- 790.00"   -> "-790.00"
 * - "(790.00)"   -> "-790.00"
 * Returns `null` on empty, NaN, Infinity, or malformed inputs.
 */
export function normalizeDecimalString(
  raw: string | number | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (Object.is(raw, -0) || raw === 0) return '0';
    return new Decimal(raw).toFixed();
  }

  let s = String(raw)
    .replace(/[\u00a0\u202f\u2009\u2007]/g, ' ')
    .trim();

  if (!s) return null;

  // Reject NaN/Infinity strings explicitly
  if (/^(nan|[+-]?infinity)$/i.test(s)) return null;

  // Accounting negative format: (790.00) or ($790.00)
  let isNegative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }

  // Strip currency codes / symbols at edges (e.g. $, €, £, ¥, ₫, USD, EUR, GBP, USDT)
  s = s.replace(/^(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|VND|USDT|USDC)\s*/i, '');
  s = s.replace(/\s*(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|VND|USDT|USDC)$/i, '');
  s = s.replace(/[$€£¥₫]/g, '').trim();

  // Extract leading sign(s)
  if (s.startsWith('-')) {
    isNegative = !isNegative;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  // Remove internal whitespace & apostrophe thousand separators (e.g. "100 000.00", "100'000.00")
  s = s.replace(/[\s']/g, '');

  if (!s || !/^[0-9.,]+$/.test(s)) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  let normalizedUnsigned: string;

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastDot > lastComma) {
      // Standard US/UK format: 100,000.50 -> dot is decimal, commas are thousands
      const [intPart, fracPart] = s.split('.');
      if (s.indexOf('.') !== lastDot) return null;
      if (!COMMA_THOUSANDS_REGEX.test(intPart) && !/^\d+$/.test(intPart.replace(/,/g, ''))) {
        return null;
      }
      // Reject misplaced commas like "1,23.45"
      if (intPart.includes(',') && !COMMA_THOUSANDS_REGEX.test(intPart)) return null;
      normalizedUnsigned = `${intPart.replace(/,/g, '')}.${fracPart}`;
    } else {
      // European format: 99.210,50 -> comma is decimal, dots are thousands
      const [intPart, fracPart] = s.split(',');
      if (s.indexOf(',') !== lastComma) return null;
      if (intPart.includes('.') && !DOT_THOUSANDS_REGEX.test(intPart)) return null;
      normalizedUnsigned = `${intPart.replace(/\./g, '')}.${fracPart}`;
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) {
      // Multiple commas must be valid thousand groups: 1,000,000
      if (!COMMA_THOUSANDS_REGEX.test(s)) return null;
      normalizedUnsigned = s.replace(/,/g, '');
    } else {
      const [intPart, afterComma] = parts;
      if (!intPart || !afterComma) return null;
      // Single comma: 100,000 / 99,210 / 1,250 => thousand separator;
      // -790,50 / 0,125 / 1234,567 => decimal separator
      const looksLikeThousands =
        afterComma.length === 3 &&
        intPart.length >= 1 &&
        intPart.length <= 3 &&
        !/^0+$/.test(intPart);
      normalizedUnsigned = looksLikeThousands
        ? `${intPart}${afterComma}`
        : `${intPart}.${afterComma}`;
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // Multiple dots must be valid European thousand groups: 1.000.000
      if (!DOT_THOUSANDS_REGEX.test(s)) return null;
      normalizedUnsigned = s.replace(/\./g, '');
    } else {
      // Single dot is always decimal in financial/MT5 payloads
      if (!parts[0] || !parts[1]) return null;
      normalizedUnsigned = s;
    }
  } else {
    normalizedUnsigned = s;
  }

  const candidate = isNegative ? `-${normalizedUnsigned}` : normalizedUnsigned;
  if (!CANONICAL_DECIMAL_REGEX.test(candidate)) return null;

  try {
    const dec = new Decimal(candidate);
    if (!dec.isFinite()) return null;
    if (dec.isZero()) {
      // Normalize -0.00 -> 0.00 while preserving decimal format if present
      return normalizedUnsigned;
    }
    return candidate;
  } catch {
    return null;
  }
}

export function parseSafeDecimal(
  raw: Decimal.Value | null | undefined,
): Decimal | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Decimal) {
    return raw.isFinite() ? raw : null;
  }
  const normalized = normalizeDecimalString(
    typeof raw === 'number' ? raw : String(raw),
  );
  if (normalized === null) return null;
  return new Decimal(normalized);
}

export function formatMoneyDecimal(value: Decimal.Value): string {
  const dec = parseSafeDecimal(value) ?? new Decimal(0);
  return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export interface AccountCapitalReconcileInput {
  initialBalance: Decimal.Value;
  storedLiveBalance?: Decimal.Value | null;
  storedLiveEquity?: Decimal.Value | null;
  allTimeClosedNetPnl: Decimal.Value;
}

export interface ReconciledAccountCapital {
  initialBalance: string;
  currentBalance: string;
  currentEquity: string;
  baseBalanceBeforeTrades: string;
  netPnl: string;
  hasLiveSnapshot: boolean;
}

/**
 * Pure single-source-of-truth reconciliation for an account's Capital / Balance / Equity.
 *
 * Rules:
 * 1. `initialBalance` = Starting Capital (deposits / initial funded amount).
 * 2. When a broker-reported live `storedLiveBalance` exists (from MT5 EA or MT5 report summary):
 *    - `currentBalance` = `storedLiveBalance` (strictly Balance, never floating Equity)
 *    - `currentEquity`  = `storedLiveEquity ?? storedLiveBalance`
 *    - `baseBalanceBeforeTrades` = `currentBalance - allTimeClosedNetPnl`
 *      so that Analytics `startingEquity + closedNetPnl === currentBalance` (never double-subtracts!).
 * 3. When no broker-reported live balance exists:
 *    - `currentBalance` = `initialBalance + allTimeClosedNetPnl`
 *    - `currentEquity`  = `storedLiveEquity ?? currentBalance`
 *    - `baseBalanceBeforeTrades` = `initialBalance`.
 */
export function reconcileAccountCapital(
  input: AccountCapitalReconcileInput,
): ReconciledAccountCapital {
  const initial = parseSafeDecimal(input.initialBalance) ?? new Decimal(0);
  const closedNetPnl = parseSafeDecimal(input.allTimeClosedNetPnl) ?? new Decimal(0);
  const liveBalance = parseSafeDecimal(input.storedLiveBalance);
  const liveEquity = parseSafeDecimal(input.storedLiveEquity);

  const hasLiveSnapshot = liveBalance !== null;
  const currentBalance = liveBalance ?? initial.plus(closedNetPnl);
  const currentEquity = liveEquity ?? currentBalance;
  const baseBalanceBeforeTrades = hasLiveSnapshot
    ? currentBalance.minus(closedNetPnl)
    : initial;

  return {
    initialBalance: formatMoneyDecimal(initial),
    currentBalance: formatMoneyDecimal(currentBalance),
    currentEquity: formatMoneyDecimal(currentEquity),
    baseBalanceBeforeTrades: formatMoneyDecimal(baseBalanceBeforeTrades),
    netPnl: formatMoneyDecimal(closedNetPnl),
    hasLiveSnapshot,
  };
}

export interface SyncAccountCapitalInput {
  existingInitialBalance?: Decimal.Value | null;
  isNewAccount?: boolean;
  /** Net deposits / starting capital reported directly by MT5 (DEAL_TYPE_BALANCE) or HTML report */
  incomingInitialCapital?: Decimal.Value | null;
  /** Actual account Balance reported by MT5 terminal or HTML report summary */
  incomingBalance?: Decimal.Value | null;
  /** Actual account Equity reported by MT5 terminal or HTML report summary */
  incomingEquity?: Decimal.Value | null;
  /** Sum of all closed trade netPnl for this account (used only to back-calculate missing initialBalance) */
  allTimeClosedNetPnl?: Decimal.Value | null;
}

export interface SyncAccountCapitalPatch {
  initialBalance?: string;
  currentBalance?: string;
  currentEquity?: string;
}

/**
 * Pure decision function for updating a single TradingAccount's capital columns during sync/import.
 *
 * Guarantees:
 * - Never writes a synthetic `initialBalance + netPnl` into `currentBalance`/`currentEquity`
 *   when no real broker/statement balance was supplied.
 * - Prioritizes broker-reported `incomingInitialCapital` (sum of DEAL_TYPE_BALANCE deposits)
 *   for `initialBalance`.
 * - Falls back to `incomingBalance - allTimeClosedNetPnl` ONLY when creating a new account or
 *   when existing `initialBalance` is unset (`<= 0`) and `incomingInitialCapital` is unavailable.
 * - Strictly uses `Balance` (not floating `Equity`) when reconciling `initialBalance`.
 */
export function resolveSyncAccountCapitalUpdate(
  input: SyncAccountCapitalInput,
): SyncAccountCapitalPatch {
  const existingInit = parseSafeDecimal(input.existingInitialBalance);
  const inInitCap = parseSafeDecimal(input.incomingInitialCapital);
  const inBalance = parseSafeDecimal(input.incomingBalance);
  const inEquity = parseSafeDecimal(input.incomingEquity);
  const closedPnl = parseSafeDecimal(input.allTimeClosedNetPnl) ?? new Decimal(0);

  const patch: SyncAccountCapitalPatch = {};

  if (inBalance !== null) {
    patch.currentBalance = formatMoneyDecimal(inBalance);
  }

  if (inEquity !== null) {
    patch.currentEquity = formatMoneyDecimal(inEquity);
  } else if (inBalance !== null) {
    patch.currentEquity = formatMoneyDecimal(inBalance);
  }

  if (inInitCap !== null && inInitCap.greaterThan(0)) {
    patch.initialBalance = formatMoneyDecimal(inInitCap);
  } else {
    const needsDerivedInitial =
      Boolean(input.isNewAccount) ||
      existingInit === null ||
      existingInit.lessThanOrEqualTo(0);

    if (needsDerivedInitial && inBalance !== null) {
      const derivedInitial = inBalance.minus(closedPnl);
      patch.initialBalance = formatMoneyDecimal(
        derivedInitial.greaterThan(0) ? derivedInitial : inBalance,
      );
    }
  }

  return patch;
}

export interface PortfolioAccountSnapshot {
  initialBalance?: Decimal.Value | null;
  currentBalance?: Decimal.Value | null;
  currentEquity?: Decimal.Value | null;
  netPnl?: Decimal.Value | null;
}

export interface PortfolioCapitalSummary {
  totalInitialBalance: string;
  totalCurrentBalance: string;
  totalCurrentEquity: string;
  totalNetPnl: string;
}

/**
 * Pure exact-Decimal portfolio aggregation across multiple accounts.
 * Prevents JS floating-point summation drift in Topbar/Sidebar portfolio summaries.
 */
export function aggregatePortfolioCapital(
  accounts: PortfolioAccountSnapshot[],
): PortfolioCapitalSummary {
  let totalInit = new Decimal(0);
  let totalBal = new Decimal(0);
  let totalEq = new Decimal(0);
  let totalPnl = new Decimal(0);

  for (const acc of accounts) {
    totalInit = totalInit.plus(parseSafeDecimal(acc.initialBalance) ?? 0);
    totalBal = totalBal.plus(parseSafeDecimal(acc.currentBalance) ?? 0);
    totalEq = totalEq.plus(parseSafeDecimal(acc.currentEquity) ?? 0);
    totalPnl = totalPnl.plus(parseSafeDecimal(acc.netPnl) ?? 0);
  }

  return {
    totalInitialBalance: formatMoneyDecimal(totalInit),
    totalCurrentBalance: formatMoneyDecimal(totalBal),
    totalCurrentEquity: formatMoneyDecimal(totalEq),
    totalNetPnl: formatMoneyDecimal(totalPnl),
  };
}
