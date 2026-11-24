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
      <div className="flex h-[270px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[#0B0C0F]/50 text-xs text-zinc-500">
        Chưa có lệnh đóng để vẽ biểu đồ Cumulative Net PnL &amp; Drawdown Underwater.
      </div>
    );
  }

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
              <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.34} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255, 255, 255, 0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: '#71717A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#71717A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={62}
          />
          <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.22)" strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: 'rgba(99, 102, 241, 0.45)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-xl border border-white/[0.1] bg-[#16181D] p-3 text-xs shadow-[0_12px_36px_rgba(0,0,0,0.7)]">
                  <p className="font-num font-semibold text-zinc-200">
                    Lệnh {row.label} · {formatDateTimeInTz(row.timestamp, timezone)}
                  </p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-400">Cumulative Net PnL</span>
                      <span
                        className={
                          row.cumulativePnl >= 0
                            ? 'font-num font-semibold text-emerald-400'
                            : 'font-num font-semibold text-rose-400'
                        }
                      >
                        {formatCurrency(row.cumulativePnl, currency, true)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-400">Drawdown Underwater</span>
                      <span className="font-num font-semibold text-rose-400">
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
