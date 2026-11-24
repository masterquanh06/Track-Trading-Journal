import { Injectable } from '@nestjs/common';
import { Prisma, SyncStatus, TradeSource } from '@prisma/client';
import Decimal from 'decimal.js';
import { calculateRiskAndRMultiple, formatMoney, formatPrice } from '../common/decimal.util';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizedTradeInput } from './interfaces/trade-ingestion-adapter.interface';

export interface IngestOptions {
  accountId: string;
  source: TradeSource;
  fileName?: string;
  skippedRows?: number;
  warnings?: string[];
  dryRun?: boolean;
  accountBalance?: string | null;
  accountEquity?: string | null;
}

export interface IngestSummary {
  dryRun: boolean;
  accountId: string;
  source: TradeSource;
  status: SyncStatus;
  totalParsed: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  warnings: string[];
  syncLogId?: string;
  preview?: Array<{
    externalId: string;
    symbol: string;
    direction: string;
    volume: string;
    openTime: string;
    closeTime: string;
    openPrice: string;
    closePrice: string;
    netPnl: string;
    action: 'INSERT' | 'UPDATE';
  }>;
}

@Injectable()
export class TradeIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestTrades(
    trades: NormalizedTradeInput[],
    options: IngestOptions,
  ): Promise<IngestSummary> {
    const warnings = [...(options.warnings ?? [])];
    const skippedCount = options.skippedRows ?? 0;

    const dedupMap = new Map<string, NormalizedTradeInput>();
    for (const trade of trades) {
      dedupMap.set(trade.externalId, trade);
    }
    const uniqueTrades = Array.from(dedupMap.values());

    const externalIds = uniqueTrades.map((t) => t.externalId);
    const existingRows =
      externalIds.length > 0
        ? await this.prisma.trade.findMany({
            where: {
              accountId: options.accountId,
              externalId: { in: externalIds },
            },
          })
        : [];

    const existingByExternalId = new Map(existingRows.map((row) => [row.externalId, row]));

    if (options.dryRun) {
      let wouldInsert = 0;
      let wouldUpdate = 0;

      const preview = uniqueTrades.map((t) => {
        const exists = existingByExternalId.has(t.externalId);
        if (exists) wouldUpdate++;
        else wouldInsert++;

        return {
          externalId: t.externalId,
          symbol: t.symbol,
          direction: t.direction,
          volume: formatPrice(t.volume),
          openTime: t.openTime.toISOString(),
          closeTime: t.closeTime.toISOString(),
          openPrice: formatPrice(t.openPrice),
          closePrice: formatPrice(t.closePrice),
          netPnl: formatMoney(t.netPnl),
          action: exists ? ('UPDATE' as const) : ('INSERT' as const),
        };
      });

      return {
        dryRun: true,
        accountId: options.accountId,
        source: options.source,
        status: SyncStatus.SUCCESS,
        totalParsed: uniqueTrades.length,
        insertedCount: wouldInsert,
        updatedCount: wouldUpdate,
        skippedCount,
        warnings,
        preview,
      };
    }

    let insertedCount = 0;
    let updatedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const t of uniqueTrades) {
        const existing = existingByExternalId.get(t.externalId);

        if (!existing) {
          const risk = calculateRiskAndRMultiple({
            direction: t.direction,
            openPrice: t.openPrice,
            closePrice: t.closePrice,
            grossPnl: t.grossPnl,
            netPnl: t.netPnl,
            initialStopLoss: t.initialStopLoss,
            initialRiskAmount: t.initialRiskAmount,
          });

          await tx.trade.create({
            data: {
              accountId: options.accountId,
              externalId: t.externalId,
              symbol: t.symbol,
              direction: t.direction,
              volume: new Prisma.Decimal(t.volume.toFixed(8)),
              openTime: t.openTime,
              closeTime: t.closeTime,
              holdingSeconds: t.holdingSeconds,
              openPrice: new Prisma.Decimal(t.openPrice.toFixed(8)),
              closePrice: new Prisma.Decimal(t.closePrice.toFixed(8)),
              stopLoss: t.stopLoss ? new Prisma.Decimal(t.stopLoss.toFixed(8)) : null,
              takeProfit: t.takeProfit ? new Prisma.Decimal(t.takeProfit.toFixed(8)) : null,
              initialStopLoss: risk.initialStopLoss
                ? new Prisma.Decimal(risk.initialStopLoss.toFixed(8))
                : null,
              initialRiskAmount: risk.initialRiskAmount
                ? new Prisma.Decimal(risk.initialRiskAmount.toFixed(2))
                : null,
              rMultiple: risk.rMultiple ? new Prisma.Decimal(risk.rMultiple.toFixed(4)) : null,
              isManualRisk: false,
              grossPnl: new Prisma.Decimal(t.grossPnl.toFixed(2)),
              commission: new Prisma.Decimal(t.commission.toFixed(2)),
              swap: new Prisma.Decimal(t.swap.toFixed(2)),
              netPnl: new Prisma.Decimal(t.netPnl.toFixed(2)),
              source: options.source,
              rawPayload: t.rawPayload,
            },
          });
          insertedCount++;
        } else {
          // Idempotent update: NEVER overwrite user's `note`, `preTradePlan`, `postTradeReview`, `screenshotUrl`, `tags`, or manual risk
          const updateData: Prisma.TradeUpdateInput = {
            symbol: t.symbol,
            direction: t.direction,
            volume: new Prisma.Decimal(t.volume.toFixed(8)),
            openTime: t.openTime,
            closeTime: t.closeTime,
            holdingSeconds: t.holdingSeconds,
            openPrice: new Prisma.Decimal(t.openPrice.toFixed(8)),
            closePrice: new Prisma.Decimal(t.closePrice.toFixed(8)),
            stopLoss: t.stopLoss ? new Prisma.Decimal(t.stopLoss.toFixed(8)) : existing.stopLoss,
            takeProfit: t.takeProfit
              ? new Prisma.Decimal(t.takeProfit.toFixed(8))
              : existing.takeProfit,
            grossPnl: new Prisma.Decimal(t.grossPnl.toFixed(2)),
            commission: new Prisma.Decimal(t.commission.toFixed(2)),
            swap: new Prisma.Decimal(t.swap.toFixed(2)),
            netPnl: new Prisma.Decimal(t.netPnl.toFixed(2)),
            rawPayload: t.rawPayload,
          };

          if (existing.isManualRisk) {
            const existingSl = existing.initialStopLoss
              ? new Decimal(existing.initialStopLoss.toString())
              : null;
            const existingRisk = existing.initialRiskAmount
              ? new Decimal(existing.initialRiskAmount.toString())
              : null;
            const risk = calculateRiskAndRMultiple({
              direction: t.direction,
              openPrice: t.openPrice,
              closePrice: t.closePrice,
              grossPnl: t.grossPnl,
              netPnl: t.netPnl,
              initialStopLoss: existingSl,
              initialRiskAmount: existingRisk,
            });
            updateData.rMultiple = risk.rMultiple
              ? new Prisma.Decimal(risk.rMultiple.toFixed(4))
              : null;
          } else {
            const hasExistingRisk =
              existing.initialRiskAmount !== null || existing.initialStopLoss !== null;
            const incomingHasRisk = t.initialRiskAmount !== null || t.initialStopLoss !== null;

            const shouldPreferIncoming =
              t.initialRiskAmount !== null ||
              (!hasExistingRisk && incomingHasRisk) ||
              (options.source === TradeSource.MT5_WEBHOOK && incomingHasRisk);

            if (shouldPreferIncoming) {
              const risk = calculateRiskAndRMultiple({
                direction: t.direction,
                openPrice: t.openPrice,
                closePrice: t.closePrice,
                grossPnl: t.grossPnl,
                netPnl: t.netPnl,
                initialStopLoss: t.initialStopLoss,
                initialRiskAmount: t.initialRiskAmount,
              });
              updateData.initialStopLoss = risk.initialStopLoss
                ? new Prisma.Decimal(risk.initialStopLoss.toFixed(8))
                : null;
              updateData.initialRiskAmount = risk.initialRiskAmount
                ? new Prisma.Decimal(risk.initialRiskAmount.toFixed(2))
                : null;
              updateData.rMultiple = risk.rMultiple
                ? new Prisma.Decimal(risk.rMultiple.toFixed(4))
                : null;
            }
          }

          await tx.trade.update({
            where: { id: existing.id },
            data: updateData,
          });
          updatedCount++;
        }
      }

      // Sync account balance & equity:
      // 1) If live EA provided `accountBalance` / `accountEquity`, store directly (source of truth).
      // 2) Else if importing HTML/CSV without live EA balance, compute `initialBalance + sum(closedTrades.netPnl)`.
      const hasLiveBalance = options.accountBalance !== undefined && options.accountBalance !== null;
      const hasLiveEquity = options.accountEquity !== undefined && options.accountEquity !== null;

      if (hasLiveBalance || hasLiveEquity) {
        await tx.tradingAccount.update({
          where: { id: options.accountId },
          data: {
            ...(hasLiveBalance
              ? { currentBalance: new Prisma.Decimal(options.accountBalance!) }
              : {}),
            ...(hasLiveEquity
              ? { currentEquity: new Prisma.Decimal(options.accountEquity!) }
              : hasLiveBalance
                ? { currentEquity: new Prisma.Decimal(options.accountBalance!) }
                : {}),
          },
        });
      } else if (options.source === TradeSource.MT5_IMPORT && tx.tradingAccount && tx.trade.aggregate) {
        const account = await tx.tradingAccount.findUnique({
          where: { id: options.accountId },
        });
        if (account) {
          const agg = await tx.trade.aggregate({
            where: { accountId: options.accountId },
            _sum: { netPnl: true },
          });
          const sumPnl = new Decimal(agg._sum.netPnl?.toString() ?? '0');
          const computed = new Decimal(account.initialBalance.toString()).plus(sumPnl);
          const dec = new Prisma.Decimal(computed.toFixed(2));
          await tx.tradingAccount.update({
            where: { id: options.accountId },
            data: {
              currentBalance: dec,
              currentEquity: dec,
            },
          });
        }
      }
    });

    const status =
      warnings.length > 0 && uniqueTrades.length > 0
        ? SyncStatus.PARTIAL
        : uniqueTrades.length === 0 && warnings.length > 0
          ? SyncStatus.FAILED
          : SyncStatus.SUCCESS;

    const syncLog = await this.prisma.syncLog.create({
      data: {
        accountId: options.accountId,
        source: options.source,
        status,
        fileName: options.fileName ?? null,
        insertedCount,
        updatedCount,
        skippedCount,
        errorMessage: warnings.length > 0 ? warnings.slice(0, 20).join('\n') : null,
      },
    });

    return {
      dryRun: false,
      accountId: options.accountId,
      source: options.source,
      status,
      totalParsed: uniqueTrades.length,
      insertedCount,
      updatedCount,
      skippedCount,
      warnings,
      syncLogId: syncLog.id,
    };
  }

  async getSyncLogs(accountId?: string, limit = 30) {
    return this.prisma.syncLog.findMany({
      where: accountId ? { accountId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        account: {
          select: { id: true, name: true, accountNumber: true, platform: true },
        },
      },
    });
  }
}
