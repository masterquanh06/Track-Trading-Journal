'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BreakdownBucket } from '@trackdailytrade/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';

interface BreakdownBarChartProps {
  data: BreakdownBucket[];
  currency: string;
  hideZeroBuckets?: boolean;
  loading?: boolean;
}

export function BreakdownBarChart({
  data,
  currency,
  hideZeroBuckets = false,
  loading = false,
}: BreakdownBarChartProps) {
  const { theme, t } = usePreferences();
  const isDark = theme === 'dark';

  const chartData = React.useMemo(() => {
    const filtered = hideZeroBuckets ? data.filter((d) => d.tradeCount > 0) : data;
    return filtered.map((d) => ({
      ...d,
      netPnlNum: Number(d.netPnl),
    }));
  }, [data, hideZeroBuckets]);

  if (loading) {
    return <Skeleton className="h-[260px] w-full rounded-lg" />;
  }

  if (chartData.length === 0 || chartData.every((d) => d.tradeCount === 0)) {
    return (
      <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-border-strong bg-subtle text-xs text-fg-muted">
        {t.dashboard.emptyBreakdown}
      </div>
    );
  }

  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
  const axisStroke = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.10)';
  const tickColor = isDark ? '#8E8E98' : '#64748B';
  const refStroke = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.20)';
  const cursorFill = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)';

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: tickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={{ stroke: axisStroke }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: tickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={58}
          />
          <ReferenceLine y={0} stroke={refStroke} />
          <Tooltip
            cursor={{ fill: cursorFill }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload as BreakdownBucket & { netPnlNum: number };
              return (
                <div className="rounded-xl border border-border-strong bg-popover p-3 text-xs text-fg shadow-float">
                  <p className="font-semibold text-fg">{item.label}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-fg-muted">Net PnL</span>
                      <span
                        className={
                          item.netPnlNum >= 0
                            ? 'font-num font-semibold text-profit'
                            : 'font-num font-semibold text-loss'
                        }
                      >
                        {formatCurrency(item.netPnl, currency, true)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-fg-muted">{t.dashboard.colTrades}</span>
                      <span className="font-num text-fg">
                        {item.tradeCount} ({item.winCount}W / {item.lossCount}L)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-fg-muted">Win Rate</span>
                      <span className="font-num text-fg">{item.winRate.toFixed(1)}%</span>
                    </div>
                    {item.avgR !== null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-fg-muted">Avg R</span>
                        <span className="font-num text-fg">
                          {item.avgR >= 0 ? `+${item.avgR}` : item.avgR}R
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="netPnlNum" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {chartData.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.netPnlNum >= 0 ? '#10B981' : '#F43F5E'}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
