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

/**
 * Normalizes TradingView short links (`https://www.tradingview.com/x/AbCdEfGh/`)
 * to direct snapshot images where possible, or returns original URL/dataURI.
 */
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
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Định dạng ảnh không hợp lệ'));
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
    setSelectedTagIds(trade.tags.map((t) => t.id));
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
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải ảnh lên');
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
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo tag mới');
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
      setStatusMsg('Đã lưu đầy đủ nhật ký & hình ảnh!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu nhật ký');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!trade) return;
    if (!window.confirm(`Xoá vĩnh viễn lệnh ${trade.symbol} (#${trade.externalId})?`)) return;
    try {
      await api.deleteTrade(trade.id);
      onDeleted(trade.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xoá lệnh');
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
                    <SheetTitle className="font-num text-lg font-bold tracking-tight text-white">
                      {trade.symbol}
                    </SheetTitle>
                    <Badge variant={trade.direction === 'BUY' ? 'profit' : 'loss'}>
                      {trade.direction}
                    </Badge>
                    <span className="font-num rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-zinc-400">
                      #{trade.externalId}
                    </span>
                  </div>
                  <SheetDescription className="mt-1">
                    {trade.accountName} ·{' '}
                    {trade.source === 'MT5_WEBHOOK' ? 'MT5 EA Realtime' : 'MT5 Statement Import'}
                  </SheetDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setShareOpen(true)}
                  >
                    <Share2 className="h-3.5 w-3.5 text-indigo-400" />
                    Share PNG
                  </Button>
                  <SheetCloseButton />
                </div>
              </SheetHeader>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                {/* Hero PnL & R-Multiple */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.08] bg-[#16181D] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Net PnL
                    </p>
                    <p
                      className={`font-num mt-1.5 text-2xl font-bold tracking-tight ${pnlColorClass(trade.netPnl)}`}
                    >
                      {formatCurrency(trade.netPnl, trade.accountCurrency, true)}
                    </p>
                    <p className="font-num mt-1 text-[11px] text-zinc-500">
                      Gross {formatCurrency(trade.grossPnl, trade.accountCurrency, true)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-[#16181D] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      R-Multiple
                    </p>
                    <p
                      className={`font-num mt-1.5 text-2xl font-bold tracking-tight ${
                        previewR !== null ? pnlColorClass(previewR) : 'text-zinc-500'
                      }`}
                    >
                      {previewR !== null
                        ? `${previewR >= 0 ? '+' : ''}${previewR.toFixed(2)}R`
                        : '—'}
                    </p>
                    <p className="font-num mt-1 text-[11px] text-zinc-500">
                      Giữ lệnh {formatDuration(trade.holdingSeconds)}
                    </p>
                  </div>
                </div>

                {/* 2-Column Telemetry Grid */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[11px] text-zinc-500">Mở lệnh ({shortTz})</p>
                    <p className="font-num mt-1 font-medium text-zinc-200">
                      {formatDateTimeInTz(trade.openTime, timezone)}
                    </p>
                    <p className="font-num mt-0.5 text-[11px] text-zinc-400">
                      Entry: <span className="text-zinc-200">{trade.openPrice}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[11px] text-zinc-500">Đóng lệnh ({shortTz})</p>
                    <p className="font-num mt-1 font-medium text-zinc-200">
                      {formatDateTimeInTz(trade.closeTime, timezone)}
                    </p>
                    <p className="font-num mt-0.5 text-[11px] text-zinc-400">
                      Exit: <span className="text-zinc-200">{trade.closePrice}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[11px] text-zinc-500">Volume / SL / TP cuối</p>
                    <p className="font-num mt-1 text-zinc-200">{trade.volume} lot</p>
                    <p className="font-num mt-0.5 text-[11px] text-zinc-400">
                      SL {trade.stopLoss ?? '—'} · TP {trade.takeProfit ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[11px] text-zinc-500">Phí &amp; Swap</p>
                    <p className="font-num mt-1 text-zinc-200">
                      Comm: {formatCurrency(trade.commission, trade.accountCurrency)}
                    </p>
                    <p className="font-num mt-0.5 text-[11px] text-zinc-400">
                      Swap: {formatCurrency(trade.swap, trade.accountCurrency)}
                    </p>
                  </div>
                </div>

                {/* TradingView Snapshot / Chart Screenshot */}
                <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-[#16181D]/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      TradingView Snapshot / Ảnh biểu đồ
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
                      Tải ảnh / Ctrl+V
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Dán link TradingView (https://www.tradingview.com/x/...) hoặc bấm Ctrl+V dán ảnh..."
                      value={
                        screenshotUrl.startsWith('data:image/')
                          ? '[Ảnh chụp biểu đồ đã tải lên]'
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
                        aria-label="Xoá ảnh"
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
                    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#09090B]">
                      {!imgError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolvedPreviewSrc}
                          alt="TradingView Chart Snapshot"
                          className="max-h-60 w-full object-contain"
                          onError={() => setImgError(true)}
                        />
                      ) : (
                        <div className="flex items-center justify-between p-3 text-xs text-zinc-400">
                          <span>Liên kết biểu đồ đính kèm</span>
                          <a
                            href={screenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
                          >
                            Mở xem trực tiếp <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Initial SL / Risk Editor */}
                <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#16181D]/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      Quản trị rủi ro (Initial SL &amp; 1R)
                    </span>
                    {trade.isManualRisk && (
                      <Badge variant="secondary">
                        <Lock className="h-3 w-3 text-indigo-400" />
                        Đã khoá thủ công
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400">Initial Stop Loss</label>
                      <Input
                        className="font-num mt-1 h-8 text-xs"
                        placeholder="vd: 2640.50"
                        value={initialStopLoss}
                        onChange={(e) => setInitialStopLoss(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400">
                        Rủi ro 1R ({trade.accountCurrency})
                      </label>
                      <Input
                        className="font-num mt-1 h-8 text-xs"
                        placeholder="vd: 250.00"
                        value={initialRiskAmount}
                        onChange={(e) => setInitialRiskAmount(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Strategy Tags */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-200">Tag chiến lược</h3>
                    <span className="text-[11px] text-zinc-500">
                      Đã chọn {selectedTagIds.length}
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
                              ? 'border-indigo-500/50 bg-indigo-500/15 text-white shadow-[0_0_0_1px_rgba(99,102,241,0.2)]'
                              : 'border-white/[0.08] bg-[#16181D] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200',
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                          {active && <Check className="h-3 w-3 text-indigo-300" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border border-white/[0.07] bg-[#16181D]/50 p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 flex-1 text-xs"
                        placeholder="Tạo nhanh tag mới (vd: BB Tier 3)..."
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
                        Tạo
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-500">Màu:</span>
                      {TAG_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Chọn màu ${c}`}
                          onClick={() => setNewTagColor(c)}
                          className={cn(
                            'h-4 w-4 rounded-full transition-transform',
                            newTagColor === c
                              ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-[#16181D]'
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
                    <label className="text-xs font-semibold text-zinc-200">
                      Pre-trade Plan (Kế hoạch trước lệnh)
                    </label>
                    <Textarea
                      rows={4}
                      placeholder="Bối cảnh HTF, vùng thanh khoản, tín hiệu xác nhận vào lệnh, điểm huỷ kèo..."
                      value={preTradePlan}
                      onChange={(e) => setPreTradePlan(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-200">
                      Post-trade Review (Đánh giá sau lệnh)
                    </label>
                    <Textarea
                      rows={4}
                      placeholder="Tuân thủ kỷ luật hay vào sớm/FOMO? Quản lý dời SL/chốt lời đã tối ưu chưa?"
                      value={postTradeReview}
                      onChange={(e) => setPostTradeReview(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-200">Ghi chú bổ sung</label>
                  <Textarea
                    rows={2}
                    className="min-h-[68px]"
                    placeholder="Ghi chú ngắn thêm..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                {statusMsg && (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    {statusMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {errorMsg}
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#0B0C0F]/80 px-6 py-3.5">
                <Button type="button" size="sm" variant="destructive" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Xoá lệnh
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onClose}>
                    Đóng
                  </Button>
                  <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Đang lưu...' : 'Lưu nhật ký'}
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
