import { Injectable } from '@nestjs/common';
import { Prisma, TradeDirection } from '@prisma/client';
import Decimal from 'decimal.js';
import { DateTime } from 'luxon';
import {
  AnalyticsBreakdownsResponse,
  AnalyticsFilterInput,
  AnalyticsOverview,
  BreakdownBucket,
  CalendarDaySummary,
  EquityCurvePoint,
  EquityCurveResponse,
  reconcileAccountCapital,
  SessionBreakdownItem,
  TagBreakdownItem,
  ZellaScoreSummary,
} from '@trackdailytrade/shared';
import { DefaultUserService } from '../common/default-user.service';
import { formatMoney } from '../common/decimal.util';
import {
  getZonedDateTime,
  normalizeTimezoneZone,
  parseFilterDateToUtc,
} from '../common/timezone.util';
import { PrismaService } from '../prisma/prisma.service';

type AnalyticsTradeRow = Prisma.TradeGetPayload<{
  include: {
    tags: {
      include: { tag: true };
    };
  };
}>;

interface BucketAccumulator {
  key: string;
  label: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  netPnl: Decimal;
  grossProfit: Decimal;
  grossLoss: Decimal;
  rSum: Decimal;
  rCount: number;
}

const HOLDING_BUCKETS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: 'lt_5m', label: '< 5m', min: 0, max: 300 },
  { key: '5m_15m', label: '5m–15m', min: 300, max: 900 },
  { key: '15m_1h', label: '15m–1h', min: 900, max: 3600 },
  { key: '1h_4h', label: '1h–4h', min: 3600, max: 14400 },
  { key: '4h_24h', label: '4h–24h', min: 14400, max: 86400 },
  { key: 'gt_24h', label: '> 24h', min: 86400, max: Number.POSITIVE_INFINITY },
];

const WEEKDAY_LABELS: Array<{ key: string; label: string; weekday: number }> = [
  { key: 'mon', label: 'Mon', weekday: 1 },
  { key: 'tue', label: 'Tue', weekday: 2 },
  { key: 'wed', label: 'Wed', weekday: 3 },
  { key: 'thu', label: 'Thu', weekday: 4 },
  { key: 'fri', label: 'Fri', weekday: 5 },
  { key: 'sat', label: 'Sat', weekday: 6 },
  { key: 'sun', label: 'Sun', weekday: 7 },
];

