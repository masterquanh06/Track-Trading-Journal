import { z } from 'zod';
import { TradeDirectionEnum } from './enums';

export const AnalyticsFilterSchema = z.object({
  accountId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  symbol: z.string().optional(),
  direction: TradeDirectionEnum.optional(),
  tagIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',').filter(Boolean)))
    .optional(),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
});

export type AnalyticsFilterInput = z.infer<typeof AnalyticsFilterSchema>;

export interface ZellaRadarMetric {
  key: string;
  label: string;
  score: number; // 0 - 100
}

export interface ZellaScoreSummary {
  overall: number; // 0 - 100
  grade: string;
  metrics: ZellaRadarMetric[];
}

export interface AnalyticsOverview {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;
  netPnl: string;
  grossProfit: string;
  grossLoss: string;
  profitFactor: number | null;
  expectancy: string;
  expectancyR: number | null;
  avgWin: string;
  avgLoss: string;
  largestWin: string;
  largestLoss: string;
  avgHoldingSeconds: number;
  startingEquity: string;
  endingEquity: string;
  maxDrawdownUsd: string;
  maxDrawdownPct: number;
  zellaScore: ZellaScoreSummary;
}

export interface EquityCurvePoint {
  tradeId: string;
  timestamp: string; // ISO UTC
  unixTime: number;
  netPnl: string;
  cumulativePnl: string;
  equity: string;
  drawdownUsd: string;
  drawdownPct: number;
}

export interface EquityCurveResponse {
  startingEquity: string;
  points: EquityCurvePoint[];
}

export interface CalendarDaySummary {
  date: string; // YYYY-MM-DD in displayTimezone
  netPnl: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

export interface BreakdownBucket {
  key: string;
  label: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnl: string;
  profitFactor: number | null;
  avgR: number | null;
}

export interface SessionBreakdownItem extends BreakdownBucket {
  utcHoursLabel: string;
  vnHoursLabel: string;
}

export interface TagBreakdownItem extends BreakdownBucket {
  tagId: string;
  color: string;
}

export interface AnalyticsBreakdownsResponse {
  byHour: BreakdownBucket[];
  byDayOfWeek: BreakdownBucket[];
  byHoldingDuration: BreakdownBucket[];
  bySession: SessionBreakdownItem[];
  byTag: TagBreakdownItem[];
}
