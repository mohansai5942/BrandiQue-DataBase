/**
 * Lead notification helpers for the BrandiQue Data Console.
 *
 * Design note: this dashboard reads Firestore through its server API
 * (`/api/data`, Firebase Admin SDK + admin email allowlist). The Firestore
 * security rules intentionally deny direct browser reads on `messages` and
 * `n8n_project_forms`, so client-side onSnapshot listeners cannot work here.
 * New-entry detection therefore polls the existing secure API on a short
 * interval and diffs against a persisted per-collection last-seen timestamp.
 *
 * Push-when-closed is already handled separately: brandique.in calls
 * POST /api/notify-submission after each form submit, and the console's
 * existing Web Push subscription (src/pwa.ts) delivers it to the device.
 * Everything in this file covers "while the dashboard is open".
 */

export type WatchCollection = 'messages' | 'n8n_project_forms' | 'projects' | 'websites';

export const WATCH_COLLECTIONS: WatchCollection[] = ['messages', 'n8n_project_forms', 'projects', 'websites'];

/** How often the dashboard checks for new documents (ms). */
export const POLL_INTERVAL_MS = 20_000;

/** Only surface in-app alerts for docs created within the last N minutes,
 *  so reopening the dashboard after a weekend doesn't fire a toast pileup. */
export const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

export interface LeadEvent {
  key: string; // `${collection}:${docId}`
  collection: WatchCollection;
  id: string;
  title: string;
  detail: string;
  at: string; // ISO timestamp
}

const LS_LAST_SEEN = 'bq-notify-lastseen-v1';
const LS_EVENTS = 'bq-notify-events-v1';
const LS_SEEN_AT = 'bq-notify-seenat-v1';
const LS_ASKED = 'bq-notify-permission-asked-v1';
const LS_MUTED = 'bq-notify-muted-v1';
const MAX_EVENTS = 30;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — notifications still work for this session */
  }
}

export function loadLastSeen(): Partial<Record<WatchCollection, string>> {
  return readJson<Partial<Record<WatchCollection, string>>>(LS_LAST_SEEN, {});
}

export function saveLastSeen(value: Partial<Record<WatchCollection, string>>): void {
  writeJson(LS_LAST_SEEN, value);
}

export function loadEvents(): LeadEvent[] {
  const events = readJson<LeadEvent[]>(LS_EVENTS, []);
  return Array.isArray(events) ? events.slice(0, MAX_EVENTS) : [];
}

export function saveEvents(events: LeadEvent[]): void {
  writeJson(LS_EVENTS, events.slice(0, MAX_EVENTS));
}

export function loadSeenAt(): string {
  try {
    return localStorage.getItem(LS_SEEN_AT) || '';
  } catch {
    return '';
  }
}

export function saveSeenAt(iso: string): void {
  try {
    localStorage.setItem(LS_SEEN_AT, iso);
  } catch {
    /* ignore */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(LS_MUTED) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(LS_MUTED, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function permissionAsked(): boolean {
  try {
    return localStorage.getItem(LS_ASKED) === '1';
  } catch {
    return true; // if storage is broken, never nag
  }
}

function markPermissionAsked(): void {
  try {
    localStorage.setItem(LS_ASKED, '1');
  } catch {
    /* ignore */
  }
}

/** True when we may show the one-time "enable desktop notifications" banner. */
export function shouldAskNativePermission(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' && !permissionAsked();
}

/** Must be called from a user gesture. Returns true when permission was granted. */
export async function requestNativePermission(): Promise<boolean> {
  try {
    const result = await Notification.requestPermission();
    markPermissionAsked();
    return result === 'granted';
  } catch {
    markPermissionAsked();
    return false;
  }
}

export function dismissNativePermissionAsk(): void {
  markPermissionAsked();
}

export function nativePermissionGranted(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
}

/** Relative timestamp: "just now", "2m ago", "3h ago", "5d ago". */
export function timeAgo(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

function snippet(value: unknown, max = 90): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Human-readable title/detail for a newly arrived document. Pure function. */
export function summarizeRecord(
  collection: WatchCollection,
  record: Record<string, unknown>,
): { title: string; detail: string } {
  const name = String(record.name || record.title || record.email || 'Someone');
  const phone = String(record.phone || '').trim();
  const who = phone ? `${name} — ${phone}` : name;
  switch (collection) {
    case 'messages': {
      const service = String(record.service || '').trim();
      const detail = service ? `Interested in: ${service}` : snippet(record.message) || 'Contact form submission';
      return { title: `New lead: ${who}`, detail };
    }
    case 'n8n_project_forms': {
      const project = String(record.projectTitle || '').trim();
      return {
        title: `New automation enquiry: ${who}`,
        detail: project ? `For workflow: ${project}` : snippet(record.message) || 'Automation enquiry',
      };
    }
    case 'projects':
      return { title: `New project: ${name}`, detail: String(record.category || 'Portfolio').trim() || 'Portfolio' };
    case 'websites':
      return { title: `New website: ${name}`, detail: String(record.url || '').trim() || 'Website record' };
  }
}

let audioContext: AudioContext | null = null;

/** Subtle notification beep synthesized with WebAudio — no asset file needed. */
export function playBeep(): void {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = audioContext || new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    /* audio unavailable — stay silent */
  }
}
