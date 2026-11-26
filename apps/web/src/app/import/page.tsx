'use client';

import * as React from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useGlobalFilters } from '@/components/layout/filter-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, API_BASE_URL, type ImportResultDto, type SyncLogDto } from '@/lib/api';
import {
  BROKER_TIMEZONE_PRESETS,
  formatCurrency,
  formatDateTimeInTz,
  getShortTimezoneLabel,
  pnlColorClass,
} from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';

export default function ImportPage() {
  const { t } = usePreferences();
  const { accounts, filters, refreshTick, refreshReferences } = useGlobalFilters();
  const [accountId, setAccountId] = React.useState('');
  const [brokerTimezone, setBrokerTimezone] = React.useState('Europe/Athens');
  const [file, setFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportResultDto | null>(null);
  const [finalResult, setFinalResult] = React.useState<ImportResultDto | null>(null);
  const [logs, setLogs] = React.useState<SyncLogDto[]>([]);
  const [copiedWebhook, setCopiedWebhook] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const tz = filters.timezone ?? 'Asia/Ho_Chi_Minh';
  const shortTz = getShortTimezoneLabel(tz);
  const batchWebhookUrl = `${API_BASE_URL.replace('localhost', '127.0.0.1')}/webhooks/mt5/batch`;

  React.useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
      setBrokerTimezone(accounts[0].brokerTimezone);
    }
  }, [accounts, accountId]);

  const loadLogs = React.useCallback(async () => {
    try {
      const data = await api.getSyncLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch sync logs:', err);
    }
  }, []);

  React.useEffect(() => {
    void loadLogs();
  }, [loadLogs, refreshTick]);

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(batchWebhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleAccountChange = (nextId: string) => {
    setAccountId(nextId);
    const acc = accounts.find((a) => a.id === nextId);
    if (acc) setBrokerTimezone(acc.brokerTimezone);
    setPreview(null);
    setFinalResult(null);
  };

  const acceptFile = (incoming: File | null) => {
    if (!incoming) return;
    setFile(incoming);
    setPreview(null);
    setFinalResult(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    acceptFile(dropped);
  };

  const handlePreview = async () => {
    if (!file || !accountId) return;
    setBusy(true);
    setError(null);
    setFinalResult(null);
    try {
      const res = await api.importMt5Statement({
        file,
        accountId,
        brokerTimezone,
        dryRun: true,
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.importMt5Statement({
        file,
        accountId,
        brokerTimezone,
        dryRun: false,
      });
      setFinalResult(res);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await Promise.all([loadLogs(), refreshReferences()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{t.importPage.title}</h1>
        <p className="mt-0.5 text-xs text-fg-muted">{t.importPage.subtitle}</p>
      </div>

      {/* Quick Download MT5 EA (.ex5) */}
      <Card className="border-[var(--accent-border)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="default">
                <Zap className="h-3 w-3" />
                Auto-Sync Realtime · v1.20
              </Badge>
              <span className="text-xs text-fg-muted">{t.importPage.noMetaEditor}</span>
            </div>
            <CardTitle className="mt-2 text-base">{t.importPage.eaTitle}</CardTitle>
            <CardDescription className="mt-1">{t.importPage.eaDesc}</CardDescription>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a href="/downloads/TrackDailyTrade.ex5" download="TrackDailyTrade.ex5">
              <Button size="sm">
                <Download className="h-3.5 w-3.5" />
                {t.importPage.downloadEx5}
              </Button>
            </a>
            <a href="/downloads/TrackDailyTrade.mq5" download="TrackDailyTrade.mq5">
              <Button size="sm" variant="secondary">
                {t.importPage.sourceMq5}
              </Button>
            </a>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-elevated p-3 text-xs">
              <span className="font-num font-semibold text-indigo-500">
                {t.importPage.step1Title}
              </span>
              <p className="mt-1 leading-relaxed text-fg-muted">{t.importPage.step1Desc}</p>
            </div>
            <div className="rounded-lg border border-border bg-elevated p-3 text-xs">
              <span className="font-num font-semibold text-indigo-500">
                {t.importPage.step2Title}
              </span>
              <p className="mt-1 leading-relaxed text-fg-muted">{t.importPage.step2Desc}</p>
            </div>
            <div className="rounded-lg border border-border bg-elevated p-3 text-xs">
              <span className="font-num font-semibold text-indigo-500">
                {t.importPage.step3Title}
              </span>
              <p className="mt-1 leading-relaxed text-fg-muted">{t.importPage.step3Desc}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2">
            <span className="text-xs text-fg-muted">Webhook URL:</span>
            <code className="font-num flex-1 overflow-x-auto text-xs text-fg">
              {batchWebhookUrl}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-xs"
              onClick={handleCopyWebhook}
            >
              {copiedWebhook ? (
                <Check className="h-3.5 w-3.5 text-profit" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedWebhook ? t.common.copied : t.common.copy}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import MT5 HTML/CSV Statement */}
      <Card>
        <CardHeader>
          <CardTitle>{t.importPage.statementTitle}</CardTitle>
          <CardDescription>{t.importPage.statementDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-fg-muted">
                {t.importPage.targetAccount}
              </label>
              <Select value={accountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} (#{acc.accountNumber} · {acc.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-fg-muted">
                {t.importPage.brokerTzLabel}
              </label>
              <Select value={brokerTimezone} onValueChange={setBrokerTimezone}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROKER_TIMEZONE_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-all duration-150',
              dragActive
                ? 'border-indigo-500 bg-[var(--accent-bg)]'
                : file
                  ? 'border-[var(--profit-border)] bg-[var(--profit-bg)]'
                  : 'border-border-strong bg-subtle hover:bg-hover',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.csv,text/html,text/csv"
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border transition-colors',
                dragActive
                  ? 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-fg)]'
                  : file
                    ? 'border-[var(--profit-border)] bg-[var(--profit-bg)] text-profit'
                    : 'border-border bg-surface text-fg-muted group-hover:text-fg',
              )}
            >
              <FileSpreadsheet className="h-5 w-5" />
            </div>

            {file ? (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <p className="font-num text-sm font-medium text-fg">{file.name}</p>
                  <button
                    type="button"
                    aria-label={t.common.delete}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="font-num text-xs text-fg-muted">
                  {(file.size / 1024).toFixed(1)} KB · {t.importPage.readyToPreview}
                </p>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm font-medium text-fg">
                  {t.importPage.dropPrompt}{' '}
                  <span className="text-indigo-500 underline underline-offset-4">
                    {t.importPage.browseFiles}
                  </span>
                </p>
                <p className="mt-1 text-xs text-fg-muted">{t.importPage.dropHint}</p>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button disabled={!file || !accountId || busy} onClick={handlePreview}>
              <Upload className="h-3.5 w-3.5" />
              {busy ? t.importPage.analyzing : t.importPage.previewBtn}
            </Button>
            {preview && (
              <Button variant="secondary" disabled={busy} onClick={handleConfirmImport}>
                <CheckCircle2 className="h-3.5 w-3.5 text-profit" />
                {t.importPage.confirmImportBtn} ({preview.insertedCount} {t.importPage.newShort} ·{' '}
                {preview.updatedCount} {t.importPage.updatedShort})
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--loss-border)] bg-[var(--loss-bg)] px-3.5 py-2.5 text-xs text-loss">
              {error}
            </div>
          )}

          {finalResult && (
            <div className="rounded-lg border border-[var(--profit-border)] bg-[var(--profit-bg)] px-3.5 py-3 text-xs text-profit">
              {t.importPage.importDonePrefix}{' '}
              <strong className="font-num">{finalResult.insertedCount}</strong>{' '}
              {t.importPage.importDoneMid}{' '}
              <strong className="font-num">{finalResult.updatedCount}</strong>{' '}
              {t.importPage.importDoneSkip}{' '}
              <span className="font-num">{finalResult.skippedCount}</span>{' '}
              {t.importPage.importDoneSuffix}
            </div>
          )}

          {preview && preview.preview && (
            <div className="space-y-3 rounded-xl border border-border bg-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-fg">
                  {t.importPage.previewHeader}:{' '}
                  <span className="font-num font-semibold">{preview.totalParsed}</span>{' '}
                  {t.importPage.validTrades} (
                  <span className="font-num text-profit">
                    +{preview.insertedCount} {t.importPage.newShort}
                  </span>{' '}
                  ·{' '}
                  <span className="font-num text-fg-secondary">
                    ~{preview.updatedCount} {t.importPage.updatedShort}
                  </span>
                  )
                </span>
                <span className="font-num text-fg-muted">
                  {brokerTimezone} → {shortTz}
                </span>
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-border bg-elevated text-[11px] text-fg-muted">
                    <tr>
                      <th className="px-3 py-2">{t.importPage.colStatus}</th>
                      <th className="px-3 py-2">Position ID</th>
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2">{t.trades.colSide}</th>
                      <th className="px-3 py-2 text-right">Volume</th>
                      <th className="px-3 py-2">
                        {t.trades.colCloseTime} ({shortTz})
                      </th>
                      <th className="px-3 py-2 text-right">Net PnL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.preview.slice(0, 50).map((row) => (
                      <tr key={row.externalId} className="hover:bg-hover">
                        <td className="px-3 py-2">
                          <Badge variant={row.action === 'INSERT' ? 'profit' : 'secondary'}>
                            {row.action === 'INSERT'
                              ? t.importPage.badgeNew
                              : t.importPage.badgeUpdate}
                          </Badge>
                        </td>
                        <td className="font-num px-3 py-2 text-fg-secondary">{row.externalId}</td>
                        <td className="font-num px-3 py-2 font-semibold text-fg">{row.symbol}</td>
                        <td className="px-3 py-2">
                          <Badge variant={row.direction === 'BUY' ? 'profit' : 'loss'}>
                            {row.direction}
                          </Badge>
                        </td>
                        <td className="font-num px-3 py-2 text-right text-fg-secondary">
                          {row.volume}
                        </td>
                        <td className="font-num px-3 py-2 text-fg-muted">
                          {formatDateTimeInTz(row.closeTime, tz)}
                        </td>
                        <td
                          className={`font-num px-3 py-2 text-right font-semibold ${pnlColorClass(row.netPnl)}`}
                        >
                          {formatCurrency(row.netPnl, selectedAccount?.currency ?? 'USD', true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Logs */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t.importPage.logsTitle}</CardTitle>
            <CardDescription>{t.importPage.logsDesc}</CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void loadLogs()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t.importPage.refreshBtn}
          </Button>
        </CardHeader>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-elevated text-[11px] font-medium text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">
                  {t.importPage.colTime} ({shortTz})
                </th>
                <th className="px-3 py-2.5">{t.importPage.colAccount}</th>
                <th className="px-3 py-2.5">{t.importPage.colSource}</th>
                <th className="px-3 py-2.5">{t.importPage.colStatus}</th>
                <th className="px-3 py-2.5">{t.importPage.colFile}</th>
                <th className="px-4 py-2.5 text-right">{t.importPage.colCounts}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-fg-muted">
                    {t.importPage.emptyLogs}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-hover">
                    <td className="font-num whitespace-nowrap px-4 py-2.5 text-fg-muted">
                      {formatDateTimeInTz(log.createdAt, tz)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-fg">
                      {log.account?.name ?? log.accountId}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="secondary">
                        {log.source === 'MT5_WEBHOOK' ? 'MT5 Webhook' : 'MT5 Import'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={
                          log.status === 'SUCCESS'
                            ? 'profit'
                            : log.status === 'FAILED'
                              ? 'loss'
                              : 'default'
                        }
                      >
                        {log.status === 'SUCCESS'
                          ? t.importPage.statusSuccess
                          : log.status === 'FAILED'
                            ? t.importPage.statusFailed
                            : t.importPage.statusPartial}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-fg-muted">{log.fileName ?? '—'}</td>
                    <td className="font-num whitespace-nowrap px-4 py-2.5 text-right">
                      <span className="text-profit">+{log.insertedCount}</span>
                      <span className="mx-1.5 text-fg-faint">/</span>
                      <span className="text-fg">~{log.updatedCount}</span>
                      <span className="mx-1.5 text-fg-faint">/</span>
                      <span className="text-fg-muted">{log.skippedCount}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
