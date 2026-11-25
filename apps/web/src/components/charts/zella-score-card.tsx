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
import { usePreferences } from '@/lib/preferences-context';

interface ZellaScoreCardProps {
  zellaScore: ZellaScoreSummary | null;
  totalTrades?: number;
  loading?: boolean;
}

export function ZellaScoreCard({
  zellaScore,
  totalTrades = 0,
  loading = false,
}: ZellaScoreCardProps) {
  const { theme, t } = usePreferences();
  const isDark = theme === 'dark';

  const score = zellaScore?.overall ?? 0;
  const badgeVariant =
    score >= 70 ? 'profit' : score >= 45 ? 'default' : score > 0 ? 'loss' : 'secondary';

  const localizedGrade = React.useMemo(() => {
    if (!zellaScore || totalTrades === 0) return t.dashboard.zellaGrades.notEnough;
    if (score >= 80) return t.dashboard.zellaGrades.excellent;
    if (score >= 65) return t.dashboard.zellaGrades.good;
    if (score >= 45) return t.dashboard.zellaGrades.average;
    return t.dashboard.zellaGrades.needsDiscipline;
  }, [zellaScore, totalTrades, score, t.dashboard.zellaGrades]);

  const localizedMetrics = React.useMemo(() => {
    if (!zellaScore) return [];
    const labelMap: Record<string, string> = t.dashboard.radarLabels;
    return zellaScore.metrics.map((m) => ({
      ...m,
      label: labelMap[m.key] ?? m.label,
    }));
  }, [zellaScore, t.dashboard.radarLabels]);

  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
            Zella Score · Consistency Radar
          </CardTitle>
          <CardDescription>{t.dashboard.zellaSubtitle}</CardDescription>
        </div>

        {!loading && zellaScore && (
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant}>{localizedGrade}</Badge>
            <span className="font-num text-2xl font-bold tracking-tight text-fg">
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
                <RadarChart cx="50%" cy="52%" outerRadius="72%" data={localizedMetrics}>
                  <PolarGrid
                    stroke={isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.12)'}
                  />
                  <PolarAngleAxis
                    dataKey="label"
                    tick={{ fill: isDark ? '#A1A1AA' : '#475569', fontSize: 11 }}
                  />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as (typeof localizedMetrics)[number];
                      return (
                        <div className="rounded-lg border border-border-strong bg-popover px-2.5 py-1.5 text-xs text-fg shadow-float">
                          <span className="text-fg-muted">{item.label}: </span>
                          <span className="font-num font-semibold text-fg">{item.score}/100</span>
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
                    fillOpacity={0.26}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-5 gap-1.5 border-t border-border pt-2.5 text-center">
              {localizedMetrics.map((m) => (
                <div key={m.key} className="rounded-md bg-subtle px-1.5 py-1.5">
                  <p className="truncate text-[10px] text-fg-muted">{m.label}</p>
                  <p className="font-num mt-0.5 text-xs font-semibold text-fg">{m.score}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
