import { useCallback, useEffect, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  FRESHNESS_WINDOW_MS,
  POLL_INTERVAL_MS,
  WATCH_COLLECTIONS,
  dismissNativePermissionAsk,
  loadEvents,
  loadLastSeen,
  loadMuted,
  loadSeenAt,
  nativePermissionGranted,
  playBeep,
  requestNativePermission,
  saveEvents,
  saveLastSeen,
  saveMuted,
  saveSeenAt,
  shouldAskNativePermission,
  summarizeRecord,
  type LeadEvent,
  type WatchCollection,
} from './notifications';

type Notify = (message: string, kind?: 'success' | 'error') => void;

interface WatchResponse {
  records?: Array<Record<string, unknown> & { id: string }>;
}

export interface LeadNotifications {
  events: LeadEvent[];
  unseenCount: number;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  clearEvents: () => void;
  muted: boolean;
  toggleMute: () => void;
  bannerVisible: boolean;
  allowNative: () => void;
  dismissBanner: () => void;
}

/**
 * Watches the lead-ish collections through the existing secure server API
 * and raises in-app alerts (toast + badge + sound + notification center,
 * plus a native OS notification when permission was granted) whenever a
 * genuinely new document arrives while the dashboard is open.
 */
export function useLeadNotifications(
  user: FirebaseUser | null,
  notify: Notify,
  onFreshData?: (collection: WatchCollection) => void,
): LeadNotifications {
  const [events, setEvents] = useState<LeadEvent[]>(() => loadEvents());
  const [seenAt, setSeenAt] = useState<string>(() => loadSeenAt());
  const [panelOpen, setPanelOpen] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const [bannerVisible, setBannerVisible] = useState(false);

  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const onFreshDataRef = useRef(onFreshData);
  onFreshDataRef.current = onFreshData;
  // Document ids already accounted for this session; rebuilt on every mount.
  const knownIdsRef = useRef<Set<string> | null>(null);

  const unseenCount = seenAt ? events.filter((event) => event.at > seenAt).length : 0;

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setSeenAt(now);
    saveSeenAt(now);
  }, []);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    markSeen();
  }, [markSeen]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    saveEvents([]);
    markSeen();
  }, [markSeen]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      saveMuted(next);
      return next;
    });
  }, []);

  const dismissBanner = useCallback(() => {
    dismissNativePermissionAsk();
    setBannerVisible(false);
  }, []);

  const allowNative = useCallback(() => {
    void requestNativePermission().then((granted) => {
      setBannerVisible(false);
      if (granted) notifyRef.current('Desktop notifications on. New leads will pop up even in another tab.');
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    if (!knownIdsRef.current) knownIdsRef.current = new Set<string>();

    // Seed per-collection last-seen timestamps on first run so historical
    // documents never trigger notifications.
    const seeded = loadLastSeen();
    let touched = false;
    for (const collection of WATCH_COLLECTIONS) {
      if (!seeded[collection]) {
        seeded[collection] = new Date().toISOString();
        touched = true;
      }
    }
    if (touched) saveLastSeen(seeded);

    if (shouldAskNativePermission()) setBannerVisible(true);

    async function poll() {
      if (cancelled) return;
      let token: string;
      try {
        token = await user!.getIdToken(false);
      } catch {
        return;
      }
      const now = new Date();
      const fresh: LeadEvent[] = [];
      const seenCollections = new Set<WatchCollection>();
      for (const collection of WATCH_COLLECTIONS) {
        try {
          const response = await fetch(`/api/data?collection=${encodeURIComponent(collection)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (!response.ok) continue;
          const body = (await response.json()) as WatchResponse;
          const docs = Array.isArray(body.records) ? body.records : [];
          const lastSeen = loadLastSeen();
          const cutoff = lastSeen[collection] || now.toISOString();
          let maxAt = cutoff;
          for (const doc of docs) {
            const key = `${collection}:${doc.id}`;
            const rawAt = doc.createdAt ?? doc.updatedAt;
            const at = typeof rawAt === 'string' ? rawAt : null;
            if (at && at > maxAt) maxAt = at;
            if (knownIdsRef.current!.has(key)) continue;
            knownIdsRef.current!.add(key);
            if (!at || at <= cutoff) continue;
            // Skip docs that arrived while the dashboard was closed a while
            // ago; those were already covered by Web Push (notify-submission).
            if (now.getTime() - new Date(at).getTime() > FRESHNESS_WINDOW_MS) continue;
            const { title, detail } = summarizeRecord(collection, doc);
            fresh.push({ key, collection, id: doc.id, title, detail, at });
          }
          const next = loadLastSeen();
          if (maxAt > (next[collection] || '')) {
            next[collection] = maxAt;
            saveLastSeen(next);
          }
          seenCollections.add(collection);
        } catch {
          /* transient network/API failure — retry on the next poll */
        }
      }
      if (cancelled || fresh.length === 0) return;
      fresh.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      setEvents((previous) => {
        const next = [...fresh, ...previous].slice(0, 30);
        saveEvents(next);
        return next;
      });
      if (!mutedRef.current) playBeep();
      if (panelOpenRef.current) markSeen();
      if (fresh.length === 1) notifyRef.current(fresh[0].title);
      else notifyRef.current(`${fresh.length} new leads just came in. Open notifications to review.`);
      if (nativePermissionGranted()) {
        try {
          const first = fresh[0];
          new Notification(fresh.length === 1 ? first.title : `${fresh.length} new leads`, {
            body: fresh.length === 1 ? first.detail : fresh.slice(0, 3).map((event) => event.title).join('\n'),
            tag: 'bq-lead',
          });
        } catch {
          /* native notification failed — in-app alerts already fired */
        }
      }
      seenCollections.forEach((collection) => {
        if (fresh.some((event) => event.collection === collection)) onFreshDataRef.current?.(collection);
      });
    }

    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, markSeen]);

  return {
    events,
    unseenCount,
    panelOpen,
    openPanel,
    closePanel,
    clearEvents,
    muted,
    toggleMute,
    bannerVisible,
    allowNative,
    dismissBanner,
  };
}
