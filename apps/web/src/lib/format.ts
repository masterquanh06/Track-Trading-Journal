export function formatCurrency(value: string | number, currency = 'USD', showSign = false): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '$0.00';

  const absFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));

  if (num < 0) return `-${absFormatted}`;
  if (showSign && num > 0) return `+${absFormatted}`;
  return absFormatted;
}

export function formatCompactCurrency(value: string | number, currency = 'USD'): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    notation: Math.abs(num) >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(num) >= 1000 ? 0 : 2,
  }).format(num);
}

export function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    const remSec = seconds % 60;
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 24) {
    return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export function formatDateTimeInTz(isoUtc: string, timeZone = 'Asia/Ho_Chi_Minh'): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date(isoUtc))
      .replace(',', '');
  } catch {
    return isoUtc.slice(0, 16).replace('T', ' ');
  }
}

export function formatShortDate(yyyyMmDd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return yyyyMmDd;
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export function pnlColorClass(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (num > 0) return 'text-profit';
  if (num < 0) return 'text-loss';
  return 'text-fg-muted';
}

export const BROKER_TIMEZONE_PRESETS = [
  { value: 'Europe/Athens', label: 'Europe/Athens (MT5 GMT+2 / GMT+3 DST)' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki (MT5 GMT+2 / GMT+3 DST)' },
  { value: 'UTC+2', label: 'UTC+2 (Giờ mùa đông cố định)' },
  { value: 'UTC+3', label: 'UTC+3 (Giờ mùa hè cố định)' },
  { value: 'UTC', label: 'UTC+0' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Việt Nam (UTC+7)' },
];

export const DISPLAY_TIMEZONE_PRESETS = [
  { value: 'Asia/Ho_Chi_Minh', short: 'UTC+7', label: 'Việt Nam (UTC+7)' },
  { value: 'UTC', short: 'UTC+0', label: 'UTC (UTC+0)' },
  { value: 'America/New_York', short: 'NY', label: 'New York (EST/EDT)' },
  { value: 'Europe/London', short: 'LDN', label: 'London (GMT/BST)' },
  { value: 'Asia/Tokyo', short: 'UTC+9', label: 'Tokyo (UTC+9)' },
];

export function getShortTimezoneLabel(tz = 'Asia/Ho_Chi_Minh'): string {
  const found = DISPLAY_TIMEZONE_PRESETS.find((p) => p.value === tz);
  if (found) return found.short;
  return tz.replace(/_/g, ' ');
}

export function getFullTimezoneLabel(tz = 'Asia/Ho_Chi_Minh'): string {
  const found = DISPLAY_TIMEZONE_PRESETS.find((p) => p.value === tz);
  if (found) return found.label;
  return tz.replace(/_/g, ' ');
}
