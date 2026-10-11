import { createHash } from 'node:crypto';
import webpush from 'web-push';
import type { Firestore, Query } from 'firebase-admin/firestore';

// Server-only collections. Firestore rules deny all client access by default,
// so these are reachable only through the Admin SDK in this API.
const CONFIG_COLLECTION = 'system_config';
const CONFIG_DOC = 'web_push_vapid';
const SUBSCRIPTIONS = 'push_subscriptions';
const CONTACT = 'mailto:brandiquewebsolutions@gmail.com';

export const NOTIFY_COLLECTIONS = ['messages', 'n8n_project_forms'] as const;
export type NotifyCollection = typeof NOTIFY_COLLECTIONS[number];

type Vapid = { publicKey: string; privateKey: string };
let cached: Vapid | null = null;

export async function getVapid(db: Firestore): Promise<Vapid> {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
  const snap = await ref.get();
  const data = snap.data();
  if (data && typeof data.publicKey === 'string' && typeof data.privateKey === 'string') {
    cached = { publicKey: data.publicKey, privateKey: data.privateKey };
    return cached;
  }
  const keys = webpush.generateVAPIDKeys();
  try {
    await ref.create({ ...keys, createdAt: new Date().toISOString() });
    cached = keys;
  } catch {
    // Another request created the keys first; use those.
    const again = (await ref.get()).data() as Vapid;
    cached = { publicKey: again.publicKey, privateKey: again.privateKey };
  }
  return cached;
}

function subId(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
}

type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export function parseSubscription(value: unknown): SubscriptionInput | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const keys = v.keys as Record<string, unknown> | undefined;
  if (typeof v.endpoint !== 'string' || !v.endpoint.startsWith('https://') || v.endpoint.length > 2000) return null;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) return null;
  return { endpoint: v.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export async function saveSubscription(db: Firestore, sub: SubscriptionInput, admin: { uid: string; email: string }, userAgent: string) {
  await db.collection(SUBSCRIPTIONS).doc(subId(sub.endpoint)).set({
    endpoint: sub.endpoint, keys: sub.keys, uid: admin.uid, email: admin.email,
    userAgent: userAgent.slice(0, 300), updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function removeSubscription(db: Firestore, endpoint: string) {
  await db.collection(SUBSCRIPTIONS).doc(subId(endpoint)).delete();
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export async function sendToAll(db: Firestore, payload: PushPayload, onlyUid?: string) {
  const vapid = await getVapid(db);
  webpush.setVapidDetails(CONTACT, vapid.publicKey, vapid.privateKey);
  let query: Query = db.collection(SUBSCRIPTIONS);
  if (onlyUid) query = query.where('uid', '==', onlyUid);
  const snap = await query.limit(50).get();
  let sent = 0;
  await Promise.all(snap.docs.map(async doc => {
    const data = doc.data();
    try {
      await webpush.sendNotification({ endpoint: data.endpoint, keys: data.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await doc.ref.delete().catch(() => undefined);
    }
  }));
  return { sent, total: snap.size };
}

function toMillis(value: unknown): number {
  if (typeof value === 'string') return Date.parse(value);
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  return NaN;
}

function text(value: unknown, max = 80) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

export function describeSubmission(collection: NotifyCollection, data: Record<string, unknown>): PushPayload {
  const name = text(data.name) || text(data.fullName) || text(data.email) || 'Someone';
  if (collection === 'n8n_project_forms') {
    const project = text(data.projectTitle) || text(data.workflowTitle) || text(data.projectName) || 'an automation';
    return { title: 'New automation enquiry', body: `${name} asked about ${project}`, url: '/?section=n8n_project_forms', tag: 'automation-enquiry' };
  }
  const service = text(data.service);
  const kind = data.source === 'service' ? 'New service enquiry' : 'New contact form';
  return { title: kind, body: service ? `${name} · ${service}` : `${name} sent a message`, url: '/?section=messages', tag: 'lead' };
}

/** Notify admins about a public form submission exactly once, and only for fresh documents. */
export async function notifySubmission(db: Firestore, collection: NotifyCollection, id: string) {
  const ref = db.collection(collection).doc(id);
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    if (data.pushNotifiedAt) return null;
    const created = toMillis(data.createdAt);
    if (!Number.isFinite(created) || Math.abs(Date.now() - created) > 15 * 60 * 1000) return null;
    tx.update(ref, { pushNotifiedAt: new Date().toISOString() });
    return data;
  });
  if (!claimed) return { sent: 0, skipped: true };
  return { ...(await sendToAll(db, describeSubmission(collection, claimed))), skipped: false };
}
