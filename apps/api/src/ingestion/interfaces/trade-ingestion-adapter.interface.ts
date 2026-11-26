import { Prisma, TradeDirection, TradeSource } from '@prisma/client';
import Decimal from 'decimal.js';

export interface AdapterContext {
  brokerTimezone: string;
  fileName?: string;
}

export interface NormalizedTradeInput {
  externalId: string;
  symbol: string;
  direction: TradeDirection;
  volume: Decimal;
  openTime: Date;
  closeTime: Date;
  holdingSeconds: number;
  openPrice: Decimal;
  closePrice: Decimal;
  stopLoss: Decimal | null;
  takeProfit: Decimal | null;
  initialStopLoss: Decimal | null;
  initialRiskAmount: Decimal | null;
  grossPnl: Decimal;
  commission: Decimal;
  swap: Decimal;
  netPnl: Decimal;
  rawPayload: Prisma.InputJsonValue;
}

export interface AccountSnapshotInput {
  initialCapital?: string | null;
  balance?: string | null;
  equity?: string | null;
  currency?: string | null;
}

export interface AdapterParseResult {
  trades: NormalizedTradeInput[];
  skippedRows: number;
  warnings: string[];
  accountSnapshot?: AccountSnapshotInput;
}

export interface ITradeIngestionAdapter<TInput> {
  readonly source: TradeSource;
  parse(input: TInput, context: AdapterContext): Promise<AdapterParseResult>;
}
