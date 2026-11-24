import { z } from 'zod';
import { PlatformEnum, TradeDirectionEnum } from './enums';
import { DecimalStringSchema, NullableDecimalStringSchema } from './webhook.schema';

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  broker: z.string().trim().max(100).optional().nullable(),
  platform: PlatformEnum.default('MT5'),
  accountNumber: z.string().trim().min(1).max(64),
  currency: z.string().trim().min(1).max(10).default('USD'),
  initialBalance: DecimalStringSchema.default('0'),
  brokerTimezone: z.string().trim().min(1).default('Europe/Athens'),
  displayTimezone: z.string().trim().min(1).default('Asia/Ho_Chi_Minh'),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = CreateAccountSchema.partial();
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

export const CreateTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex code')
    .default('#6366f1'),
});

export type CreateTagInput = z.infer<typeof CreateTagSchema>;

export const UpdateTagSchema = CreateTagSchema.partial();
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;

export const UpdateTradeJournalSchema = z.object({
  note: z.string().max(10000).nullable().optional(),
  preTradePlan: z.string().max(10000).nullable().optional(),
  postTradeReview: z.string().max(10000).nullable().optional(),
  screenshotUrl: z.string().max(2_500_000).nullable().optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  initialStopLoss: NullableDecimalStringSchema.optional(),
  initialRiskAmount: NullableDecimalStringSchema.optional(),
});

export type UpdateTradeJournalInput = z.infer<typeof UpdateTradeJournalSchema>;

export const TradeQuerySchema = z.object({
  accountId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  symbol: z.string().optional(),
  direction: TradeDirectionEnum.optional(),
  tagIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',').filter(Boolean)))
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type TradeQueryInput = z.infer<typeof TradeQuerySchema>;
