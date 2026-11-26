import { normalizeDecimalString } from '@trackdailytrade/shared';
import Decimal from 'decimal.js';
import { TradeDirection } from '@prisma/client';

export function toDecimal(value: Decimal.Value | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Decimal) return value.isFinite() ? value : null;
  const normalized = normalizeDecimalString(
    typeof value === 'number' ? value : String(value),
  );
  if (normalized === null) return null;
  return new Decimal(normalized);
}

export function toDecimalOrZero(value: Decimal.Value | null | undefined): Decimal {
  return toDecimal(value) ?? new Decimal(0);
}

export function formatMoney(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function formatPrice(value: Decimal): string {
  return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed();
}

export function formatR(value: Decimal): string {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

export interface RiskCalculationInput {
  direction: TradeDirection;
  openPrice: Decimal;
  closePrice: Decimal;
  grossPnl: Decimal;
  netPnl: Decimal;
  initialStopLoss: Decimal | null;
  initialRiskAmount: Decimal | null;
}

export interface RiskCalculationResult {
  initialStopLoss: Decimal | null;
  initialRiskAmount: Decimal | null;
  rMultiple: Decimal | null;
}

/**
 * Computes accurate R-Multiple using Decimal arithmetic:
 * 1) Priority 1: If `initialRiskAmount > 0` (from MT5 EA OrderCalcProfit or manual entry):
 *    `rMultiple = netPnl / initialRiskAmount`.
 * 2) Priority 2: If `initialStopLoss` is provided without `initialRiskAmount`:
 *    - Compute risk distance in price terms based on BUY/SELL direction.
 *    - If `riskDist > 0` and we have `grossPnl != 0` & `pnlDist != 0`, derive contract value
 *      per price unit (`|grossPnl / pnlDist|`) so `initialRiskAmount` includes exact pair tick value,
 *      and `rMultiple = netPnl / initialRiskAmount` reflects commission & swap too.
 *    - Otherwise fallback to pure price ratio `pnlDist / riskDist`.
 */
export function calculateRiskAndRMultiple(input: RiskCalculationInput): RiskCalculationResult {
  const { direction, openPrice, closePrice, grossPnl, netPnl } = input;
  const initialStopLoss =
    input.initialStopLoss && !input.initialStopLoss.isZero() ? input.initialStopLoss : null;
  let initialRiskAmount =
    input.initialRiskAmount && input.initialRiskAmount.greaterThan(0)
      ? input.initialRiskAmount.abs()
      : null;

  if (initialRiskAmount && initialRiskAmount.greaterThan(0)) {
    const rMultiple = netPnl.div(initialRiskAmount).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return {
      initialStopLoss,
      initialRiskAmount: initialRiskAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      rMultiple,
    };
  }

  if (initialStopLoss) {
    const riskDist =
      direction === TradeDirection.BUY
        ? openPrice.minus(initialStopLoss)
        : initialStopLoss.minus(openPrice);

    const pnlDist =
      direction === TradeDirection.BUY
        ? closePrice.minus(openPrice)
        : openPrice.minus(closePrice);

    if (riskDist.greaterThan(0)) {
      if (!grossPnl.isZero() && !pnlDist.isZero()) {
        const valuePerPriceUnit = grossPnl.div(pnlDist).abs();
        const derivedRisk = riskDist
          .mul(valuePerPriceUnit)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        if (derivedRisk.greaterThan(0)) {
          initialRiskAmount = derivedRisk;
          const rMultiple = netPnl.div(derivedRisk).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          return {
            initialStopLoss,
            initialRiskAmount,
            rMultiple,
          };
        }
      }

      const priceRatioR = pnlDist.div(riskDist).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      return {
        initialStopLoss,
        initialRiskAmount: null,
        rMultiple: priceRatioR,
      };
    }
  }

  return {
    initialStopLoss,
    initialRiskAmount,
    rMultiple: null,
  };
}
