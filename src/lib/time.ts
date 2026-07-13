export function formatDateTime(value: string | number) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Beirut',
    timeZoneName: 'short',
  }).format(new Date(value));
}

export function formatUtc(value: string | number) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(value)) + ' UTC';
}

export function relativeTime(value: string | number, now = Date.now()) {
  const deltaMinutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (deltaMinutes < 1) return 'just now';
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}
