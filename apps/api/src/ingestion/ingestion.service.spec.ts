import { Prisma, SyncStatus, TradeDirection, TradeSource } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizedTradeInput } from './interfaces/trade-ingestion-adapter.interface';
import { TradeIngestionService } from './ingestion.service';

describe('TradeIngestionService', () => {
  const buildNormalizedTrade = (overrides: Partial<NormalizedTradeInput> = {}): NormalizedTradeInput => ({
    externalId: 'pos-1001',
    symbol: 'XAUUSD',
    direction: TradeDirection.BUY,
    volume: new Decimal('1.00'),
    openTime: new Date('2026-05-10T08:00:00.000Z'),
    closeTime: new Date('2026-05-10T09:00:00.000Z'),
    holdingSeconds: 3600,
    openPrice: new Decimal('2500.00'),
    closePrice: new Decimal('2520.00'),
    stopLoss: new Decimal('2500.00'),
    takeProfit: new Decimal('2530.00'),
    initialStopLoss: new Decimal('2490.00'),
    initialRiskAmount: new Decimal('1000.00'),
    grossPnl: new Decimal('2000.00'),
    commission: new Decimal('-7.00'),
    swap: new Decimal('0.00'),
    netPnl: new Decimal('1993.00'),
    rawPayload: { test: true },
    ...overrides,
  });

  it('preserves user note, pre/post review, screenshot, tags, and manual risk fields on re-sync', async () => {
    const updateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const createCalls: Array<{ data: Record<string, unknown> }> = [];

    const existingTrade = {
      id: 'trade-1',
      accountId: 'acc-1',
      externalId: 'pos-1001',
      isManualRisk: true,
      initialStopLoss: new Prisma.Decimal('2495.00000000'),
      initialRiskAmount: new Prisma.Decimal('500.00'),
      stopLoss: new Prisma.Decimal('2500.00000000'),
      takeProfit: new Prisma.Decimal('2530.00000000'),
      note: 'Tier SSS setup - clean liquidity sweep',
      preTradePlan: 'Wait M5 BOS',
      postTradeReview: 'Held to target',
      screenshotUrl: 'https://www.tradingview.com/x/test1234/',
    };

    const mockTx = {
      trade: {
        create: jest.fn(async (args) => {
          createCalls.push(args);
          return args.data;
        }),
        update: jest.fn(async (args) => {
          updateCalls.push(args);
          return args.data;
        }),
      },
      tradingAccount: {
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const mockPrisma = {
      trade: {
        findMany: jest.fn(async () => [existingTrade]),
      },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
      syncLog: {
        create: jest.fn(async () => ({ id: 'log-1' })),
      },
    } as unknown as PrismaService;

    const service = new TradeIngestionService(mockPrisma);

    const summary = await service.ingestTrades([buildNormalizedTrade()], {
      accountId: 'acc-1',
      source: TradeSource.MT5_WEBHOOK,
    });

    expect(summary.status).toBe(SyncStatus.SUCCESS);
    expect(summary.insertedCount).toBe(0);
    expect(summary.updatedCount).toBe(1);
    expect(createCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);

    const updateData = updateCalls[0].data;
    expect(updateData.note).toBeUndefined();
    expect(updateData.preTradePlan).toBeUndefined();
    expect(updateData.postTradeReview).toBeUndefined();
    expect(updateData.screenshotUrl).toBeUndefined();
    expect(updateData.tags).toBeUndefined();
    expect(updateData.initialStopLoss).toBeUndefined();
    expect(updateData.initialRiskAmount).toBeUndefined();
    expect((updateData.rMultiple as Prisma.Decimal).toFixed(4)).toBe('3.9860');
  });

  it('sets currentBalance & currentEquity directly from live MT5 EA without double-subtracting PnL', async () => {
    const accountUpdateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const mockTx = {
      trade: {
        create: jest.fn(async (args) => args.data),
        update: jest.fn(),
      },
      tradingAccount: {
        update: jest.fn(async (args) => {
          accountUpdateCalls.push(args);
          return args.data;
        }),
      },
    };

    const mockPrisma = {
      trade: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
      syncLog: { create: jest.fn(async () => ({ id: 'log-live' })) },
    } as unknown as PrismaService;

    const service = new TradeIngestionService(mockPrisma);

    // Account had -$51,839.86 closed loss, MT5 live balance is $48,164.14 (after deposits / 100k start)
    await service.ingestTrades(
      [
        buildNormalizedTrade({
          grossPnl: new Decimal('-51839.86'),
          commission: new Decimal('0'),
          netPnl: new Decimal('-51839.86'),
        }),
      ],
      {
        accountId: 'acc-demo',
        source: TradeSource.MT5_WEBHOOK,
        accountBalance: '48164.14',
        accountEquity: '48164.14',
      },
    );

    expect(accountUpdateCalls).toHaveLength(1);
    expect((accountUpdateCalls[0].data.currentBalance as Prisma.Decimal).toFixed(2)).toBe(
      '48164.14',
    );
    expect((accountUpdateCalls[0].data.currentEquity as Prisma.Decimal).toFixed(2)).toBe(
      '48164.14',
    );
  });

  it('does NOT write synthetic currentBalance on HTML/CSV import without statement balance summary', async () => {
    const accountUpdateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const mockTx = {
      trade: {
        create: jest.fn(async (args) => args.data),
        update: jest.fn(),
        aggregate: jest.fn(async () => ({
          _sum: { netPnl: new Prisma.Decimal('1250.50') },
        })),
      },
      tradingAccount: {
        findUnique: jest.fn(async () => ({
          id: 'acc-import',
          initialBalance: new Prisma.Decimal('10000.00'),
        })),
        update: jest.fn(async (args) => {
          accountUpdateCalls.push(args);
          return args.data;
        }),
      },
    };

    const mockPrisma = {
      trade: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
      syncLog: { create: jest.fn(async () => ({ id: 'log-imp' })) },
    } as unknown as PrismaService;

    const service = new TradeIngestionService(mockPrisma);

    await service.ingestTrades([buildNormalizedTrade({ netPnl: new Decimal('1250.50') })], {
      accountId: 'acc-import',
      source: TradeSource.MT5_IMPORT,
      fileName: 'ReportHistory.csv',
    });

    // No broker balance/equity provided -> do not pollute currentBalance with synthetic initialBalance + PnL
    expect(accountUpdateCalls).toHaveLength(0);
  });

  it('updates ONLY the targeted account with exact initialCapital, balance, and equity across multi-account sync', async () => {
    const accountUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];

    const accountRows: Record<string, { id: string; initialBalance: Prisma.Decimal }> = {
      'acc-akira': { id: 'acc-akira', initialBalance: new Prisma.Decimal('377.00') },
      'acc-demo2': { id: 'acc-demo2', initialBalance: new Prisma.Decimal('10000.00') },
    };

    const mockTx = {
      trade: {
        create: jest.fn(async (args) => args.data),
        update: jest.fn(),
        aggregate: jest.fn(async ({ where }: { where: { accountId: string } }) => ({
          _sum: {
            netPnl:
              where.accountId === 'acc-demo2'
                ? new Prisma.Decimal('-790.00')
                : new Prisma.Decimal('0.00'),
          },
        })),
      },
      tradingAccount: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => accountRows[where.id]),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          accountUpdateCalls.push(args);
          return args.data;
        }),
      },
    };

    const mockPrisma = {
      trade: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
      syncLog: { create: jest.fn(async () => ({ id: 'log-demo2' })) },
    } as unknown as PrismaService;

    const service = new TradeIngestionService(mockPrisma);

    await service.ingestTrades(
      [
        buildNormalizedTrade({ externalId: '9001', netPnl: new Decimal('-300.00'), grossPnl: new Decimal('-300.00'), commission: new Decimal('0') }),
        buildNormalizedTrade({ externalId: '9002', netPnl: new Decimal('-320.00'), grossPnl: new Decimal('-320.00'), commission: new Decimal('0') }),
        buildNormalizedTrade({ externalId: '9003', netPnl: new Decimal('-80.00'), grossPnl: new Decimal('-80.00'), commission: new Decimal('0') }),
        buildNormalizedTrade({ externalId: '9004', netPnl: new Decimal('-90.00'), grossPnl: new Decimal('-90.00'), commission: new Decimal('0') }),
      ],
      {
        accountId: 'acc-demo2',
        source: TradeSource.MT5_WEBHOOK,
        initialCapital: '100000.00',
        accountBalance: '99210.00',
        accountEquity: '99210.00',
        currency: 'USD',
      },
    );

    expect(accountUpdateCalls).toHaveLength(1);
    expect(accountUpdateCalls[0].where).toEqual({ id: 'acc-demo2' });
    expect((accountUpdateCalls[0].data.initialBalance as Prisma.Decimal).toFixed(2)).toBe('100000.00');
    expect((accountUpdateCalls[0].data.currentBalance as Prisma.Decimal).toFixed(2)).toBe('99210.00');
    expect((accountUpdateCalls[0].data.currentEquity as Prisma.Decimal).toFixed(2)).toBe('99210.00');
    expect(accountUpdateCalls[0].data.currency).toBe('USD');
  });
});
