'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-card hover:opacity-90 active:scale-[0.99]',
        secondary:
          'bg-elevated text-fg-secondary border border-border hover:border-border-strong hover:bg-hover hover:text-fg',
        outline:
          'border border-border bg-transparent text-fg-secondary hover:border-border-strong hover:bg-hover hover:text-fg',
        ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
        destructive:
          'bg-[var(--loss-bg)] text-loss border border-[var(--loss-border)] hover:opacity-90',
      },
      size: {
        default: 'h-9 px-3.5 text-[13px]',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-5 text-sm',
        icon: 'h-8 w-8 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