const TRADING_SESSIONS: Array<{
  key: 'tokyo' | 'london' | 'new_york';
  label: string;
  utcStart: number;
  utcEnd: number;
  utcHoursLabel: string;
  vnHoursLabel: string;
}> = [
  {
    key: 'tokyo',
    label: 'Tokyo (Phiên Á)',
    utcStart: 0,
    utcEnd: 8,
    utcHoursLabel: '00:00–08:00 UTC',
    vnHoursLabel: '07:00–15:00 VN',
  },
  {
    key: 'london',
    label: 'London (Phiên Âu)',
    utcStart: 8,
    utcEnd: 14,
    utcHoursLabel: '08:00–14:00 UTC',
    vnHoursLabel: '15:00–21:00 VN',
  },
  {
    key: 'new_york',
    label: 'New York (Phiên Mỹ)',
    utcStart: 14,
    utcEnd: 24,
    utcHoursLabel: '14:00–24:00 UTC',
    vnHoursLabel: '21:00–07:00 VN',
  },
];

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultUser: DefaultUserService,
  ) {}

  private createAccumulator(key: string, label: string): BucketAccumulator {
    return {
      key,
      label,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      netPnl: new Decimal(0),
      grossProfit: new Decimal(0),
      grossLoss: new Decimal(0),
      rSum: new Decimal(0),
      rCount: 0,
    };
  }

  private pushTradeToBucket(bucket: BucketAccumulator, trade: AnalyticsTradeRow) {
    const net = new Decimal(trade.netPnl.toString());
    bucket.tradeCount += 1;
    bucket.netPnl = bucket.netPnl.plus(net);

    if (net.greaterThan(0)) {
      bucket.winCount += 1;
      bucket.grossProfit = bucket.grossProfit.plus(net);
    } else if (net.lessThan(0)) {
      bucket.lossCount += 1;
      bucket.grossLoss = bucket.grossLoss.plus(net);
    }

    if (trade.rMultiple !== null) {
      bucket.rSum = bucket.rSum.plus(new Decimal(trade.rMultiple.toString()));
      bucket.rCount += 1;
    }
  }

  private finalizeBucket(acc: BucketAccumulator): BreakdownBucket {
    const winRate =
      acc.tradeCount > 0 ? Number(((acc.winCount / acc.tradeCount) * 100).toFixed(2)) : 0;
    const absLoss = acc.grossLoss.abs();
    const profitFactor = absLoss.greaterThan(0)
      ? Number(acc.grossProfit.div(absLoss).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber())
      : null;
    const avgR =
      acc.rCount > 0
        ? Number(acc.rSum.div(acc.rCount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber())
        : null;

    return {
      key: acc.key,
      label: acc.label,
      tradeCount: acc.tradeCount,
      winCount: acc.winCount,
      lossCount: acc.lossCount,
      winRate,
      netPnl: formatMoney(acc.netPnl),
      profitFactor,
      avgR,
    };
  }

  private async loadFilteredContext(
    filter: AnalyticsFilterInput,
    overrideDateRange?: { fromUtc: Date; toUtc: Date },
  ): Promise<{
    displayTimezone: string;
    startingEquity: Decimal;
    trades: AnalyticsTradeRow[];
  }> {
    const user = await this.defaultUser.getDefaultUser();
    const displayTimezone = filter.timezone || user.displayTimezone || 'Asia/Ho_Chi_Minh';

    const accounts = await this.prisma.tradingAccount.findMany({
      where: {
        userId: user.id,
        ...(filter.accountId ? { id: filter.accountId } : {}),
      },
      select: { id: true, initialBalance: true, currentBalance: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Anchor each account's base balance before synced trades:
    // If `currentBalance` is synced from live MT5 EA, `base = currentBalance - allTimeSyncedNetPnl`
    // so endingEquity matches live MT5 balance (never double-subtracts PnL).
    const hasAnyLiveBalance = accounts.some(
      (a) => a.currentBalance !== undefined && a.currentBalance !== null,
    );
    const allTimePnlByAcc = new Map<string, Decimal>();

    if (hasAnyLiveBalance && accountIds.length > 0 && typeof this.prisma.trade.groupBy === 'function') {
      const grouped = await this.prisma.trade.groupBy({
        by: ['accountId'],
        where: { accountId: { in: accountIds } },
        _sum: { netPnl: true },
      });
      for (const g of grouped) {
        allTimePnlByAcc.set(g.accountId, new Decimal(g._sum.netPnl?.toString() ?? '0'));
      }
    }

    let startingEquity = accounts.reduce((sum, acc) => {
      const allTimePnl = allTimePnlByAcc.get(acc.id) ?? new Decimal(0);
      const reconciled = reconcileAccountCapital({
        initialBalance: acc.initialBalance.toString(),
        storedLiveBalance: acc.currentBalance?.toString() ?? null,
        allTimeClosedNetPnl: allTimePnl.toString(),
      });
      return sum.plus(new Decimal(reconciled.baseBalanceBeforeTrades));
    }, new Decimal(0));

    const fromUtc =
      overrideDateRange?.fromUtc ??
      (filter.from ? parseFilterDateToUtc(filter.from, displayTimezone, 'start') : undefined);
    const toUtc =
      overrideDateRange?.toUtc ??
      (filter.to ? parseFilterDateToUtc(filter.to, displayTimezone, 'end') : undefined);

    if (fromUtc && accountIds.length > 0) {
      const priorAgg = await this.prisma.trade.aggregate({
        where: {
          accountId: { in: accountIds },
          closeTime: { lt: fromUtc },
        },
        _sum: { netPnl: true },
      });

      if (priorAgg._sum.netPnl) {
        startingEquity = startingEquity.plus(new Decimal(priorAgg._sum.netPnl.toString()));
      }
    }

    if (accountIds.length === 0) {
      return { displayTimezone, startingEquity, trades: [] };
    }

    const where: Prisma.TradeWhereInput = {
      accountId: { in: accountIds },
    };

    if (fromUtc || toUtc) {
      where.closeTime = {
        ...(fromUtc ? { gte: fromUtc } : {}),
        ...(toUtc ? { lte: toUtc } : {}),
      };
    }

    if (filter.symbol) {
      where.symbol = { equals: filter.symbol, mode: 'insensitive' };
    }

    if (filter.direction) {
      where.direction = filter.direction as TradeDirection;
    }

    if (filter.tagIds && filter.tagIds.length > 0) {
      where.tags = {
        some: {
          tagId: { in: filter.tagIds },
        },
      };
    }

    const trades = await this.prisma.trade.findMany({
      where,
      orderBy: [{ closeTime: 'asc' }, { id: 'asc' }],
      include: {
        tags: { include: { tag: true } },
      },
    });

    return { displayTimezone, startingEquity, trades };
  }

  private computeEquitySeries(startingEquity: Decimal, trades: AnalyticsTradeRow[]) {
    let currentEquity = startingEquity;
    let cumulativePnl = new Decimal(0);
    let peakEquity = startingEquity;
    let maxDrawdownUsd = new Decimal(0);
    let maxDrawdownPct = new Decimal(0);

    const points: EquityCurvePoint[] = trades.map((trade) => {
      const net = new Decimal(trade.netPnl.toString());
      cumulativePnl = cumulativePnl.plus(net);
      currentEquity = currentEquity.plus(net);

      if (currentEquity.greaterThan(peakEquity)) {
        peakEquity = currentEquity;
      }

      const drawdownUsd = peakEquity.minus(currentEquity);
      const drawdownPct = peakEquity.greaterThan(0)
        ? drawdownUsd.div(peakEquity).mul(100)
        : new Decimal(0);

      if (drawdownUsd.greaterThan(maxDrawdownUsd)) {
        maxDrawdownUsd = drawdownUsd;
      }
      if (drawdownPct.greaterThan(maxDrawdownPct)) {
        maxDrawdownPct = drawdownPct;
      }

      return {
        tradeId: trade.id,
        timestamp: trade.closeTime.toISOString(),
        unixTime: Math.floor(trade.closeTime.getTime() / 1000),
        netPnl: formatMoney(net),
        cumulativePnl: formatMoney(cumulativePnl),
        equity: formatMoney(currentEquity),
        drawdownUsd: formatMoney(drawdownUsd),
        drawdownPct: Number(drawdownPct.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()),
      };
    });

    return {
      points,
      endingEquity: currentEquity,
      maxDrawdownUsd,
      maxDrawdownPct: Number(maxDrawdownPct.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()),
    };
  }

  private computeZellaScore(params: {
    totalTrades: number;
    winRate: number;
    profitFactor: number | null;
    grossProfit: Decimal;
    avgWin: Decimal;
    avgLoss: Decimal;
    maxDrawdownPct: number;
    tradesWithRiskCount: number;
    netPnl: Decimal;
  }): ZellaScoreSummary {
    if (params.totalTrades === 0) {
      return {
        overall: 0,
        grade: 'Chưa đủ lệnh',
        metrics: [
          { key: 'winRate', label: 'Win Rate', score: 0 },
          { key: 'profitFactor', label: 'Profit Factor', score: 0 },
          { key: 'payoffRatio', label: 'Avg W/L', score: 0 },
          { key: 'riskDiscipline', label: 'Kỷ luật SL', score: 0 },
          { key: 'consistency', label: 'Ổn định', score: 0 },
        ],
      };
    }

    const winRateScore = clampScore((params.winRate / 65) * 100);

    const pfScore =
      params.profitFactor !== null
        ? clampScore((params.profitFactor / 2.5) * 100)
        : params.grossProfit.greaterThan(0)
          ? 100
          : 0;

    const absAvgLoss = params.avgLoss.abs();
    const payoffRatio = absAvgLoss.greaterThan(0)
      ? params.avgWin.div(absAvgLoss).toNumber()
      : params.avgWin.greaterThan(0)
        ? 2.5
        : 0;
    const payoffScore = clampScore((payoffRatio / 2.0) * 100);

    const slAdherencePct = (params.tradesWithRiskCount / params.totalTrades) * 100;
    const ddControlScore = Math.max(0, 100 - params.maxDrawdownPct * 2.2);
    const riskDisciplineScore = clampScore(slAdherencePct * 0.55 + ddControlScore * 0.45);

    const consistencyRaw = params.netPnl.greaterThan(0)
      ? 60 + Math.min(40, (params.profitFactor ?? 2.5) * 15) - params.maxDrawdownPct * 0.8
      : Math.max(10, 48 - params.maxDrawdownPct * 1.2 + params.winRate * 0.25);
    const consistencyScore = clampScore(consistencyRaw);

    const overall = clampScore(
      winRateScore * 0.2 +
        pfScore * 0.25 +
        payoffScore * 0.2 +
        riskDisciplineScore * 0.2 +
        consistencyScore * 0.15,
    );

    const grade =
      overall >= 80
        ? 'Xuất sắc'
        : overall >= 65
          ? 'Tốt'
          : overall >= 45
            ? 'Trung bình'
            : 'Cần kỷ luật';

    return {
      overall,
      grade,
      metrics: [
        { key: 'winRate', label: 'Win Rate', score: winRateScore },
        { key: 'profitFactor', label: 'Profit Factor', score: pfScore },
        { key: 'payoffRatio', label: 'Avg W/L', score: payoffScore },
        { key: 'riskDiscipline', label: 'Kỷ luật SL', score: riskDisciplineScore },
        { key: 'consistency', label: 'Ổn định', score: consistencyScore },
      ],
    };
  }

  async getOverview(filter: AnalyticsFilterInput): Promise<AnalyticsOverview> {
    const { startingEquity, trades } = await this.loadFilteredContext(filter);

    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let netPnl = new Decimal(0);
    let grossProfit = new Decimal(0);
    let grossLoss = new Decimal(0);
    let largestWin = new Decimal(0);
    let largestLoss = new Decimal(0);
    let totalHoldingSeconds = 0;
    let rSum = new Decimal(0);
    let rCount = 0;
    let tradesWithRiskCount = 0;

    for (const t of trades) {
      const net = new Decimal(t.netPnl.toString());
      netPnl = netPnl.plus(net);
      totalHoldingSeconds += t.holdingSeconds;

      if (net.greaterThan(0)) {
        winCount += 1;
        grossProfit = grossProfit.plus(net);
        if (net.greaterThan(largestWin)) largestWin = net;
      } else if (net.lessThan(0)) {
        lossCount += 1;
        grossLoss = grossLoss.plus(net);
        if (net.lessThan(largestLoss)) largestLoss = net;
      } else {
        breakevenCount += 1;
      }

      if (t.stopLoss !== null || t.initialStopLoss !== null || t.rMultiple !== null) {
        tradesWithRiskCount += 1;
      }

      if (t.rMultiple !== null) {
        rSum = rSum.plus(new Decimal(t.rMultiple.toString()));
        rCount += 1;
      }
    }

    const totalTrades = trades.length;
    const winRate =
      totalTrades > 0 ? Number(((winCount / totalTrades) * 100).toFixed(2)) : 0;

    const absGrossLoss = grossLoss.abs();
    const profitFactor = absGrossLoss.greaterThan(0)
      ? Number(grossProfit.div(absGrossLoss).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber())
      : null;

    const avgWin = winCount > 0 ? grossProfit.div(winCount) : new Decimal(0);
    const avgLoss = lossCount > 0 ? grossLoss.div(lossCount) : new Decimal(0);
    const expectancy = totalTrades > 0 ? netPnl.div(totalTrades) : new Decimal(0);
    const expectancyR =
      rCount > 0
        ? Number(rSum.div(rCount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber())
        : null;
    const avgHoldingSeconds =
      totalTrades > 0 ? Math.round(totalHoldingSeconds / totalTrades) : 0;

    const equityStats = this.computeEquitySeries(startingEquity, trades);

    const zellaScore = this.computeZellaScore({
      totalTrades,
      winRate,
      profitFactor,
      grossProfit,
      avgWin,
      avgLoss,
      maxDrawdownPct: equityStats.maxDrawdownPct,
      tradesWithRiskCount,
      netPnl,
    });

    return {
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      winRate,
      netPnl: formatMoney(netPnl),
      grossProfit: formatMoney(grossProfit),
      grossLoss: formatMoney(grossLoss),
      profitFactor,
      expectancy: formatMoney(expectancy),
      expectancyR,
      avgWin: formatMoney(avgWin),
      avgLoss: formatMoney(avgLoss),
      largestWin: formatMoney(largestWin),
      largestLoss: formatMoney(largestLoss),
      avgHoldingSeconds,
      startingEquity: formatMoney(startingEquity),
      endingEquity: formatMoney(equityStats.endingEquity),
      maxDrawdownUsd: formatMoney(equityStats.maxDrawdownUsd),
      maxDrawdownPct: equityStats.maxDrawdownPct,
      zellaScore,
    };
  }

  async getEquityCurve(filter: AnalyticsFilterInput): Promise<EquityCurveResponse> {
    const { startingEquity, trades } = await this.loadFilteredContext(filter);
    const { points } = this.computeEquitySeries(startingEquity, trades);

    return {
      startingEquity: formatMoney(startingEquity),
      points,
    };
  }

  async getCalendar(
    filter: AnalyticsFilterInput,
    month?: string,
  ): Promise<CalendarDaySummary[]> {
    const zone = normalizeTimezoneZone(filter.timezone || 'Asia/Ho_Chi_Minh');
    let overrideRange: { fromUtc: Date; toUtc: Date } | undefined;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const startOfMonth = DateTime.fromFormat(month, 'yyyy-MM', { zone }).startOf('month');
      if (startOfMonth.isValid) {
        overrideRange = {
          fromUtc: startOfMonth.toUTC().toJSDate(),
          toUtc: startOfMonth.endOf('month').toUTC().toJSDate(),
        };
      }
    }

    const { displayTimezone, trades } = await this.loadFilteredContext(filter, overrideRange);

    const byDate = new Map<
      string,
      { netPnl: Decimal; tradeCount: number; winCount: number; lossCount: number }
    >();

    for (const t of trades) {
      const dateKey = getZonedDateTime(t.closeTime, displayTimezone).toFormat('yyyy-MM-dd');
      const entry = byDate.get(dateKey) ?? {
        netPnl: new Decimal(0),
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
      };
      const net = new Decimal(t.netPnl.toString());
      entry.netPnl = entry.netPnl.plus(net);
      entry.tradeCount += 1;
      if (net.greaterThan(0)) entry.winCount += 1;
      else if (net.lessThan(0)) entry.lossCount += 1;

      byDate.set(dateKey, entry);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        netPnl: formatMoney(data.netPnl),
        tradeCount: data.tradeCount,
        winCount: data.winCount,
        lossCount: data.lossCount,
      }));
  }

  async getBreakdowns(filter: AnalyticsFilterInput): Promise<AnalyticsBreakdownsResponse> {
    const { displayTimezone, trades } = await this.loadFilteredContext(filter);

    const hourBuckets = Array.from({ length: 24 }, (_, h) => {
      const label = `${String(h).padStart(2, '0')}:00`;
      return this.createAccumulator(String(h).padStart(2, '0'), label);
    });

    const dayBuckets = new Map<number, BucketAccumulator>(
      WEEKDAY_LABELS.map((w) => [w.weekday, this.createAccumulator(w.key, w.label)]),
    );

    const holdingBuckets = HOLDING_BUCKETS.map((b) => this.createAccumulator(b.key, b.label));

    const sessionBuckets = new Map<string, BucketAccumulator>(
      TRADING_SESSIONS.map((s) => [s.key, this.createAccumulator(s.key, s.label)]),
    );

    const tagBuckets = new Map<string, { acc: BucketAccumulator; color: string }>();

    for (const t of trades) {
      const openZoned = getZonedDateTime(t.openTime, displayTimezone);
      const utcHour = t.openTime.getUTCHours();

      // 1. Hour of Day (openTime in displayTimezone)
      const hourIdx = openZoned.hour;
      if (hourBuckets[hourIdx]) {
        this.pushTradeToBucket(hourBuckets[hourIdx], t);
      }

      // 2. Day of Week (1=Mon .. 7=Sun)
      const dayAcc = dayBuckets.get(openZoned.weekday);
      if (dayAcc) {
        this.pushTradeToBucket(dayAcc, t);
      }

      // 3. Holding Duration bucket
      const holdIdx = HOLDING_BUCKETS.findIndex(
        (b) => t.holdingSeconds >= b.min && t.holdingSeconds < b.max,
      );
      if (holdIdx >= 0) {
        this.pushTradeToBucket(holdingBuckets[holdIdx], t);
      }

      // 4. Trading Session (Tokyo / London / New York based on UTC open hour)
      const matchedSession = TRADING_SESSIONS.find(
        (s) => utcHour >= s.utcStart && utcHour < s.utcEnd,
      );
      if (matchedSession) {
        const sAcc = sessionBuckets.get(matchedSession.key);
        if (sAcc) this.pushTradeToBucket(sAcc, t);
      }

      // 5. Strategy Tags
      for (const tt of t.tags) {
        const tag = tt.tag;
        let existing = tagBuckets.get(tag.id);
        if (!existing) {
          existing = {
            acc: this.createAccumulator(tag.id, tag.name),
            color: tag.color,
          };
          tagBuckets.set(tag.id, existing);
        }
        this.pushTradeToBucket(existing.acc, t);
      }
    }

    const bySession: SessionBreakdownItem[] = TRADING_SESSIONS.map((s) => ({
      ...this.finalizeBucket(sessionBuckets.get(s.key)!),
      utcHoursLabel: s.utcHoursLabel,
      vnHoursLabel: s.vnHoursLabel,
    }));

    const byTag: TagBreakdownItem[] = Array.from(tagBuckets.entries())
      .map(([tagId, entry]) => ({
        ...this.finalizeBucket(entry.acc),
        tagId,
        color: entry.color,
      }))
      .sort((a, b) => new Decimal(b.netPnl).comparedTo(new Decimal(a.netPnl)));

    return {
      byHour: hourBuckets.map((b) => this.finalizeBucket(b)),
      byDayOfWeek: WEEKDAY_LABELS.map((w) => this.finalizeBucket(dayBuckets.get(w.weekday)!)),
      byHoldingDuration: holdingBuckets.map((b) => this.finalizeBucket(b)),
      bySession,
      byTag,
    };
  }
}
