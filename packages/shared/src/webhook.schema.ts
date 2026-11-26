import { z } from 'zod';
import { normalizeDecimalString } from './capital.util';
import { TradeDirectionEnum } from './enums';

export const DecimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((val, ctx) => {
    const normalized = normalizeDecimalString(val);
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be a valid decimal number',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const NullableDecimalStringSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val, ctx) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string' && val.trim() === '') return null;
    const normalized = normalizeDecimalString(val);
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be a valid decimal number or null',
      });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Payload sent by MT5 EA for a single fully-closed position (remainingVolume == 0).
 * Non-trade deals (DEAL_TYPE_BALANCE, CREDIT, BONUS, etc.) are strictly excluded.
 */
export const Mt5WebhookTradeSchema = z.object({
  positionId: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  symbol: z.string().trim().min(1),
  direction: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(TradeDirectionEnum),
  volume: DecimalStringSchema,
  openTimeServer: z.string().trim().min(1),
  closeTimeServer: z.string().trim().min(1),
  openPrice: DecimalStringSchema,
  closePrice: DecimalStringSchema,
  stopLoss: NullableDecimalStringSchema.optional(),
  takeProfit: NullableDecimalStringSchema.optional(),
  initialStopLoss: NullableDecimalStringSchema.optional(),
  initialRiskAmount: NullableDecimalStringSchema.optional(),
  grossPnl: DecimalStringSchema,
  commission: DecimalStringSchema.default('0'),
  swap: DecimalStringSchema.default('0'),
  netPnl: NullableDecimalStringSchema.optional(),
  rawDealsCount: z.number().int().positive().optional(),
});

export type Mt5WebhookTrade = z.infer<typeof Mt5WebhookTradeSchema>;

const AccountStateFields = {
  accountNumber: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  broker: z.string().trim().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  brokerTimezone: z.string().trim().optional(),
  initialCapital: NullableDecimalStringSchema.optional(),
  accountBalance: NullableDecimalStringSchema.optional(),
  accountEquity: NullableDecimalStringSchema.optional(),
  /** Canonical aliases supported alongside accountBalance / accountEquity */
  balance: NullableDecimalStringSchema.optional(),
  equity: NullableDecimalStringSchema.optional(),
};

export const Mt5SingleWebhookSchema = z.object({
  ...AccountStateFields,
  trade: Mt5WebhookTradeSchema,
});

export type Mt5SingleWebhookPayload = z.infer<typeof Mt5SingleWebhookSchema>;

export const Mt5BatchWebhookSchema = z.object({
  ...AccountStateFields,
  trades: z.array(Mt5WebhookTradeSchema),
});

export type Mt5BatchWebhookPayload = z.infer<typeof Mt5BatchWebhookSchema>;
