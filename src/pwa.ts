import { useCallback, useEffect, useState } from 'react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Install-app state: Android/desktop get the native prompt, iOS gets Add to Home Screen steps. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && isStandalone());
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setDeferred(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); try { localStorage.setItem('bq-just-installed', '1'); } catch { /* ignore */ } };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome === 'accepted';
  }, [deferred]);
  return { canInstall: Boolean(deferred) && !installed, installed, install, iosHint: !installed && isIos() };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'subscribed' : 'granted';
}

/** Ask permission (must run from a tap), subscribe this device and store it in Firestore via the API. */
export async function enablePush(getToken: () => Promise<string>): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken();
  const keyRes = await fetch('/api/push/public-key', { headers: { Authorization: `Bearer ${token}` } });
  if (!keyRes.ok) throw new Error('Could not load the notification key.');
  const { publicKey } = await keyRes.json() as { publicKey: string };
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const existingKey = sub.options.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
    if (existingKey && existingKey !== publicKey) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const save = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!save.ok) throw new Error('Could not save this device for notifications.');
  return 'subscribed';
}

export async function sendTestPush(getToken: () => Promise<string>) {
  const token = await getToken();
  await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

/** Admin avatar comes from Firestore (public, read-only URL) so it shows on every device. */
export function useAdminAvatar() {
  const [avatarUrl, setAvatarUrl] = useState(() => { try { return localStorage.getItem('brandique-admin-avatar') || ''; } catch { return ''; } });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public-profile', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((data: { avatarUrl?: string } | null) => {
      if (cancelled || !data) return;
      const url = data.avatarUrl || '';
      setAvatarUrl(url);
      try { if (url) localStorage.setItem('brandique-admin-avatar', url); else localStorage.removeItem('brandique-admin-avatar'); } catch { /* ignore */ }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const update = useCallback((url: string) => { setAvatarUrl(url); try { localStorage.setItem('brandique-admin-avatar', url); } catch { /* ignore */ } }, []);
  return [avatarUrl, update] as const;
}
