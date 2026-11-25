'use client';

import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EquityCurvePoint } from '@trackdailytrade/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTimeInTz } from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';

interface PnlUnderwaterChartProps {
  points: EquityCurvePoint[];
  currency: string;
  timezone: string;
  loading?: boolean;
}

export function PnlUnderwaterChart({
  points,
  currency,
  timezone,
  loading = false,
}: PnlUnderwaterChartProps) {
  const { theme, t } = usePreferences();
  const isDark = theme === 'dark';

  const data = React.useMemo(
    () =>
      points.map((p, idx) => ({
        index: idx + 1,
        label: `#${idx + 1}`,
        timestamp: p.timestamp,
        cumulativePnl: Number(p.cumulativePnl),
        underwaterUsd: -Math.abs(Number(p.drawdownUsd)),
        drawdownPct: p.drawdownPct,
        netPnl: p.netPnl,
      })),
    [points],
  );

  if (loading) {
    return <Skeleton className="h-[290px] w-full rounded-lg" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[270px] items-center justify-center rounded-xl border border-dashed border-border-strong bg-subtle text-xs text-fg-muted">
        {t.dashboard.emptyUnderwater}
      </div>
    );
  }

  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
  const axisStroke = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.10)';
  const tickColor = isDark ? '#8E8E98' : '#64748B';
  const refStroke = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.25)';

  return (
    <div className="h-[290px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id="cumPnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="underwaterGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.08} />
              <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.32} />
            </linearGradient>
          </defs>
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
            width={62}
          />
          <ReferenceLine y={0} stroke={refStroke} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: 'rgba(99, 102, 241, 0.45)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-xl border border-border-strong bg-popover p-3 text-xs text-fg shadow-float">
                  <p className="font-num font-semibold text-fg">
                    {t.dashboard.chartTrade} {row.label} · {formatDateTimeInTz(row.timestamp, timezone)}
                  </p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-fg-muted">Cumulative Net PnL</span>
                      <span
                        className={
                          row.cumulativePnl >= 0
                            ? 'font-num font-semibold text-profit'
                            : 'font-num font-semibold text-loss'
                        }
                      >
                        {formatCurrency(row.cumulativePnl, currency, true)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-fg-muted">Drawdown Underwater</span>
                      <span className="font-num font-semibold text-loss">
                        {formatCurrency(row.underwaterUsd, currency)} (-{row.drawdownPct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="underwaterUsd"
            stroke="#F43F5E"
            strokeWidth={1.5}
            fill="url(#underwaterGradient)"
            name="Drawdown"
          />
          <Area
            type="monotone"
            dataKey="cumulativePnl"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#cumPnlGradient)"
            name="Cumulative PnL"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
