'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  Wallet,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, pnlColorClass } from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';
import { FilterProvider, useGlobalFilters } from './filter-context';
import { GlobalTopbar } from './global-topbar';

function SidebarContent() {
  const pathname = usePathname();
  const { t, sidebarCollapsed, toggleSidebar } = usePreferences();
  const { selectedAccount, activeAccountCurrency, totalPortfolioEquity, totalPortfolioNetPnl } =
    useGlobalFilters();

  const navGroups = React.useMemo(
    () => [
      {
        title: t.nav.groupOverview,
        items: [
          { href: '/', label: t.nav.dashboard, icon: LayoutDashboard },
          { href: '/calendar', label: t.nav.calendar, icon: CalendarDays },
        ],
      },
      {
        title: t.nav.groupJournal,
        items: [{ href: '/trades', label: t.nav.trades, icon: BookOpen }],
      },
      {
        title: t.nav.groupData,
        items: [
          { href: '/import', label: t.nav.import, icon: Upload },
          { href: '/accounts', label: t.nav.accounts, icon: Wallet },
        ],
      },
    ],
    [t.nav],
  );

  const equityValue = selectedAccount ? selectedAccount.currentEquity : totalPortfolioEquity;
  const pnlValue = selectedAccount ? selectedAccount.netPnl : totalPortfolioNetPnl;

  return (
    <aside
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      className={cn(
        'sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex',
        sidebarCollapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      {/* Header: Always-visible toggle button in BOTH expanded and collapsed states */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-border',
          sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {!sidebarCollapsed && (
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold tracking-tight text-fg">
                TrackDailyTrade
              </p>
              <p className="truncate text-[11px] text-fg-muted">{t.nav.brandSubtitle}</p>
            </div>
          </Link>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
          aria-label={sidebarCollapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
          data-testid="sidebar-toggle-btn"
          className={cn(
            'flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
            sidebarCollapsed
              ? 'h-9 w-9 border border-border bg-surface text-fg-secondary shadow-card hover:border-indigo-500/50 hover:text-indigo-500'
              : 'h-8 w-8 text-fg-muted hover:bg-hover hover:text-fg',
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            {!sidebarCollapsed ? (
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
                {group.title}
              </p>
            ) : (
              <div className="mx-auto my-1 h-px w-6 bg-border" />
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

              const linkNode = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center rounded-lg text-[13px] font-medium transition-all duration-150',
                    sidebarCollapsed ? 'h-9 justify-center px-0' : 'h-9 gap-2.5 px-2.5',
                    isActive
                      ? 'bg-[var(--accent-bg)] text-fg ring-1 ring-inset ring-[var(--accent-border)]'
                      : 'text-fg-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-[var(--accent-fg)]' : 'text-fg-muted group-hover:text-fg',
                    )}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return linkNode;
            })}
          </div>
        ))}
      </nav>

      {/* Footer: Clean Account Equity Summary */}
      <div className="border-t border-border p-3">
        {sidebarCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/accounts"
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-fg-secondary shadow-card transition-colors hover:border-border-strong hover:text-fg"
              >
                <Wallet className="h-4 w-4 text-indigo-500" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              {selectedAccount ? selectedAccount.name : t.nav.portfolioEquity}:{' '}
              {formatCurrency(equityValue, activeAccountCurrency)}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <div className="flex items-center justify-between">
              <span className="truncate text-[11px] font-medium text-fg-muted">
                {selectedAccount ? selectedAccount.name : t.nav.portfolioEquity}
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            </div>
            <p className="font-num mt-1 text-[15px] font-semibold text-fg">
              {formatCurrency(equityValue, activeAccountCurrency)}
            </p>
            <p className={cn('font-num mt-0.5 text-[11px]', pnlColorClass(pnlValue))}>
              {formatCurrency(pnlValue, activeAccountCurrency, true)} Net PnL
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = usePreferences();

  const mobileNavItems = React.useMemo(
    () => [
      { href: '/', label: t.nav.dashboard },
      { href: '/calendar', label: t.nav.calendar },
      { href: '/trades', label: t.nav.trades },
      { href: '/import', label: t.nav.import },
      { href: '/accounts', label: t.nav.accounts },
    ],
    [t.nav],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <FilterProvider>
        <div className="flex min-h-screen bg-canvas text-fg">
          <SidebarContent />

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile Navigation Bar */}
            <div className="flex items-center justify-between border-b border-border bg-sidebar px-3 py-2.5 md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-white">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold text-fg">TrackDailyTrade</span>
              </Link>
              <div className="flex items-center gap-1 overflow-x-auto">
                {mobileNavItems.map((item) => {
                  const isActive =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium',
                        isActive
                          ? 'bg-[var(--accent-bg)] text-[var(--accent-fg)]'
                          : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Sticky 56px Global Topbar */}
            <GlobalTopbar />

            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 lg:px-6 lg:py-6">
              {children}
            </main>
          </div>
        </div>
      </FilterProvider>
    </TooltipProvider>
  );
}
