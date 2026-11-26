import { Prisma, TradeDirection, TradeSource } from '@prisma/client';
import { DefaultUserService } from '../common/default-user.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const defaultUser = {
    id: 'user-1',
    email: 'trader@trackdailytrade.local',
    name: 'Default Trader',
    displayTimezone: 'Asia/Ho_Chi_Minh',
  };

  const tagSss = { id: 'tag-1', name: 'Tier SSS', color: '#10b981' };
  const tagSmc = { id: 'tag-2', name: 'SMC MTF', color: '#8b5cf6' };

  const sampleTrades = [
    {
      id: 't1',
      accountId: 'acc-1',
      externalId: '1',
      symbol: 'XAUUSD',
      direction: TradeDirection.BUY,
      volume: new Prisma.Decimal('1.0'),
      // 01:30 UTC -> 08:30 Asia/Ho_Chi_Minh (Monday 2026-05-04)
      openTime: new Date('2026-05-04T01:30:00.000Z'),
      closeTime: new Date('2026-05-04T02:00:00.000Z'),
      holdingSeconds: 1800, // 30m -> bucket 15m-1h
      openPrice: new Prisma.Decimal('2500'),
      closePrice: new Prisma.Decimal('2510'),
      stopLoss: null,
      takeProfit: null,
      initialStopLoss: null,
      initialRiskAmount: new Prisma.Decimal('200.00'),
      rMultiple: new Prisma.Decimal('2.0000'),
      isManualRisk: false,
      grossPnl: new Prisma.Decimal('400.00'),
      commission: new Prisma.Decimal('0.00'),
      swap: new Prisma.Decimal('0.00'),
      netPnl: new Prisma.Decimal('400.00'),
      note: null,
      source: TradeSource.MT5_WEBHOOK,
      rawPayload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [{ tradeId: 't1', tagId: 'tag-1', tag: tagSss }],
    },
    {
      id: 't2',
      accountId: 'acc-1',
      externalId: '2',
      symbol: 'XAUUSD',
      direction: TradeDirection.SELL,
      volume: new Prisma.Decimal('1.0'),
      // 18:30 UTC on Mon -> 01:30 Asia/Ho_Chi_Minh on Tuesday 2026-05-05!
      openTime: new Date('2026-05-04T18:30:00.000Z'),
      closeTime: new Date('2026-05-04T18:34:00.000Z'),
      holdingSeconds: 240, // 4m -> bucket < 5m
      openPrice: new Prisma.Decimal('2510'),
      closePrice: new Prisma.Decimal('2516'),
      stopLoss: null,
      takeProfit: null,
      initialStopLoss: null,
      initialRiskAmount: new Prisma.Decimal('200.00'),
      rMultiple: new Prisma.Decimal('-3.0000'),
      isManualRisk: false,
      grossPnl: new Prisma.Decimal('-600.00'),
      commission: new Prisma.Decimal('0.00'),
      swap: new Prisma.Decimal('0.00'),
      netPnl: new Prisma.Decimal('-600.00'),
      note: null,
      source: TradeSource.MT5_WEBHOOK,
      rawPayload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [{ tradeId: 't2', tagId: 'tag-2', tag: tagSmc }],
    },
    {
      id: 't3',
      accountId: 'acc-1',
      externalId: '3',
      symbol: 'EURUSD',
      direction: TradeDirection.BUY,
      volume: new Prisma.Decimal('1.0'),
      openTime: new Date('2026-05-05T07:00:00.000Z'),
      closeTime: new Date('2026-05-05T09:00:00.000Z'),
      holdingSeconds: 7200, // 2h -> bucket 1h-4h
      openPrice: new Prisma.Decimal('1.1000'),
      closePrice: new Prisma.Decimal('1.1050'),
      stopLoss: null,
      takeProfit: null,
      initialStopLoss: null,
      initialRiskAmount: new Prisma.Decimal('200.00'),
      rMultiple: new Prisma.Decimal('2.5000'),
      isManualRisk: false,
      grossPnl: new Prisma.Decimal('500.00'),
      commission: new Prisma.Decimal('0.00'),
      swap: new Prisma.Decimal('0.00'),
      netPnl: new Prisma.Decimal('500.00'),
      note: null,
      source: TradeSource.MT5_WEBHOOK,
      rawPayload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [{ tradeId: 't3', tagId: 'tag-1', tag: tagSss }],
    },
  ];

  const createService = (priorPnlSum: string | null = null) => {
    const mockPrisma = {
      tradingAccount: {
        findMany: jest.fn(async () => [
          { id: 'acc-1', initialBalance: new Prisma.Decimal('10000.00') },
        ]),
      },
      trade: {
        aggregate: jest.fn(async () => ({
          _sum: {
            netPnl: priorPnlSum ? new Prisma.Decimal(priorPnlSum) : null,
          },
        })),
        findMany: jest.fn(async () => sampleTrades),
      },
    } as unknown as PrismaService;

    const mockDefaultUser = {
      getDefaultUser: jest.fn(async () => defaultUser),
    } as unknown as DefaultUserService;

    return {
      service: new AnalyticsService(mockPrisma, mockDefaultUser),
      mockPrisma,
    };
  };

  it('computes KPIs, Profit Factor, Expectancy, R-Multiple, and Max Drawdown accurately', async () => {
    const { service } = createService();

    const overview = await service.getOverview({ timezone: 'Asia/Ho_Chi_Minh' });

    expect(overview.totalTrades).toBe(3);
    expect(overview.winCount).toBe(2);
    expect(overview.lossCount).toBe(1);
    expect(overview.winRate).toBe(66.67);
    expect(overview.netPnl).toBe('300.00');
    expect(overview.grossProfit).toBe('900.00');
    expect(overview.grossLoss).toBe('-600.00');
    // PF = 900 / 600 = 1.5
    expect(overview.profitFactor).toBe(1.5);
    // Expectancy = 300 / 3 = 100.00
    expect(overview.expectancy).toBe('100.00');
    // Expectancy R = (2 - 3 + 2.5) / 3 = 0.5
    expect(overview.expectancyR).toBe(0.5);
    // Starting = 10000 -> t1: 10400 (peak 10400) -> t2: 9800 (dd 600, 600/10400 = 5.77%) -> t3: 10300
    expect(overview.startingEquity).toBe('10000.00');
    expect(overview.endingEquity).toBe('10300.00');
    expect(overview.maxDrawdownUsd).toBe('600.00');
    expect(overview.maxDrawdownPct).toBe(5.77);
  });

  it('adds prior closed netPnl into startingEquity when `from` filter is active', async () => {
    // Prior closed trades before `from` earned +2000 -> startingEquity = 10000 + 2000 = 12000
    const { service, mockPrisma } = createService('2000.00');

    const overview = await service.getOverview({
      from: '2026-05-04',
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(mockPrisma.trade.aggregate).toHaveBeenCalledTimes(1);
    expect(overview.startingEquity).toBe('12000.00');
    expect(overview.endingEquity).toBe('12300.00');
    // Peak after t1 = 12400 -> t2 drops 600 -> 600 / 12400 = 4.84%
    expect(overview.maxDrawdownUsd).toBe('600.00');
    expect(overview.maxDrawdownPct).toBe(4.84);
  });

  it('groups breakdowns and calendar accurately in Asia/Ho_Chi_Minh (UTC+7)', async () => {
    const { service } = createService();

    const breakdowns = await service.getBreakdowns({ timezone: 'Asia/Ho_Chi_Minh' });
    // t1 opened at 01:30 UTC -> 08:30 UTC+7
    expect(breakdowns.byHour[8].tradeCount).toBe(1);
    expect(breakdowns.byHour[8].netPnl).toBe('400.00');
    // t2 opened at 18:30 UTC Mon -> 01:30 UTC+7 Tue!
    expect(breakdowns.byHour[1].tradeCount).toBe(1);
    expect(breakdowns.byHour[1].netPnl).toBe('-600.00');

    const mon = breakdowns.byDayOfWeek.find((d) => d.key === 'mon')!;
    const tue = breakdowns.byDayOfWeek.find((d) => d.key === 'tue')!;
    expect(mon.tradeCount).toBe(1);
    expect(tue.tradeCount).toBe(2);

    // Holding duration buckets
    expect(breakdowns.byHoldingDuration.find((b) => b.key === 'lt_5m')?.tradeCount).toBe(1);
    expect(breakdowns.byHoldingDuration.find((b) => b.key === '15m_1h')?.tradeCount).toBe(1);
    expect(breakdowns.byHoldingDuration.find((b) => b.key === '1h_4h')?.tradeCount).toBe(1);

    // Tag breakdown sorted by netPnl DESC
    expect(breakdowns.byTag).toHaveLength(2);
    expect(breakdowns.byTag[0].label).toBe('Tier SSS');
    expect(breakdowns.byTag[0].netPnl).toBe('900.00');
    expect(breakdowns.byTag[0].avgR).toBe(2.25);

    // Session breakdown by UTC open hour:
    // t1 (01:30 UTC) -> Tokyo, t2 (18:30 UTC) -> New York, t3 (07:00 UTC) -> Tokyo
    const tokyo = breakdowns.bySession.find((s) => s.key === 'tokyo')!;
    const london = breakdowns.bySession.find((s) => s.key === 'london')!;
    const newYork = breakdowns.bySession.find((s) => s.key === 'new_york')!;
    expect(tokyo.tradeCount).toBe(2);
    expect(tokyo.netPnl).toBe('900.00');
    expect(london.tradeCount).toBe(0);
    expect(newYork.tradeCount).toBe(1);
    expect(newYork.netPnl).toBe('-600.00');

    // Calendar PnL in UTC+7: t2 closed at 18:34 UTC Mon -> 2026-05-05 in UTC+7!
    const calendar = await service.getCalendar({ timezone: 'Asia/Ho_Chi_Minh' });
    expect(calendar).toEqual([
      { date: '2026-05-04', netPnl: '400.00', tradeCount: 1, winCount: 1, lossCount: 0 },
      { date: '2026-05-05', netPnl: '-100.00', tradeCount: 2, winCount: 1, lossCount: 1 },
    ]);
  });

  it('reconciles startingEquity & endingEquity with live currentBalance without double-subtracting', async () => {
    // Account has live currentBalance = 48,164.14 after +300 netPnl from synced trades
    // Even if user mistakenly entered initialBalance = 48164, endingEquity MUST equal 48,164.14!
    const mockPrisma = {
      tradingAccount: {
        findMany: jest.fn(async () => [
          {
            id: 'acc-1',
            initialBalance: new Prisma.Decimal('48164.00'),
            currentBalance: new Prisma.Decimal('48164.14'),
          },
        ]),
      },
      trade: {
        groupBy: jest.fn(async () => [
          { accountId: 'acc-1', _sum: { netPnl: new Prisma.Decimal('300.00') } },
        ]),
        aggregate: jest.fn(async () => ({ _sum: { netPnl: null } })),
        findMany: jest.fn(async () => sampleTrades),
      },
    } as unknown as PrismaService;

    const mockDefaultUser = {
      getDefaultUser: jest.fn(async () => defaultUser),
    } as unknown as DefaultUserService;

    const service = new AnalyticsService(mockPrisma, mockDefaultUser);
    const overview = await service.getOverview({ timezone: 'Asia/Ho_Chi_Minh' });

    expect(overview.startingEquity).toBe('47864.14');
    expect(overview.endingEquity).toBe('48164.14');
    expect(overview.zellaScore.overall).toBeGreaterThan(0);
    expect(overview.zellaScore.metrics).toHaveLength(5);
  });

  it('computes 100k demo account (5059484297) with 4 losing XAUUSD trades (-$790) accurately as $99,210.00', async () => {
    const demoTrades = [
      { ...sampleTrades[0], id: 'd1', accountId: 'acc-5059484297', netPnl: new Prisma.Decimal('-300.00'), grossPnl: new Prisma.Decimal('-300.00') },
      { ...sampleTrades[0], id: 'd2', accountId: 'acc-5059484297', netPnl: new Prisma.Decimal('-320.00'), grossPnl: new Prisma.Decimal('-320.00') },
      { ...sampleTrades[0], id: 'd3', accountId: 'acc-5059484297', netPnl: new Prisma.Decimal('-80.00'), grossPnl: new Prisma.Decimal('-80.00') },
      { ...sampleTrades[0], id: 'd4', accountId: 'acc-5059484297', netPnl: new Prisma.Decimal('-90.00'), grossPnl: new Prisma.Decimal('-90.00') },
    ];

    const mockPrisma = {
      tradingAccount: {
        findMany: jest.fn(async () => [
          {
            id: 'acc-5059484297',
            initialBalance: new Prisma.Decimal('100000.00'),
            currentBalance: new Prisma.Decimal('99210.00'),
          },
        ]),
      },
      trade: {
        groupBy: jest.fn(async () => [
          { accountId: 'acc-5059484297', _sum: { netPnl: new Prisma.Decimal('-790.00') } },
        ]),
        aggregate: jest.fn(async () => ({ _sum: { netPnl: null } })),
        findMany: jest.fn(async () => demoTrades),
      },
    } as unknown as PrismaService;

    const mockDefaultUser = {
      getDefaultUser: jest.fn(async () => defaultUser),
    } as unknown as DefaultUserService;

    const service = new AnalyticsService(mockPrisma, mockDefaultUser);
    const overview = await service.getOverview({
      accountId: 'acc-5059484297',
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(overview.startingEquity).toBe('100000.00');
    expect(overview.endingEquity).toBe('99210.00');
    expect(overview.netPnl).toBe('-790.00');
    expect(overview.maxDrawdownUsd).toBe('790.00');
    expect(overview.maxDrawdownPct).toBe(0.79);
  });
});
