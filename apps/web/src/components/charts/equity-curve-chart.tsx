'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ColorType,
  createChart,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { TrendingUp, Upload, Wallet } from 'lucide-react';
import type { EquityCurvePoint } from '@trackdailytrade/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTimeInTz, pnlColorClass } from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';

interface EquityCurveChartProps {
  startingEquity: string;
  points: EquityCurvePoint[];
  currency: string;
  timezone: string;
  loading?: boolean;
}

export function EquityCurveChart({
  startingEquity,
  points,
  currency,
  timezone,
  loading = false,
}: EquityCurveChartProps) {
  const { theme, t } = usePreferences();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = React.useState<EquityCurvePoint | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    const isDark = theme === 'dark';
    const chartBg = isDark ? '#111216' : '#FFFFFF';
    const textColor = isDark ? '#8E8E98' : '#64748B';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
    const scaleBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.10)';
    const labelBg = isDark ? '#16181D' : '#1E293B';
    const baselineColor = isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(15, 23, 42, 0.28)';

    const chart: IChartApi = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: chartBg },
        textColor,
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor, style: LineStyle.Dashed },
        horzLines: { color: gridColor, style: LineStyle.Dashed },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(99, 102, 241, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: labelBg,
        },
        horzLine: {
          color: 'rgba(99, 102, 241, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: labelBg,
        },
      },
      rightPriceScale: {
        borderColor: scaleBorder,
      },
      timeScale: {
        borderColor: scaleBorder,
        timeVisible: true,
        secondsVisible: false,
      },
      width: el.clientWidth,
      height: 310,
    });

    const lastEquity = Number(points[points.length - 1].equity);
    const startEq = Number(startingEquity);
    const isPositive = lastEquity >= startEq;

    const series = chart.addAreaSeries({
      lineColor: isPositive ? '#10B981' : '#F43F5E',
      topColor: isPositive ? 'rgba(16, 185, 129, 0.24)' : 'rgba(244, 63, 94, 0.22)',
      bottomColor: isPositive ? 'rgba(16, 185, 129, 0.01)' : 'rgba(244, 63, 94, 0.01)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    const timeToPoint = new Map<number, EquityCurvePoint>();
    let prevTs = 0;
    const seriesData = points.map((p) => {
      let ts = p.unixTime;
      if (ts <= prevTs) ts = prevTs + 1;
      prevTs = ts;
      timeToPoint.set(ts, p);
      return {
        time: ts as UTCTimestamp,
        value: Number(p.equity),
      };
    });

    series.setData(seriesData);

    series.createPriceLine({
      price: startEq,
      color: baselineColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: t.dashboard.chartStartLine,
    });

    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || typeof param.time !== 'number') {
        setHovered(null);
        return;
      }
      setHovered(timeToPoint.get(param.time) ?? null);
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [points, startingEquity, theme, t.dashboard.chartStartLine]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-[310px] w-full rounded-lg" />
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-[310px] flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-subtle px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-card">
          <TrendingUp className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-fg">{t.dashboard.emptyEquityTitle}</p>
        <p className="mt-1 max-w-md text-xs text-fg-muted">{t.dashboard.emptyEquityDesc}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/import">
            <Button size="sm">
              <Upload className="h-3.5 w-3.5" />
              {t.dashboard.ctaImportMt5}
            </Button>
          </Link>
          <Link href="/accounts">
            <Button size="sm" variant="secondary">
              <Wallet className="h-3.5 w-3.5" />
              {t.dashboard.ctaManageAccounts}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const activePoint = hovered ?? points[points.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-lg border border-border bg-elevated px-3.5 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-fg-muted">{t.dashboard.chartTime}</span>
          <span className="font-num text-fg">
            {formatDateTimeInTz(activePoint.timestamp, timezone)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-fg-muted">Equity</span>
          <span className="font-num font-semibold text-fg">
            {formatCurrency(activePoint.equity, currency)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-fg-muted">{t.dashboard.chartTrade}</span>
          <span className={`font-num font-semibold ${pnlColorClass(activePoint.netPnl)}`}>
            {formatCurrency(activePoint.netPnl, currency, true)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-fg-muted">Drawdown</span>
          <span className="font-num text-loss">
            -{formatCurrency(activePoint.drawdownUsd, currency)} ({activePoint.drawdownPct.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
    </div>
  );
}
