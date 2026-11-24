'use client';

import * as React from 'react';
import { Check, Copy, Link2, Plus, Tag as TagIcon, Trash2, Wallet } from 'lucide-react';
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
import { api, API_BASE_URL } from '@/lib/api';
import {
  BROKER_TIMEZONE_PRESETS,
  DISPLAY_TIMEZONE_PRESETS,
  formatCurrency,
  pnlColorClass,
} from '@/lib/format';
import { cn } from '@/lib/utils';

const TAG_SWATCHES = ['#10B981', '#6366F1', '#8B5CF6', '#3B82F6', '#F59E0B', '#F43F5E', '#06B6D4'];

export default function AccountsPage() {
  const { accounts, tags, refreshReferences } = useGlobalFilters();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [broker, setBroker] = React.useState('');
  const [accountNumber, setAccountNumber] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [initialBalance, setInitialBalance] = React.useState('10000');
  const [brokerTimezone, setBrokerTimezone] = React.useState('Europe/Athens');
  const [displayTimezone, setDisplayTimezone] = React.useState('Asia/Ho_Chi_Minh');
  const [savingAcc, setSavingAcc] = React.useState(false);

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
      // ignore clipboard errors
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountNumber.trim()) return;
    setSavingAcc(true);
    setError(null);
    try {
      await api.createAccount({
        name: name.trim(),
        broker: broker.trim() || null,
        platform: 'MT5',
        accountNumber: accountNumber.trim(),
        currency: currency.trim().toUpperCase() || 'USD',
        initialBalance: initialBalance.trim() || '0',
        brokerTimezone,
        displayTimezone,
      });
      setName('');
      setBroker('');
      setAccountNumber('');
      setDialogOpen(false);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo tài khoản');
    } finally {
      setSavingAcc(false);
    }
  };

  const handleDeleteAccount = async (id: string, accName: string) => {
    if (!window.confirm(`Xoá tài khoản "${accName}" cùng toàn bộ lệnh thuộc tài khoản này?`)) return;
    try {
      await api.deleteAccount(id);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xoá tài khoản');
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
      setError(err instanceof Error ? err.message : 'Không thể tạo tag');
    } finally {
      setSavingTag(false);
    }
  };

  const handleDeleteTag = async (id: string, tName: string) => {
    if (!window.confirm(`Xoá tag chiến lược "${tName}"?`)) return;
    try {
      await api.deleteTag(id);
      await refreshReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xoá tag');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Tài khoản &amp; Tag chiến lược</h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            Quản lý danh sách tài khoản MT5 (Live, Demo, Prop Firm), cấu hình Webhook EA và bộ Tag
            phân loại chiến lược.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Thêm tài khoản
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Thêm tài khoản giao dịch mới</DialogTitle>
            <DialogDescription>
              Nhập đúng số tài khoản MT5 (Login ID) để hệ thống tự khớp khi EA gửi dữ liệu hoặc khi
              Import báo cáo.
            </DialogDescription>

            <form onSubmit={handleCreateAccount} className="mt-5 space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Tên gợi nhớ *</label>
                <Input
                  required
                  placeholder="vd: FTMO 100k Live"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Số tài khoản MT5 *</label>
                  <Input
                    required
                    className="font-num"
                    placeholder="vd: 51234567"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Sàn (Broker)</label>
                  <Input
                    placeholder="vd: Exness / FTMO"
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Vốn ban đầu (Initial Balance)</label>
                  <Input
                    className="font-num"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Tiền tệ</label>
                  <Input
                    className="font-num uppercase"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Múi giờ server sàn (Broker Timezone)</label>
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
                <label className="text-xs text-zinc-400">Múi giờ hiển thị mặc định</label>
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
                  Huỷ
                </Button>
                <Button type="submit" size="sm" disabled={savingAcc}>
                  {savingAcc ? 'Đang tạo...' : 'Tạo tài khoản'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* MT5 EA Webhook Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-400" />
            Kết nối MT5 Expert Advisor (Webhook)
          </CardTitle>
          <CardDescription>
            Thêm địa chỉ này vào MetaTrader 5:{' '}
            <code className="font-num rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-200">
              Tools → Options → Expert Advisors → Allow WebRequest for listed URL
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2.5">
          <code className="font-num flex-1 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#16181D] px-3.5 py-2 text-xs text-zinc-200">
            {batchWebhookUrl}
          </code>
          <Button size="sm" variant="secondary" onClick={handleCopyWebhook}>
            {copiedUrl ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedUrl ? 'Đã sao chép' : 'Sao chép URL'}
          </Button>
        </CardContent>
      </Card>

      {/* Accounts Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Wallet className="h-4 w-4 text-zinc-400" />
            Danh sách tài khoản ({accounts.length})
          </h2>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="group flex flex-col justify-between p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">{acc.name}</h3>
                      <Badge variant="default">{acc.platform}</Badge>
                    </div>
                    <p className="font-num mt-1 text-xs text-zinc-500">
                      #{acc.accountNumber} · {acc.broker ?? 'MT5 Broker'}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Xoá ${acc.name}`}
                    className="h-7 w-7 text-zinc-500 opacity-70 hover:text-rose-400 group-hover:opacity-100"
                    onClick={() => handleDeleteAccount(acc.id, acc.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-4 flex items-baseline justify-between border-t border-white/[0.06] pt-3">
                  <div>
                    <p className="text-[11px] text-zinc-500">Equity hiện tại</p>
                    <p className="font-num mt-0.5 text-lg font-bold text-white">
                      {formatCurrency(acc.currentEquity, acc.currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-zinc-500">Net PnL</p>
                    <p className={`font-num mt-0.5 text-sm font-semibold ${pnlColorClass(acc.netPnl)}`}>
                      {formatCurrency(acc.netPnl, acc.currency, true)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="font-num mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px] text-zinc-500">
                <span>Balance {formatCurrency(acc.currentBalance, acc.currency)}</span>
                <span>
                  {acc.brokerTimezone} · {acc.tradeCount} lệnh
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Strategy Tags Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-indigo-400" />
            Tag chiến lược ({tags.length})
          </CardTitle>
          <CardDescription>
            Tạo bộ nhãn chiến lược (vd: BB Tier 3, SMC MTF, Tier SSS) để phân tích Win Rate &amp;
            Expectancy theo từng setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreateTag} className="flex flex-wrap items-center gap-2.5">
            <Input
              className="max-w-xs"
              placeholder="Tên tag mới (vd: BB Tier 3)..."
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
            />
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#16181D] px-2.5 py-1.5">
              {TAG_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Chọn màu ${c}`}
                  onClick={() => setTagColor(c)}
                  className={cn(
                    'h-4 w-4 rounded-full transition-transform',
                    tagColor === c
                      ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-[#16181D]'
                      : 'opacity-65 hover:opacity-100',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button type="submit" size="sm" disabled={savingTag || !tagName.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Thêm Tag
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="group inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#16181D] px-3 py-1.5 text-xs transition-colors hover:border-white/[0.16]"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="font-medium text-zinc-100">{tag.name}</span>
                <span className="font-num text-[11px] text-zinc-500">({tag.tradeCount ?? 0})</span>
                <button
                  type="button"
                  aria-label={`Xoá ${tag.name}`}
                  className="ml-0.5 text-zinc-500 transition-colors hover:text-rose-400"
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
