'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatShortDate } from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  const { locale, t } = usePreferences();
  const [open, setOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState(from);
  const [draftTo, setDraftTo] = React.useState(to);
  const [hoverDate, setHoverDate] = React.useState<string | null>(null);
  const [viewMonth, setViewMonth] = React.useState(() => {
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      const [y, m] = from.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  React.useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
      setHoverDate(null);
    }
  }, [open, from, to]);

  const cells = React.useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;

    const result: Array<{ ymd: string | null; day: number | null }> = [];
    for (let i = 0; i < offset; i++) result.push({ ymd: null, day: null });
    for (let d = 1; d <= total; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      result.push({ ymd, day: d });
    }
    return result;
  }, [viewMonth]);

  const todayYmd = React.useMemo(() => toYmd(new Date()), []);

  const handleDayClick = (ymd: string) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(ymd);
      setDraftTo('');
      return;
    }

    if (ymd < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(ymd);
      onChange({ from: ymd, to: draftFrom });
      setOpen(false);
    } else {
      setDraftTo(ymd);
      onChange({ from: draftFrom, to: ymd });
      setOpen(false);
    }
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDraftFrom('');
    setDraftTo('');
    onChange({ from: '', to: '' });
    setOpen(false);
  };

  const activeRangeStart = draftFrom;
  const activeRangeEnd =
    draftTo || (draftFrom && hoverDate && hoverDate >= draftFrom ? hoverDate : '');

  const hasValue = Boolean(from || to);
  const triggerLabel = hasValue
    ? `${from ? formatShortDate(from) : '…'} – ${to ? formatShortDate(to) : t.topbar.now}`
    : t.topbar.customDate;

  const monthTitle = viewMonth.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors',
            hasValue
              ? 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-fg)]'
              : 'border-border bg-elevated text-fg-secondary hover:border-border-strong hover:text-fg',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
          <span className="font-num whitespace-nowrap">{triggerLabel}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t.topbar.clearDate}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleClear();
              }}
              className="ml-0.5 rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[288px] p-3.5" align="end">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-subtle text-fg-muted hover:border-border-strong hover:text-fg"
            onClick={() =>
              setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold capitalize text-fg">{monthTitle}</span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-subtle text-fg-muted hover:border-border-strong hover:text-fg"
            onClick={() =>
              setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-medium text-fg-faint">
          {t.topbar.weekdaysShort.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell, idx) => {
            if (!cell.ymd) {
              return <div key={idx} className="h-8" />;
            }

            const isStart = cell.ymd === activeRangeStart;
            const isEnd = cell.ymd === activeRangeEnd;
            const isInRange =
              Boolean(activeRangeStart && activeRangeEnd) &&
              cell.ymd > activeRangeStart &&
              cell.ymd < activeRangeEnd;
            const isToday = cell.ymd === todayYmd;

            return (
              <button
                key={cell.ymd}
                type="button"
                onMouseEnter={() => setHoverDate(cell.ymd)}
                onClick={() => handleDayClick(cell.ymd!)}
                className={cn(
                  'font-num relative flex h-8 items-center justify-center text-[12px] transition-colors',
                  isStart || isEnd
                    ? 'rounded-md bg-indigo-600 font-semibold text-white dark:bg-indigo-500'
                    : isInRange
                      ? 'bg-[var(--accent-bg)] text-[var(--accent-fg)]'
                      : 'rounded-md text-fg-secondary hover:bg-hover hover:text-fg',
                  isToday && !isStart && !isEnd && 'ring-1 ring-inset ring-indigo-500/50',
                )}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px]">
          <span className="text-fg-muted">
            {draftFrom && !draftTo ? t.topbar.pickEndDate : t.topbar.pickStartDate}
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleClear}>
              {t.topbar.clearDate}
            </Button>
            {draftFrom && !draftTo && (
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  onChange({ from: draftFrom, to: draftFrom });
                  setOpen(false);
                }}
              >
                {t.topbar.oneDay}
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
