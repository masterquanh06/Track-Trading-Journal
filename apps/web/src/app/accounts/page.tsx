'use client';

import * as React from 'react';
import { Check, Copy, Link2, Pencil, Plus, Tag as TagIcon, Trash2, Wallet } from 'lucide-react';
import { normalizeDecimalString } from '@trackdailytrade/shared';
import { useGlobalFilters } from '@/components/layout/filter-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, API_BASE_URL, type AccountDto } from '@/lib/api';
import {
  BROKER_TIMEZONE_PRESETS,
  DISPLAY_TIMEZONE_PRESETS,
  formatCurrency,
  pnlColorClass,
} from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';

const TAG_SWATCHES = ['#10B981', '#6366F1', '#8B5CF6', '#3B82F6', '#F59E0B', '#F43F5E', '#06B6D4'];

export default function AccountsPage() {
  const { t } = usePreferences();
  const { accounts, tags, refreshReferences } = useGlobalFilters();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [broker, setBroker] = React.useState('');
  const [accountNumber, setAccountNumber] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [initialBalance, setInitialBalance] = React.useState('');
  const [brokerTimezone, setBrokerTimezone] = React.useState('Europe/Athens');
  const [displayTimezone, setDisplayTimezone] = React.useState('Asia/Ho_Chi_Minh');
  const [savingAcc, setSavingAcc] = React.useState(false);

  const [editingAccount, setEditingAccount] = React.useState<AccountDto | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editBroker, setEditBroker] = React.useState('');
  const [editInitialBalance, setEditInitialBalance] = React.useState('');
  const [editCurrency, setEditCurrency] = React.useState('USD');
  const [editBrokerTz, setEditBrokerTz] = React.useState('Europe/Athens');
  const [editDisplayTz, setEditDisplayTz] = React.useState('Asia/Ho_Chi_Minh');
  const [updatingAcc, setUpdatingAcc] = React.useState(false);

  const [tagName, setTagName] = React.useState('');
  const [tagColor, setTagColor] = React.useState(TAG_SWATCHES[0]);
  const [savingTag, setSavingTag] = React.useState(false);

  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const batchWebhookUrl = `${API_BASE_URL.replace('localhost', '127.0.0.1')}/webhooks/mt5/batch`;

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(batchWebhookUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountNumber.trim()) return;
    setSavingAcc(true);
    setError(null);
    try {
      const normalizedInit = initialBalance.trim()
        ? normalizeDecimalString(initialBalance)
        : '0';
      if (initialBalance.trim() && normalizedInit === null) {
        setError('Initial Capital must be a valid number (e.g. 100000 or 100,000.00)');
        setSavingAcc(false);
        return;
      }

      await api.createAccount({
        name: name.trim(),
        broker: broker.trim() || null,
        platform: 'MT5',
        accountNumber: accountNumber.trim(),
        currency: currency.trim().toUpperCase() || 'USD',
        initialBalance: normalizedInit ?? '0',
        brokerTimezone,
        displayTimezone,
      });
      setName('');
      setBroker('');
      setAccountNumber('');
      setInitialBalance('');
      setDialogOpen(false);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setSavingAcc(false);
    }
  };

  const openEditAccount = (acc: AccountDto) => {
    setEditingAccount(acc);
    setEditName(acc.name);
    setEditBroker(acc.broker ?? '');
    setEditInitialBalance(acc.initialBalance);
    setEditCurrency(acc.currency);
    setEditBrokerTz(acc.brokerTimezone);
    setEditDisplayTz(acc.displayTimezone);
    setError(null);
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !editName.trim()) return;
    setUpdatingAcc(true);
    setError(null);
    try {
      const normalizedInit = editInitialBalance.trim()
        ? normalizeDecimalString(editInitialBalance)
        : '0';
      if (editInitialBalance.trim() && normalizedInit === null) {
        setError('Initial Capital must be a valid number (e.g. 100000 or 100,000.00)');
        setUpdatingAcc(false);
        return;
      }

      await api.updateAccount(editingAccount.id, {
        name: editName.trim(),
        broker: editBroker.trim() || null,
        currency: editCurrency.trim().toUpperCase() || 'USD',
        initialBalance: normalizedInit ?? '0',
        brokerTimezone: editBrokerTz,
        displayTimezone: editDisplayTz,
      });
      setEditingAccount(null);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account');
    } finally {
      setUpdatingAcc(false);
    }
  };

  const handleDeleteAccount = async (id: string, accName: string) => {
    if (!window.confirm(`${accName}: ${t.accountsPage.confirmDeleteAcc}`)) return;
    try {
      await api.deleteAccount(id);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    setSavingTag(true);
    setError(null);
    try {
      await api.createTag({ name: tagName.trim(), color: tagColor });
      setTagName('');
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setSavingTag(false);
    }
  };

  const handleDeleteTag = async (id: string, tName: string) => {
    if (!window.confirm(`${t.accountsPage.confirmDeleteTag} "${tName}"?`)) return;
    try {
      await api.deleteTag(id);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            {t.accountsPage.title}
          </h1>
          <p className="mt-0.5 text-xs text-fg-muted">{t.accountsPage.subtitle}</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              {t.accountsPage.addAccountBtn}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>{t.accountsPage.modalTitle}</DialogTitle>
            <DialogDescription>{t.accountsPage.modalDesc}</DialogDescription>

            <form onSubmit={handleCreateAccount} className="mt-5 space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs text-fg-muted">{t.accountsPage.fieldName}</label>
                <Input
                  required
                  placeholder="FTMO 100k Live"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-fg-muted">{t.accountsPage.fieldLogin}</label>
                  <Input
                    required
                    className="font-num"
                    placeholder="51234567"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-fg-muted">{t.accountsPage.fieldBroker}</label>
                  <Input
                    placeholder="Exness / FTMO"
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-fg-muted">
                    {t.accountsPage.fieldInitBalance}
                  </label>
                  <Input
                    className="font-num"
                    placeholder="100,000"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                  />
                  <p className="text-[10.5px] text-fg-faint">{t.accountsPage.initBalanceHint}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-fg-muted">{t.accountsPage.fieldCurrency}</label>
                  <Input
                    className="font-num uppercase"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-fg-muted">{t.accountsPage.fieldBrokerTz}</label>
                <Select value={brokerTimezone} onValueChange={setBrokerTimezone}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BROKER_TIMEZONE_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-fg-muted">{t.accountsPage.fieldDisplayTz}</label>
                <Select value={displayTimezone} onValueChange={setDisplayTimezone}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPLAY_TIMEZONE_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  {t.common.cancel}
                </Button>
                <Button type="submit" size="sm" disabled={savingAcc}>
                  {savingAcc ? t.accountsPage.creating : t.accountsPage.createBtn}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--loss-border)] bg-[var(--loss-bg)] px-4 py-3 text-xs text-loss">
          {error}
        </div>
      )}

      {/* MT5 EA Webhook Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-500" />
            {t.accountsPage.webhookTitle}
          </CardTitle>
          <CardDescription>
            {t.accountsPage.webhookDesc}{' '}
            <code className="font-num rounded bg-elevated px-1.5 py-0.5 text-[11px] text-fg">
              Tools → Options → Expert Advisors → Allow WebRequest for listed URL
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2.5">
          <code className="font-num flex-1 overflow-x-auto rounded-lg border border-border bg-elevated px-3.5 py-2 text-xs text-fg">
            {batchWebhookUrl}
          </code>
          <Button size="sm" variant="secondary" onClick={handleCopyWebhook}>
            {copiedUrl ? (
              <Check className="h-3.5 w-3.5 text-profit" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedUrl ? t.accountsPage.copiedUrl : t.accountsPage.copyUrl}
          </Button>
        </CardContent>
      </Card>

      {/* Accounts Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Wallet className="h-4 w-4 text-fg-muted" />
            {t.accountsPage.listTitle} ({accounts.length})
          </h2>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="group flex flex-col justify-between p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-fg">{acc.name}</h3>
                      <Badge variant="default">{acc.platform}</Badge>
                    </div>
                    <p className="font-num mt-1 text-xs text-fg-muted">
                      #{acc.accountNumber} · {acc.broker ?? 'MT5 Broker'}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${t.accountsPage.editAccountBtn} ${acc.name}`}
                      className="h-7 w-7 text-fg-muted opacity-70 hover:text-fg group-hover:opacity-100"
                      onClick={() => openEditAccount(acc)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${t.common.delete} ${acc.name}`}
                      className="h-7 w-7 text-fg-muted opacity-70 hover:text-loss group-hover:opacity-100"
                      onClick={() => handleDeleteAccount(acc.id, acc.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
                  <div>
                    <p className="text-[11px] text-fg-muted">{t.accountsPage.currentEquity}</p>
                    <p className="font-num mt-0.5 text-lg font-bold text-fg">
                      {formatCurrency(acc.currentEquity, acc.currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-fg-muted">Net PnL</p>
                    <p
                      className={`font-num mt-0.5 text-sm font-semibold ${pnlColorClass(acc.netPnl)}`}
                    >
                      {formatCurrency(acc.netPnl, acc.currency, true)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="font-num mt-3 space-y-1.5 border-t border-border pt-2.5 text-[11px] text-fg-muted">
                <div className="flex items-center justify-between">
                  <span>
                    {t.accountsPage.currentBalance}:{' '}
                    <span className="font-medium text-fg-secondary">
                      {formatCurrency(acc.currentBalance, acc.currency)}
                    </span>
                  </span>
                  <span>
                    {t.accountsPage.initialCapital}:{' '}
                    <span className="font-medium text-fg-secondary">
                      {formatCurrency(acc.initialBalance, acc.currency)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10.5px] text-fg-faint">
                  <span>{acc.brokerTimezone}</span>
                  <span>
                    {acc.tradeCount} {t.common.tradesCount}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Edit Account Modal */}
      <Dialog open={editingAccount !== null} onOpenChange={(o) => !o && setEditingAccount(null)}>
        <DialogContent>
          <DialogTitle>{t.accountsPage.editModalTitle}</DialogTitle>
          <DialogDescription>{t.accountsPage.editModalDesc}</DialogDescription>

          <form onSubmit={handleUpdateAccount} className="mt-5 space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs text-fg-muted">{t.accountsPage.fieldName}</label>
              <Input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-fg-muted">{t.accountsPage.fieldLogin}</label>
                <Input
                  disabled
                  className="font-num opacity-70"
                  value={editingAccount?.accountNumber ?? ''}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-fg-muted">{t.accountsPage.fieldBroker}</label>
                <Input
                  value={editBroker}
                  onChange={(e) => setEditBroker(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-fg-muted">
                  {t.accountsPage.fieldInitBalance}
                </label>
                <Input
                  className="font-num"
                  placeholder="100,000"
                  value={editInitialBalance}
                  onChange={(e) => setEditInitialBalance(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-fg-muted">{t.accountsPage.fieldCurrency}</label>
                <Input
                  className="font-num uppercase"
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-fg-muted">{t.accountsPage.fieldBrokerTz}</label>
              <Select value={editBrokerTz} onValueChange={setEditBrokerTz}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROKER_TIMEZONE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-fg-muted">{t.accountsPage.fieldDisplayTz}</label>
              <Select value={editDisplayTz} onValueChange={setEditDisplayTz}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_TIMEZONE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingAccount(null)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={updatingAcc}>
                {updatingAcc ? t.common.saving : t.accountsPage.saveChangesBtn}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Strategy Tags Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-indigo-500" />
            {t.accountsPage.tagsTitle} ({tags.length})
          </CardTitle>
          <CardDescription>{t.accountsPage.tagsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreateTag} className="flex flex-wrap items-center gap-2.5">
            <Input
              className="max-w-xs"
              placeholder={t.accountsPage.newTagPlaceholder}
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
            />
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 py-1.5">
              {TAG_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setTagColor(c)}
                  className={cn(
                    'h-4 w-4 rounded-full transition-transform',
                    tagColor === c
                      ? 'scale-110 ring-2 ring-indigo-500 ring-offset-1 ring-offset-surface'
                      : 'opacity-65 hover:opacity-100',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button type="submit" size="sm" disabled={savingTag || !tagName.trim()}>
              <Plus className="h-3.5 w-3.5" />
              {t.accountsPage.addTagBtn}
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs transition-colors hover:border-border-strong"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="font-medium text-fg">{tag.name}</span>
                <span className="font-num text-[11px] text-fg-muted">
                  ({tag.tradeCount ?? 0})
                </span>
                <button
                  type="button"
                  aria-label={`${t.common.delete} ${tag.name}`}
                  className="ml-0.5 text-fg-muted transition-colors hover:text-loss"
                  onClick={() => handleDeleteTag(tag.id, tag.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
