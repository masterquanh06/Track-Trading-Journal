'use client';

import * as React from 'react';
import {
  Check,
  ExternalLink,
  ImagePlus,
  Lock,
  Plus,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { ShareTradeDialog } from '@/components/trades/share-trade-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { api, type TagDto, type TradeDto } from '@/lib/api';
import {
  formatCurrency,
  formatDateTimeInTz,
  formatDuration,
  getShortTimezoneLabel,
  pnlColorClass,
} from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';

interface TradeDetailDrawerProps {
  trade: TradeDto | null;
  allTags: TagDto[];
  accountBalance?: number;
  timezone: string;
  onClose: () => void;
  onUpdated: (updated: TradeDto) => void;
  onDeleted: (tradeId: string) => void;
  onTagCreated: () => Promise<void>;
}

const TAG_SWATCHES = ['#10B981', '#6366F1', '#8B5CF6', '#3B82F6', '#F59E0B', '#F43F5E', '#06B6D4'];

function resolveSnapshotPreviewSrc(raw: string): string {
  const trimmed = raw.trim();
  const tvMatch = /^https?:\/\/(?:www\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?$/i.exec(trimmed);
  if (tvMatch) {
    const id = tvMatch[1];
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
  }
  return trimmed;
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        const maxWidth = 1400;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.84));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function TradeDetailDrawer({
  trade,
  allTags,
  accountBalance = 10000,
  timezone,
  onClose,
  onUpdated,
  onDeleted,
  onTagCreated,
}: TradeDetailDrawerProps) {
  const { t } = usePreferences();
  const [preTradePlan, setPreTradePlan] = React.useState('');
  const [postTradeReview, setPostTradeReview] = React.useState('');
  const [note, setNote] = React.useState('');
  const [screenshotUrl, setScreenshotUrl] = React.useState('');
  const [imgError, setImgError] = React.useState(false);
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [initialStopLoss, setInitialStopLoss] = React.useState('');
  const [initialRiskAmount, setInitialRiskAmount] = React.useState('');
  const [newTagName, setNewTagName] = React.useState('');
  const [newTagColor, setNewTagColor] = React.useState(TAG_SWATCHES[0]);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [creatingTag, setCreatingTag] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!trade) return;
    setPreTradePlan(trade.preTradePlan ?? '');
    setPostTradeReview(trade.postTradeReview ?? '');
    setNote(trade.note ?? '');
    setScreenshotUrl(trade.screenshotUrl ?? '');
    setImgError(false);
    setSelectedTagIds(trade.tags.map((tag) => tag.id));
    setInitialStopLoss(trade.initialStopLoss ?? '');
    setInitialRiskAmount(trade.initialRiskAmount ?? '');
    setStatusMsg(null);
    setErrorMsg(null);
  }, [trade]);

  const previewR = React.useMemo(() => {
    if (!trade) return null;
    const net = Number(trade.netPnl);
    const gross = Number(trade.grossPnl);
    const open = Number(trade.openPrice);
    const close = Number(trade.closePrice);
    const riskNum = Number(initialRiskAmount);
    const slNum = Number(initialStopLoss);

    if (initialRiskAmount.trim() !== '' && Number.isFinite(riskNum) && riskNum > 0) {
      return net / riskNum;
    }

    if (initialStopLoss.trim() !== '' && Number.isFinite(slNum) && slNum > 0) {
      const riskDist = trade.direction === 'BUY' ? open - slNum : slNum - open;
      const pnlDist = trade.direction === 'BUY' ? close - open : open - close;
      if (riskDist > 0) {
        if (gross !== 0 && pnlDist !== 0) {
          const derivedRisk = riskDist * Math.abs(gross / pnlDist);
          if (derivedRisk > 0) return net / derivedRisk;
        }
        return pnlDist / riskDist;
      }
    }

    return trade.rMultiple ? Number(trade.rMultiple) : null;
  }, [trade, initialRiskAmount, initialStopLoss]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setScreenshotUrl(dataUrl);
      setImgError(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image upload error');
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        await handleImageUpload(file);
        return;
      }
    }
  };

  const handleQuickCreateTag = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    setErrorMsg(null);
    try {
      const created = await api.createTag({ name: newTagName.trim(), color: newTagColor });
      await onTagCreated();
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTagName('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreatingTag(false);
    }
  };

  const handleSave = async () => {
    if (!trade) return;
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);

    try {
      const payload: {
        note: string | null;
        preTradePlan: string | null;
        postTradeReview: string | null;
        screenshotUrl: string | null;
        tagIds: string[];
        initialStopLoss?: string | null;
        initialRiskAmount?: string | null;
      } = {
        note: note.trim() === '' ? null : note,
        preTradePlan: preTradePlan.trim() === '' ? null : preTradePlan,
        postTradeReview: postTradeReview.trim() === '' ? null : postTradeReview,
        screenshotUrl: screenshotUrl.trim() === '' ? null : screenshotUrl.trim(),
        tagIds: selectedTagIds,
      };

      const slChanged = (initialStopLoss.trim() || null) !== (trade.initialStopLoss || null);
      const riskChanged =
        (initialRiskAmount.trim() || null) !== (trade.initialRiskAmount || null);

      if (slChanged) payload.initialStopLoss = initialStopLoss.trim() || null;
      if (riskChanged) payload.initialRiskAmount = initialRiskAmount.trim() || null;

      const updated = await api.updateTradeJournal(trade.id, payload);
      onUpdated(updated);
      setStatusMsg(t.trades.drawer.savedSuccess);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!trade) return;
    if (!window.confirm(`${t.trades.drawer.confirmDelete} ${trade.symbol} (#${trade.externalId})?`))
      return;
    try {
      await api.deleteTrade(trade.id);
      onDeleted(trade.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const shortTz = getShortTimezoneLabel(timezone);
  const resolvedPreviewSrc = screenshotUrl ? resolveSnapshotPreviewSrc(screenshotUrl) : '';

  return (
    <>
      <Sheet open={Boolean(trade)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent onPaste={handlePaste} className="max-w-[580px]">
          {trade && (
            <>
              <SheetHeader>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <SheetTitle className="font-num text-lg font-bold tracking-tight text-fg">
                      {trade.symbol}
                    </SheetTitle>
                    <Badge variant={trade.direction === 'BUY' ? 'profit' : 'loss'}>
                      {trade.direction}
                    </Badge>
                    <span className="font-num rounded bg-elevated px-1.5 py-0.5 text-[11px] text-fg-muted">
                      #{trade.externalId}
                    </span>
                  </div>
                  <SheetDescription className="mt-1">
                    {trade.accountName} ·{' '}
                    {trade.source === 'MT5_WEBHOOK'
                      ? t.trades.drawer.sourceWebhook
                      : t.trades.drawer.sourceImport}
                  </SheetDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setShareOpen(true)}
                  >
                    <Share2 className="h-3.5 w-3.5 text-indigo-500" />
                    Share PNG
                  </Button>
                  <SheetCloseButton />
                </div>
              </SheetHeader>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                {/* Hero PnL & R-Multiple */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-elevated p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                      Net PnL
                    </p>
                    <p
                      className={`font-num mt-1.5 text-2xl font-bold tracking-tight ${pnlColorClass(trade.netPnl)}`}
                    >
                      {formatCurrency(trade.netPnl, trade.accountCurrency, true)}
                    </p>
                    <p className="font-num mt-1 text-[11px] text-fg-muted">
                      Gross {formatCurrency(trade.grossPnl, trade.accountCurrency, true)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-elevated p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                      R-Multiple
                    </p>
                    <p
                      className={`font-num mt-1.5 text-2xl font-bold tracking-tight ${
                        previewR !== null ? pnlColorClass(previewR) : 'text-fg-faint'
                      }`}
                    >
                      {previewR !== null
                        ? `${previewR >= 0 ? '+' : ''}${previewR.toFixed(2)}R`
                        : '—'}
                    </p>
                    <p className="font-num mt-1 text-[11px] text-fg-muted">
                      {t.trades.colHold}: {formatDuration(trade.holdingSeconds)}
                    </p>
                  </div>
                </div>

                {/* 2-Column Telemetry Grid */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border border-border bg-subtle p-3">
                    <p className="text-[11px] text-fg-muted">
                      {t.trades.drawer.openLabel} ({shortTz})
                    </p>
                    <p className="font-num mt-1 font-medium text-fg">
                      {formatDateTimeInTz(trade.openTime, timezone)}
                    </p>
                    <p className="font-num mt-0.5 text-[11px] text-fg-muted">
                      Entry: <span className="text-fg">{trade.openPrice}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-subtle p-3">
                    <p className="text-[11px] text-fg-muted">
                      {t.trades.drawer.closeLabel} ({shortTz})
                    </p>
                    <p className="font-num mt-1 font-medium text-fg">
                      {formatDateTimeInTz(trade.closeTime, timezone)}
                    </p>
                    <p className="font-num mt-0.5 text-[11px] text-fg-muted">
                      Exit: <span className="text-fg">{trade.closePrice}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-subtle p-3">
                    <p className="text-[11px] text-fg-muted">{t.trades.drawer.volSlTp}</p>
                    <p className="font-num mt-1 text-fg">{trade.volume} lot</p>
                    <p className="font-num mt-0.5 text-[11px] text-fg-muted">
                      SL {trade.stopLoss ?? '—'} · TP {trade.takeProfit ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-subtle p-3">
                    <p className="text-[11px] text-fg-muted">{t.trades.drawer.feesSwap}</p>
                    <p className="font-num mt-1 text-fg">
                      Comm: {formatCurrency(trade.commission, trade.accountCurrency)}
                    </p>
                    <p className="font-num mt-0.5 text-[11px] text-fg-muted">
                      Swap: {formatCurrency(trade.swap, trade.accountCurrency)}
                    </p>
                  </div>
                </div>

                {/* TradingView Snapshot / Chart Screenshot */}
                <div className="space-y-2.5 rounded-xl border border-border bg-elevated p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-fg">
                      {t.trades.drawer.snapshotTitle}
                    </span>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleImageUpload(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {t.trades.drawer.uploadPasteBtn}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 bg-surface text-xs"
                      placeholder={t.trades.drawer.snapshotPlaceholder}
                      value={
                        screenshotUrl.startsWith('data:image/')
                          ? t.trades.drawer.uploadedBadgeText
                          : screenshotUrl
                      }
                      readOnly={screenshotUrl.startsWith('data:image/')}
                      onChange={(e) => {
                        setScreenshotUrl(e.target.value);
                        setImgError(false);
                      }}
                    />
                    {screenshotUrl && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t.common.delete}
                        onClick={() => {
                          setScreenshotUrl('');
                          setImgError(false);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {resolvedPreviewSrc && (
                    <div className="overflow-hidden rounded-lg border border-border bg-canvas">
                      {!imgError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolvedPreviewSrc}
                          alt="TradingView Chart Snapshot"
                          className="max-h-60 w-full object-contain"
                          onError={() => setImgError(true)}
                        />
                      ) : (
                        <div className="flex items-center justify-between p-3 text-xs text-fg-muted">
                          <span>{t.trades.drawer.attachedLink}</span>
                          <a
                            href={screenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-500 hover:underline"
                          >
                            {t.trades.drawer.openDirect} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Initial SL / Risk Editor */}
                <div className="space-y-3 rounded-xl border border-border bg-elevated p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-fg">
                      {t.trades.drawer.riskTitle}
                    </span>
                    {trade.isManualRisk && (
                      <Badge variant="secondary">
                        <Lock className="h-3 w-3 text-indigo-500" />
                        {t.trades.drawer.manualLocked}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-fg-muted">Initial Stop Loss</label>
                      <Input
                        className="font-num mt-1 h-8 bg-surface text-xs"
                        placeholder="2640.50"
                        value={initialStopLoss}
                        onChange={(e) => setInitialStopLoss(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-fg-muted">
                        {t.trades.drawer.risk1R} ({trade.accountCurrency})
                      </label>
                      <Input
                        className="font-num mt-1 h-8 bg-surface text-xs"
                        placeholder="250.00"
                        value={initialRiskAmount}
                        onChange={(e) => setInitialRiskAmount(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Strategy Tags */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-fg">{t.trades.drawer.tagsTitle}</h3>
                    <span className="text-[11px] text-fg-muted">
                      {t.trades.drawer.selectedCount}: {selectedTagIds.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => {
                      const active = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-fg'
                              : 'border-border bg-elevated text-fg-muted hover:border-border-strong hover:text-fg',
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                          {active && <Check className="h-3 w-3 text-[var(--accent-fg)]" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border border-border bg-subtle p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 flex-1 bg-surface text-xs"
                        placeholder={t.trades.drawer.quickTagPlaceholder}
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleQuickCreateTag();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={creatingTag || !newTagName.trim()}
                        onClick={handleQuickCreateTag}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t.trades.drawer.createBtn}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[11px] text-fg-muted">{t.trades.drawer.colorLabel}</span>
                      {TAG_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={c}
                          onClick={() => setNewTagColor(c)}
                          className={cn(
                            'h-4 w-4 rounded-full transition-transform',
                            newTagColor === c
                              ? 'scale-110 ring-2 ring-indigo-500 ring-offset-1 ring-offset-surface'
                              : 'opacity-70 hover:opacity-100',
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Structured Pre-trade Plan & Post-trade Review */}
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-fg">
                      {t.trades.drawer.prePlanLabel}
                    </label>
                    <Textarea
                      rows={4}
                      placeholder={t.trades.drawer.prePlanPlaceholder}
                      value={preTradePlan}
                      onChange={(e) => setPreTradePlan(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-fg">
                      {t.trades.drawer.postReviewLabel}
                    </label>
                    <Textarea
                      rows={4}
                      placeholder={t.trades.drawer.postReviewPlaceholder}
                      value={postTradeReview}
                      onChange={(e) => setPostTradeReview(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-fg">
                    {t.trades.drawer.extraNoteLabel}
                  </label>
                  <Textarea
                    rows={2}
                    className="min-h-[68px]"
                    placeholder={t.trades.drawer.extraNotePlaceholder}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                {statusMsg && (
                  <div className="rounded-lg border border-[var(--profit-border)] bg-[var(--profit-bg)] px-3 py-2 text-xs text-profit">
                    {statusMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="rounded-lg border border-[var(--loss-border)] bg-[var(--loss-bg)] px-3 py-2 text-xs text-loss">
                    {errorMsg}
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="flex items-center justify-between border-t border-border bg-sidebar px-6 py-3.5">
                <Button type="button" size="sm" variant="destructive" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.trades.drawer.deleteTrade}
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onClose}>
                    {t.common.close}
                  </Button>
                  <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? t.common.saving : t.common.save}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ShareTradeDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        trade={trade}
        accountBalance={accountBalance}
        timezone={timezone}
      />
    </>
  );
}
