// frontend/src/utils/format.js

export function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  return Number(value).toLocaleString('en-US');
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function relativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  if (diff < 30 * day) {
    const w = Math.floor(diff / (7 * day));
    return `${w} week${w === 1 ? '' : 's'} ago`;
  }
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function initials(name = '') {
  const clean = String(name).replace(/[—–-].*$/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// The six orb / card gradient presets. Picked by hashing an id so the same
// generation always gets the same colours across renders and pages.
export const GRADIENT_PRESETS = [
  { name: 'purple-blue', from: '#7c3aed', to: '#2563eb' },
  { name: 'orange-red', from: '#ea580c', to: '#dc2626' },
  { name: 'teal-green', from: '#0d9488', to: '#16a34a' },
  { name: 'pink-purple', from: '#db2777', to: '#7c3aed' },
  { name: 'blue-cyan', from: '#2563eb', to: '#0891b2' },
  { name: 'gray-dark', from: '#374151', to: '#111827' }
];

export function hashString(input = '') {
  let hash = 0;
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function gradientFor(id) {
  return GRADIENT_PRESETS[hashString(id) % GRADIENT_PRESETS.length];
}

export function truncate(text = '', max = 120) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export const LANGUAGE_LABELS = {
  english: 'English',
  urdu: 'Urdu (Roman)',
  hindi: 'Hindi (Roman)',
  bilingual: 'Bilingual'
};

export function languageLabel(code) {
  return LANGUAGE_LABELS[code] ?? code ?? '';
}

export const TIER_LABELS = { free: 'Free', pro: 'Pro', scale: 'Scale' };

export function tierLabel(tier) {
  return TIER_LABELS[tier] ?? 'Free';
}
