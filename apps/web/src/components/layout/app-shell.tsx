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
import { cn } from '@/lib/utils';
import { FilterProvider, useGlobalFilters } from './filter-context';
import { GlobalTopbar } from './global-topbar';

const NAV_GROUPS = [
  {
    title: 'Tổng quan',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/calendar', label: 'Calendar PnL', icon: CalendarDays },
    ],
  },
  {
    title: 'Nhật ký',
    items: [{ href: '/trades', label: 'Trade Journal', icon: BookOpen }],
  },
  {
    title: 'Dữ liệu',
    items: [
      { href: '/import', label: 'Import & Sync', icon: Upload },
      { href: '/accounts', label: 'Accounts & Tags', icon: Wallet },
    ],
  },
];

function SidebarContent({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();
  const { selectedAccount, activeAccountCurrency, totalPortfolioEquity, totalPortfolioNetPnl } =
    useGlobalFilters();

  const equityValue = selectedAccount ? selectedAccount.currentEquity : totalPortfolioEquity;
  const pnlValue = selectedAccount ? selectedAccount.netPnl : totalPortfolioNetPnl;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/[0.08] bg-[#0B0C0F] transition-[width] duration-200 md:flex',
        collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      {/* Brand + Collapse Toggle */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-white/[0.08] px-3',
          collapsed ? 'justify-center' : 'justify-between px-4',
        )}
      >
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_2px_10px_rgba(99,102,241,0.35)]">
            <Activity className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold tracking-tight text-white">
                TrackDailyTrade
              </p>
              <p className="truncate text-[11px] text-zinc-500">Trading Journal</p>
            </div>
          )}
        </Link>

        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Thu gọn thanh bên"
                onClick={onToggleCollapse}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Thu gọn menu</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            {!collapsed ? (
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                {group.title}
              </p>
            ) : (
              <div className="mx-auto my-1 h-px w-6 bg-white/[0.06]" />
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
                    collapsed ? 'h-9 justify-center px-0' : 'h-9 gap-2.5 px-2.5',
                    isActive
                      ? 'bg-indigo-500/12 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.28)]'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300',
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );

              if (collapsed) {
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

      {/* Footer: Active Account Balance Card + Expand Toggle */}
      <div className="border-t border-white/[0.08] p-3">
        {collapsed ? (
          <div className="flex flex-col items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Mở rộng thanh bên"
                  onClick={onToggleCollapse}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Mở rộng menu</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] bg-[#111216] p-3">
            <div className="flex items-center justify-between">
              <span className="truncate text-[11px] font-medium text-zinc-400">
                {selectedAccount ? selectedAccount.name : 'Tổng Equity danh mục'}
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            </div>
            <p className="font-num mt-1 text-[15px] font-semibold text-white">
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
  const [collapsed, setCollapsed] = React.useState(false);

  const flatNavItems = React.useMemo(() => NAV_GROUPS.flatMap((g) => g.items), []);

  return (
    <TooltipProvider delayDuration={150}>
      <FilterProvider>
        <div className="flex min-h-screen bg-[#09090B] text-zinc-100">
          <SidebarContent
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile Navigation Bar */}
            <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0B0C0F] px-3 py-2.5 md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-white">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold">TrackDailyTrade</span>
              </Link>
              <div className="flex items-center gap-1 overflow-x-auto">
                {flatNavItems.map((item) => {
                  const isActive =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium',
                        isActive
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-zinc-400 hover:text-white',
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
