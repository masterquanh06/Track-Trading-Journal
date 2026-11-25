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
import { usePreferences } from '@/lib/preferences-context';

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
  const { theme, t } = usePreferences();
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

    const isDark = theme === 'dark';
    const netNum = Number(trade.netPnl);
    const isWin = netNum >= 0;
    const accent = isWin ? (isDark ? '#10B981' : '#059669') : (isDark ? '#F43F5E' : '#E11D48');
    const accentSoft = isWin ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)';

    // Background (supports Dark & Light theme!)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    if (isDark) {
      bgGrad.addColorStop(0, '#09090B');
      bgGrad.addColorStop(0.55, '#101218');
      bgGrad.addColorStop(1, '#09090B');
    } else {
      bgGrad.addColorStop(0, '#F8FAFC');
      bgGrad.addColorStop(0.55, '#FFFFFF');
      bgGrad.addColorStop(1, '#F1F5F9');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W * 0.82, H * 0.25, 20, W * 0.82, H * 0.25, 440);
    glow.addColorStop(0, isWin ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(15, 23, 42, 0.04)';
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

    drawRoundedRect(ctx, 36, 36, W - 72, H - 72, 28);
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawRoundedRect(ctx, 76, 74, 44, 44, 12);
    ctx.fillStyle = '#6366F1';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.fillText('T', 91, 104);

    ctx.fillStyle = isDark ? '#F4F4F5' : '#09090B';
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.fillText('TrackDailyTrade', 134, 98);
    ctx.fillStyle = isDark ? '#71717A' : '#64748B';
    ctx.font = '500 15px Inter, system-ui, sans-serif';
    ctx.fillText('VERIFIED TRADING JOURNAL', 134, 118);

    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#A1A1AA' : '#475569';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText(formatDateTimeInTz(trade.closeTime, timezone), W - 76, 102);
    ctx.textAlign = 'left';

    ctx.fillStyle = isDark ? '#FFFFFF' : '#09090B';
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

    const baseBal = accountBalance > 0 ? accountBalance : 10000;
    const pctReturn = (netNum / baseBal) * 100;
    const pctStr = `${pctReturn >= 0 ? '+' : ''}${pctReturn.toFixed(2)}%`;
    const rVal = trade.rMultiple ? Number(trade.rMultiple) : null;
    const rStr = rVal !== null ? `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R` : null;

    const heroPrimary = privacyMode
      ? rStr ?? pctStr
      : formatCurrency(trade.netPnl, trade.accountCurrency, true);

    const heroSecondary = privacyMode
      ? rStr
        ? `${t.trades.share.returnPctLabel}: ${pctStr} · ${t.trades.share.hiddenMoneyNote}`
        : t.trades.share.privacyModeNote
      : [rStr, pctStr].filter(Boolean).join('  ·  ');

    ctx.fillStyle = accent;
    ctx.font = '700 92px "JetBrains Mono", monospace';
    ctx.fillText(heroPrimary, 76, 355);

    ctx.fillStyle = isDark ? '#D4D4D8' : '#334155';
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.fillText(heroSecondary, 76, 405);

    drawRoundedRect(ctx, 76, 468, W - 152, 128, 18);
    ctx.fillStyle = isDark ? 'rgba(22, 24, 29, 0.88)' : 'rgba(241, 245, 249, 0.92)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.10)';
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
      ctx.fillStyle = isDark ? '#71717A' : '#64748B';
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.fillText(col.label, cx, 512);

      ctx.fillStyle = isDark ? '#F4F4F5' : '#09090B';
      ctx.font = '600 24px "JetBrains Mono", monospace';
      ctx.fillText(col.value, cx, 554);
    });

    if (trade.tags.length > 0) {
      const tagSummary = trade.tags.map((tag) => `#${tag.name}`).join('  ');
      ctx.textAlign = 'right';
      ctx.fillStyle = isDark ? '#818CF8' : '#4F46E5';
      ctx.font = '600 18px Inter, system-ui, sans-serif';
      ctx.fillText(tagSummary, W - 76, 446);
      ctx.textAlign = 'left';
    }
  }, [trade, privacyMode, accountBalance, timezone, theme, t.trades.share]);

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
        <DialogTitle>{t.trades.share.title}</DialogTitle>
        <DialogDescription>{t.trades.share.desc}</DialogDescription>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-canvas">
          <canvas ref={canvasRef} className="block h-auto w-full" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant={privacyMode ? 'default' : 'secondary'}
            onClick={() => setPrivacyMode((p) => !p)}
          >
            {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {privacyMode ? t.trades.share.privacyActive : t.trades.share.privacyToggle}
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={handleCopyImage}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-profit" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? t.trades.share.copiedImg : t.trades.share.copyImg}
            </Button>
            <Button type="button" size="sm" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              {t.trades.share.downloadPng}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
