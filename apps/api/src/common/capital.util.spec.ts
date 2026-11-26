import {
  aggregatePortfolioCapital,
  Mt5BatchWebhookSchema,
  normalizeDecimalString,
  reconcileAccountCapital,
  resolveSyncAccountCapitalUpdate,
} from '@trackdailytrade/shared';

describe('Capital pure domain utilities (@trackdailytrade/shared)', () => {
  describe('normalizeDecimalString', () => {
    it('normalizes large numbers, spaces, US/EU separators, currency symbols, and signs safely', () => {
      expect(normalizeDecimalString('100,000.00')).toBe('100000.00');
      expect(normalizeDecimalString('100 000.00')).toBe('100000.00');
      expect(normalizeDecimalString('100\u00a0000.00')).toBe('100000.00');
      expect(normalizeDecimalString('99.210,50')).toBe('99210.50');
      expect(normalizeDecimalString('-790,50')).toBe('-790.50');
      expect(normalizeDecimalString('$99,210.00')).toBe('99210.00');
      expect(normalizeDecimalString('- 790.00')).toBe('-790.00');
      expect(normalizeDecimalString('(790.00)')).toBe('-790.00');
      expect(normalizeDecimalString('1,234,567.89')).toBe('1234567.89');
      expect(normalizeDecimalString('100,000')).toBe('100000');
      expect(normalizeDecimalString('0,125')).toBe('0.125');
      expect(normalizeDecimalString('USD 99,380.00')).toBe('99380.00');
      expect(normalizeDecimalString(-0)).toBe('0');
      expect(normalizeDecimalString(99210)).toBe('99210');
    });

    it('returns null for invalid, empty, NaN, Infinity, or malformed strings', () => {
      expect(normalizeDecimalString(null)).toBeNull();
      expect(normalizeDecimalString(undefined)).toBeNull();
      expect(normalizeDecimalString('')).toBeNull();
      expect(normalizeDecimalString('   ')).toBeNull();
      expect(normalizeDecimalString(Number.NaN)).toBeNull();
      expect(normalizeDecimalString(Number.POSITIVE_INFINITY)).toBeNull();
      expect(normalizeDecimalString('NaN')).toBeNull();
      expect(normalizeDecimalString('Infinity')).toBeNull();
      expect(normalizeDecimalString('abc')).toBeNull();
      expect(normalizeDecimalString('1,23.45')).toBeNull();
      expect(normalizeDecimalString('1.23,45')).toBeNull();
    });
  });

  describe('demo account 5059484297 (100k capital, -$790 across 4 XAUUSD losses -> $99,210)', () => {
    it('replaces stale default 10,000 initialBalance with broker 100,000 deposit and live 99,210 balance', () => {
      const patch = resolveSyncAccountCapitalUpdate({
        existingInitialBalance: '10000.00',
        incomingInitialCapital: '100 000.00',
        incomingBalance: '99 210.00',
        incomingEquity: '99 210.00',
        allTimeClosedNetPnl: '-790.00',
      });

      expect(patch).toEqual({
        initialBalance: '100000.00',
        currentBalance: '99210.00',
        currentEquity: '99210.00',
      });

      const reconciled = reconcileAccountCapital({
        initialBalance: patch.initialBalance!,
        storedLiveBalance: patch.currentBalance!,
        storedLiveEquity: patch.currentEquity!,
        allTimeClosedNetPnl: '-790.00',
      });

      expect(reconciled).toEqual({
        initialBalance: '100000.00',
        currentBalance: '99210.00',
        currentEquity: '99210.00',
        baseBalanceBeforeTrades: '100000.00',
        netPnl: '-790.00',
        hasLiveSnapshot: true,
      });
    });

    it('derives 100,000.00 starting capital from liveBalance - closedNetPnl when new account lacks initialCapital', () => {
      const patch = resolveSyncAccountCapitalUpdate({
        existingInitialBalance: '0',
        isNewAccount: true,
        incomingInitialCapital: null,
        incomingBalance: '99210.00',
        incomingEquity: '99380.00',
        allTimeClosedNetPnl: '-790.00',
      });

      // Strictly uses Balance (99210), NOT floating Equity (99380), to derive starting capital!
      expect(patch).toEqual({
        initialBalance: '100000.00',
        currentBalance: '99210.00',
        currentEquity: '99380.00',
      });
    });
  });

  describe('partial close + floating equity vs realized balance', () => {
    it('keeps realized Balance separated from floating Equity without double counting', () => {
      // 100k account closed +450.50 on partial close & closed trades, remaining open leg floats -180.25
      const reconciled = reconcileAccountCapital({
        initialBalance: '100000.00',
        storedLiveBalance: '100450.50',
        storedLiveEquity: '100270.25',
        allTimeClosedNetPnl: '450.50',
      });

      expect(reconciled.initialBalance).toBe('100000.00');
      expect(reconciled.currentBalance).toBe('100450.50');
      expect(reconciled.currentEquity).toBe('100270.25');
      expect(reconciled.baseBalanceBeforeTrades).toBe('100000.00');
      expect(reconciled.hasLiveSnapshot).toBe(true);
    });

    it('does not write synthetic balance into DB when import lacks statement balance summary', () => {
      const patch = resolveSyncAccountCapitalUpdate({
        existingInitialBalance: '10000.00',
        incomingInitialCapital: null,
        incomingBalance: null,
        incomingEquity: null,
        allTimeClosedNetPnl: '-790.00',
      });

      expect(patch).toEqual({});

      // Dynamic fallback computes cleanly from current initialBalance, and updates immediately if user edits initialBalance
      const beforeEdit = reconcileAccountCapital({
        initialBalance: '10000.00',
        storedLiveBalance: null,
        storedLiveEquity: null,
        allTimeClosedNetPnl: '-790.00',
      });
      expect(beforeEdit.currentBalance).toBe('9210.00');

      const afterEdit = reconcileAccountCapital({
        initialBalance: '100000.00',
        storedLiveBalance: null,
        storedLiveEquity: null,
        allTimeClosedNetPnl: '-790.00',
      });
      expect(afterEdit.currentBalance).toBe('99210.00');
      expect(afterEdit.baseBalanceBeforeTrades).toBe('100000.00');
    });
  });

  describe('multi-account portfolio aggregation & webhook schema', () => {
    it('aggregates multiple independent accounts using exact Decimal arithmetic', () => {
      const summary = aggregatePortfolioCapital([
        {
          initialBalance: '377.00',
          currentBalance: '377.00',
          currentEquity: '377.00',
          netPnl: '0.00',
        },
        {
          initialBalance: '100004.00',
          currentBalance: '48164.14',
          currentEquity: '48164.14',
          netPnl: '-51839.86',
        },
        {
          initialBalance: '100000.00',
          currentBalance: '99210.00',
          currentEquity: '99380.10',
          netPnl: '-790.00',
        },
      ]);

      expect(summary).toEqual({
        totalInitialBalance: '200381.00',
        totalCurrentBalance: '147751.14',
        totalCurrentEquity: '147921.24',
        totalNetPnl: '-52629.86',
      });

      // Verify classic JS floating-point trap (0.1 + 0.2) stays exact
      const precisionCheck = aggregatePortfolioCapital([
        { currentBalance: '0.10', currentEquity: '0.10', netPnl: '0.10' },
        { currentBalance: '0.20', currentEquity: '0.20', netPnl: '0.20' },
      ]);
      expect(precisionCheck.totalCurrentBalance).toBe('0.30');
    });

    it('parses MT5 webhook payloads with canonical balance/equity aliases and formatted numbers', () => {
      const parsed = Mt5BatchWebhookSchema.parse({
        accountNumber: 5059484297,
        broker: 'MetaQuotes-Demo',
        currency: 'USD',
        initialCapital: '100 000.00',
        balance: '99,210.00',
        equity: '99,380.00',
        trades: [],
      });

      expect(parsed.accountNumber).toBe('5059484297');
      expect(parsed.initialCapital).toBe('100000.00');
      expect(parsed.balance).toBe('99210.00');
      expect(parsed.equity).toBe('99380.00');
    });
  });
});
