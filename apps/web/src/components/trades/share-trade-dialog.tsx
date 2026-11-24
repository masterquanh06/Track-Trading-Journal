'use client';

import * as React from 'react';
import { Check, Copy, Download, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TradeDto } from '@/lib/api';
import { formatCurrency, formatDateTimeInTz, formatDuration } from '@/lib/format';

interface ShareTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: TradeDto | null;
  accountBalance?: number;
  timezone: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function ShareTradeDialog({
  open,
  onOpenChange,
  trade,
  accountBalance = 10000,
  timezone,
}: ShareTradeDialogProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [privacyMode, setPrivacyMode] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const renderCard = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trade) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1200;
    const H = 675;
    canvas.width = W;
    canvas.height = H;

    const netNum = Number(trade.netPnl);
    const isWin = netNum >= 0;
    const accent = isWin ? '#10B981' : '#F43F5E';
    const accentSoft = isWin ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)';

    // Obsidian Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#09090B');
    bgGrad.addColorStop(0.55, '#101218');
    bgGrad.addColorStop(1, '#09090B');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Ambient Accent Glow
    const glow = ctx.createRadialGradient(W * 0.82, H * 0.25, 20, W * 0.82, H * 0.25, 440);
    glow.addColorStop(0, isWin ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)');
    glow.addColorStop(1, 'rgba(9, 9, 11, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Subtle Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let x = 60; x < W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 60; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Outer Card Frame
    drawRoundedRect(ctx, 36, 36, W - 72, H - 72, 28);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brand Header
    drawRoundedRect(ctx, 76, 74, 44, 44, 12);
    ctx.fillStyle = '#6366F1';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.fillText('T', 91, 104);

    ctx.fillStyle = '#F4F4F5';
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.fillText('TrackDailyTrade', 134, 98);
    ctx.fillStyle = '#71717A';
    ctx.font = '500 15px Inter, system-ui, sans-serif';
    ctx.fillText('VERIFIED TRADING JOURNAL', 134, 118);

    // Date Top Right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#A1A1AA';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText(formatDateTimeInTz(trade.closeTime, timezone), W - 76, 102);
    ctx.textAlign = 'left';

    // Symbol + Direction Pill
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 54px "JetBrains Mono", monospace';
    ctx.fillText(trade.symbol, 76, 220);

    const symbolWidth = ctx.measureText(trade.symbol).width;
    const pillX = 76 + symbolWidth + 22;
    drawRoundedRect(ctx, pillX, 180, 106, 46, 12);
    ctx.fillStyle = accentSoft;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(trade.direction, pillX + (trade.direction === 'BUY' ? 30 : 24), 211);

    // Compute % Return & R-Multiple
    const baseBal = accountBalance > 0 ? accountBalance : 10000;
    const pctReturn = (netNum / baseBal) * 100;
    const pctStr = `${pctReturn >= 0 ? '+' : ''}${pctReturn.toFixed(2)}%`;
    const rVal = trade.rMultiple ? Number(trade.rMultiple) : null;
    const rStr = rVal !== null ? `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R` : null;

    // Hero Metric
    const heroPrimary = privacyMode
      ? rStr ?? pctStr
      : formatCurrency(trade.netPnl, trade.accountCurrency, true);

    const heroSecondary = privacyMode
      ? rStr
        ? `Tỷ suất lợi nhuận: ${pctStr} · Số tiền đã ẩn`
        : 'Chế độ ẩn số dư (Privacy Mode)'
      : [rStr, pctStr].filter(Boolean).join('  ·  ');

    ctx.fillStyle = accent;
    ctx.font = '700 92px "JetBrains Mono", monospace';
    ctx.fillText(heroPrimary, 76, 355);

    ctx.fillStyle = '#D4D4D8';
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.fillText(heroSecondary, 76, 405);

    // Bottom Telemetry Strip
    drawRoundedRect(ctx, 76, 468, W - 152, 128, 18);
    ctx.fillStyle = 'rgba(22, 24, 29, 0.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const cols = [
      { label: 'ENTRY PRICE', value: trade.openPrice },
      { label: 'EXIT PRICE', value: trade.closePrice },
      { label: 'HOLDING TIME', value: formatDuration(trade.holdingSeconds) },
      {
        label: 'VOLUME',
        value: privacyMode ? '••• lot' : `${Number(trade.volume).toFixed(2)} lot`,
      },
    ];

    const colWidth = (W - 152) / cols.length;
    cols.forEach((col, i) => {
      const cx = 76 + i * colWidth + 28;
      ctx.fillStyle = '#71717A';
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.fillText(col.label, cx, 512);

      ctx.fillStyle = '#F4F4F5';
      ctx.font = '600 24px "JetBrains Mono", monospace';
      ctx.fillText(col.value, cx, 554);
    });

    // Tags on top-right of telemetry if present
    if (trade.tags.length > 0) {
      const tagSummary = trade.tags.map((t) => `#${t.name}`).join('  ');
      ctx.textAlign = 'right';
      ctx.fillStyle = '#818CF8';
      ctx.font = '600 18px Inter, system-ui, sans-serif';
      ctx.fillText(tagSummary, W - 76, 446);
      ctx.textAlign = 'left';
    }
  }, [trade, privacyMode, accountBalance, timezone]);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => renderCard());
    return () => cancelAnimationFrame(id);
  }, [open, renderCard]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !trade) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `TrackDailyTrade-${trade.symbol}-${trade.externalId}.png`;
    a.click();
  };

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        handleDownload();
      }
    }, 'image/png');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Chia sẻ thẻ kết quả lệnh (Share Trade Card)</DialogTitle>
        <DialogDescription>
          Xuất ảnh PNG độ phân giải cao (1200×675). Bật Privacy Mode để che số tiền thật và chỉ
          khoe R-Multiple / % lợi nhuận.
        </DialogDescription>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.1] bg-[#09090B]">
          <canvas ref={canvasRef} className="h-auto w-full block" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant={privacyMode ? 'default' : 'secondary'}
            onClick={() => setPrivacyMode((p) => !p)}
          >
            {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {privacyMode ? 'Đang ẩn số tiền ($)' : 'Ẩn số tiền (Privacy Mode)'}
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={handleCopyImage}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Đã copy ảnh' : 'Copy ảnh'}
            </Button>
            <Button type="button" size="sm" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              Tải ảnh PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
