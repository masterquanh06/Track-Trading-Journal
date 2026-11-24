import { z } from 'zod';
import { TradeDirectionEnum } from './enums';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export const DecimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((val) => String(val).trim().replace(/\s+/g, ''))
  .refine((val) => DECIMAL_REGEX.test(val), {
    message: 'Must be a valid decimal number',
  });

export const NullableDecimalStringSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined) return null;
    const cleaned = String(val).trim().replace(/\s+/g, '');
    if (cleaned === '') return null;
    return cleaned;
  })
  .refine((val) => val === null || DECIMAL_REGEX.test(val), {
    message: 'Must be a valid decimal number or null',
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

export const Mt5SingleWebhookSchema = z.object({
  accountNumber: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  broker: z.string().trim().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  brokerTimezone: z.string().trim().optional(),
  accountBalance: NullableDecimalStringSchema.optional(),
  accountEquity: NullableDecimalStringSchema.optional(),
  trade: Mt5WebhookTradeSchema,
});

export type Mt5SingleWebhookPayload = z.infer<typeof Mt5SingleWebhookSchema>;

export const Mt5BatchWebhookSchema = z.object({
  accountNumber: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  broker: z.string().trim().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  brokerTimezone: z.string().trim().optional(),
  accountBalance: NullableDecimalStringSchema.optional(),
  accountEquity: NullableDecimalStringSchema.optional(),
  trades: z.array(Mt5WebhookTradeSchema),
});

export type Mt5BatchWebhookPayload = z.infer<typeof Mt5BatchWebhookSchema>;
