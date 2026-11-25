import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'profit' | 'loss' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const styles: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-[var(--accent-bg)] text-[var(--accent-fg)] border-[var(--accent-border)]',
    secondary: 'bg-elevated text-fg-secondary border-border',
    profit: 'bg-[var(--profit-bg)] text-profit border-[var(--profit-border)]',
    loss: 'bg-[var(--loss-bg)] text-loss border-[var(--loss-border)]',
    outline: 'bg-transparent text-fg-secondary border-border-strong',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
