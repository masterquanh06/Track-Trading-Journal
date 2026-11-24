'use client';

import * as React from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ShieldCheck } from 'lucide-react';
import type { ZellaScoreSummary } from '@trackdailytrade/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ZellaScoreCardProps {
  zellaScore: ZellaScoreSummary | null;
  loading?: boolean;
}

export function ZellaScoreCard({ zellaScore, loading = false }: ZellaScoreCardProps) {
  const score = zellaScore?.overall ?? 0;
  const badgeVariant =
    score >= 70 ? 'profit' : score >= 45 ? 'default' : score > 0 ? 'loss' : 'secondary';

  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            Zella Score · Consistency Radar
          </CardTitle>
          <CardDescription>
            Chấm điểm kỷ luật &amp; hiệu quả tổng hợp (0–100)
          </CardDescription>
        </div>

        {!loading && zellaScore && (
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant}>{zellaScore.grade}</Badge>
            <span className="font-num text-2xl font-bold tracking-tight text-white">
              {zellaScore.overall}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3 pt-2">
        {loading || !zellaScore ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : (
          <>
            <div className="h-[205px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="52%" outerRadius="72%" data={zellaScore.metrics}>
                  <PolarGrid stroke="rgba(255, 255, 255, 0.08)" />
                  <PolarAngleAxis
                    dataKey="label"
                    tick={{ fill: '#A1A1AA', fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as ZellaScoreSummary['metrics'][number];
                      return (
                        <div className="rounded-lg border border-white/[0.1] bg-[#16181D] px-2.5 py-1.5 text-xs shadow-lg">
                          <span className="text-zinc-400">{item.label}: </span>
                          <span className="font-num font-semibold text-white">
                            {item.score}/100
                          </span>
                        </div>
                      );
                    }}
                  />
                  <Radar
                    name="Zella Score"
                    dataKey="score"
                    stroke="#6366F1"
                    strokeWidth={2}
                    fill="#6366F1"
                    fillOpacity={0.28}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-5 gap-1.5 border-t border-white/[0.06] pt-2.5 text-center">
              {zellaScore.metrics.map((m) => (
                <div key={m.key} className="rounded-md bg-white/[0.02] px-1.5 py-1.5">
                  <p className="truncate text-[10px] text-zinc-500">{m.label}</p>
                  <p className="font-num mt-0.5 text-xs font-semibold text-zinc-100">{m.score}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
