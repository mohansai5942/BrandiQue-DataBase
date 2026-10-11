import type { IncomingMessage, ServerResponse } from 'node:http';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { authorizeAdminToken } from './_admin-auth.js';
import { createRateLimiter, getCorsHeaders, getErrorStatus, getPublicErrorMessage, isRecordPayload, type CorsScope } from './_security.js';
import { NOTIFY_COLLECTIONS, getVapid, notifySubmission, parseSubscription, removeSubscription, saveSubscription, sendToAll, type NotifyCollection } from './_push.js';
import { isDashboardCollection, isSafeDocId, prepareCreateRecord, prepareSoftDelete, prepareUpdateRecord, validateRecordPayload, validateRecordShape } from './_validation.js';

const MAX_DOC_BYTES = 220 * 1024;
const MAX_RESULTS = 100;
const BACKUP_COLLECTIONS = ['messages', 'projects', 'settings', 'websites', 'n8n_projects', 'n8n_project_forms', 'prompts'] as const;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_DOC_BYTES = 900 * 1024;
const MAX_IMPORT_DOCS_PER_REQUEST = 500;
const PERMANENT_DELETE_COLLECTIONS = new Set<string>(BACKUP_COLLECTIONS);
// Firestore auto-IDs are 20 alphanumeric characters; allow a little slack for custom IDs.
const NOTIFY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const notifyLimiter = createRateLimiter(20, 10 * 60 * 1000);
const publicProfileLimiter = createRateLimiter(120, 60 * 1000);
function restoreBackupTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreBackupTimestamps);
  if (!isRecordPayload(value)) return value;
  if (value.type === 'firestore/timestamp/1.0' && typeof value.seconds === 'number') return new Timestamp(value.seconds, typeof value.nanoseconds === 'number' ? value.nanoseconds : 0);
  if (typeof value._seconds === 'number' && typeof value._nanoseconds === 'number' && Object.keys(value).every(key => key === '_seconds' || key === '_nanoseconds')) return new Timestamp(value._seconds, value._nanoseconds);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreBackupTimestamps(child)]));
}
type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
};

function getApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.project_id !== process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID) {
      throw new Error('Service account project mismatch.');
    }
    return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  }
  // Useful for Vercel deployments using an explicitly configured Google runtime identity.
  return initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'brandique-web-solutions' });
}

function cors(req: VercelRequest, res: VercelResponse, scope: CorsScope) {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const headers = getCorsHeaders(originHeader, process.env, scope);
  if (!headers) return false;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return true;
}
function sendError(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ ok: false, error: message });
}

function readQuery(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

async function requireAdmin(req: VercelRequest) {
  return authorizeAdminToken(req.headers.authorization, getAuth(getApp()), process.env.ADMIN_EMAILS);
}

function safeDocId(value: unknown) {
  if (!isSafeDocId(value)) throw Object.assign(new Error('Invalid document ID.'), { statusCode: 400 });
  return value;
}

function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('Body must be valid JSON.'), { statusCode: 400 }); }
}

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const queryRoute = Array.isArray(req.query.route) ? req.query.route.join('/') : String(req.query.route || '');
  // Vercel catch-all routes can expose the wildcard differently across runtime/build versions.
  // Fall back to the URL path so /api/health is recognized reliably.
  const pathname = String(req.url || '').split('?')[0];
  const pathRoute = pathname.startsWith('/api/') ? pathname.slice('/api/'.length).replace(/\/$/, '') : '';
  const route = queryRoute || pathRoute;

  // Only the submission ping may be called cross-origin from brandique.in; everything else is dashboard-only.
  if (!cors(req, res, route === 'notify-submission' ? 'submission' : 'dashboard')) return sendError(res, 403, 'Origin not allowed.');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Public: the login screen avatar. Returns only the avatar URL, nothing else from settings.
  if (route === 'public-profile' && req.method === 'GET') {
    try {
      if (!publicProfileLimiter(clientIp(req))) return sendError(res, 429, 'Too many requests.');
      const snap = await getFirestore(getApp()).collection('settings').limit(20).get();
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
      const pick = docs.find(d => d.id === 'admin-profile' && d.adminAvatarUrl) || docs.find(d => d.id === 'contact' && d.adminAvatarUrl) || docs.find(d => typeof d.adminAvatarUrl === 'string' && d.adminAvatarUrl);
      const url = pick && typeof pick.adminAvatarUrl === 'string' && pick.adminAvatarUrl.length <= 2048 && /^https?:\/\/[^\s]+$/.test(pick.adminAvatarUrl) ? pick.adminAvatarUrl : '';
      return res.status(200).json({ ok: true, avatarUrl: url });
    } catch (error) {
      console.error('public-profile failed:', error instanceof Error ? error.message : 'unknown');
      return sendError(res, 500, 'Server error. Please try again later.');
    }
  }

  // Public: brandique.in pings this after a visitor submits a form. It carries no content; the server
  // re-reads the document, requires it to exist, be under 15 minutes old and not yet notified, and builds
  // the notification text itself (fixed titles, capped lengths).
  if (route === 'notify-submission' && req.method === 'POST') {
    try {
      if (typeof req.body === 'string' && req.body.length > 1024) return sendError(res, 413, 'Request too large.');
      if (!notifyLimiter(clientIp(req))) return sendError(res, 429, 'Too many requests.');
      let body: unknown;
      try { body = parseJsonBody(req.body); } catch { body = null; }
      if (!isRecordPayload(body) || typeof body.collection !== 'string' || typeof body.id !== 'string') return sendError(res, 400, 'Invalid request.');
      if (!(NOTIFY_COLLECTIONS as readonly string[]).includes(body.collection)) return sendError(res, 400, 'Invalid request.');
      if (!NOTIFY_ID_PATTERN.test(body.id)) return sendError(res, 400, 'Invalid request.');
      const result = await notifySubmission(getFirestore(getApp()), body.collection as NotifyCollection, body.id);
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error('notify-submission failed:', error instanceof Error ? error.message : 'unknown');
      return sendError(res, 500, 'Server error. Please try again later.');
    }
  }

  try {
    // Every route below requires a verified, allowlisted Firebase admin.
    const admin = await requireAdmin(req);
    const db = getFirestore(getApp());

    if (route === 'health' && req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        service: 'BrandiQue Data API',
        projectConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
        adminAllowlistConfigured: Boolean(process.env.ADMIN_EMAILS)
      });
    }

    if (route === 'permanent-delete' && req.method === 'POST') {
      const body = parseJsonBody(req.body);
      if (!isRecordPayload(body) || body.confirmation !== 'DELETE' || typeof body.collection !== 'string' || !PERMANENT_DELETE_COLLECTIONS.has(body.collection) || !isSafeDocId(body.id)) {
        return sendError(res, 400, 'Invalid collection, record ID, or confirmation.');
      }
      const ref = db.collection(body.collection).doc(body.id);
      if (!(await ref.get()).exists) return sendError(res, 404, 'Record was not found. It may already have been deleted.');
      await ref.delete();
      return res.status(200).json({ ok: true, permanentlyDeleted: true, collection: body.collection, id: body.id });
    }

    if (route === 'push-public-key' && req.method === 'GET') {
      return res.status(200).json({ ok: true, publicKey: (await getVapid(db)).publicKey });
    }
    if (route === 'push-subscribe' && req.method === 'POST') {
      const body = parseJsonBody(req.body);
      const sub = isRecordPayload(body) ? parseSubscription(body.subscription) : null;
      if (!sub) return sendError(res, 400, 'Invalid push subscription.');
      await saveSubscription(db, sub, admin, String(req.headers['user-agent'] || ''));
      return res.status(200).json({ ok: true });
    }
    if (route === 'push-unsubscribe' && req.method === 'POST') {
      const body = parseJsonBody(req.body);
      if (isRecordPayload(body) && typeof body.endpoint === 'string' && body.endpoint.startsWith('https://') && body.endpoint.length <= 2000) await removeSubscription(db, body.endpoint);
      return res.status(200).json({ ok: true });
    }
    if (route === 'push-test' && req.method === 'POST') {
      const result = await sendToAll(db, { title: 'Notifications are on', body: 'New form submissions will show up here.', url: '/', tag: 'test' }, admin.uid);
      return res.status(200).json({ ok: true, ...result });
    }

    if (route === 'backup') {
      if (req.method === 'GET') {
        const collectionName = readQuery(req.query.collection);
        if (!BACKUP_COLLECTIONS.includes(collectionName as typeof BACKUP_COLLECTIONS[number])) return sendError(res, 400, 'Unsupported collection.');
        const after = readQuery(req.query.after);
        if (after) safeDocId(after);
        let query = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(5);
        if (after) query = query.startAfter(after);
        const snapshot = await query.get();
        const documents = snapshot.docs.map(document => ({ id: document.id, data: document.data() as Record<string, unknown> }));
        const nextCursor = snapshot.size === 5 ? snapshot.docs[snapshot.docs.length - 1]?.id || null : null;
        return res.status(200).json({ ok: true, collection: collectionName, documents, nextCursor, done: nextCursor === null });
      }
      if (req.method === 'POST') {
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
        if (Buffer.byteLength(rawBody, 'utf8') > MAX_BACKUP_BYTES) return sendError(res, 413, 'Import request is larger than the 50 MB limit.');
        const body = parseJsonBody(req.body);
        if (isRecordPayload(body) && body.action === 'delete-all') {
          if (body.confirmation !== 'DELETE ALL') return sendError(res, 400, 'Permanent deletion confirmation is missing.');
          const deletedByCollection: Record<string, number> = {};
          const collections = await db.listCollections();
          for (const ref of collections) {
            const countSnapshot = await ref.count().get();
            deletedByCollection[ref.id] = countSnapshot.data().count;
            await db.recursiveDelete(ref);
          }
          return res.status(200).json({ ok: true, permanentlyDeleted: true, deletedByCollection, message: 'All Firestore top-level collections and nested subcollections were permanently deleted.' });
        }
        if (!isRecordPayload(body) || body.format !== 'brandique-firestore-export' || body.formatVersion !== 1 || !isRecordPayload(body.collections)) return sendError(res, 400, 'Invalid BrandiQue JSON backup.');
        const entries: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
        for (const [name, value] of Object.entries(body.collections)) {
          if (!BACKUP_COLLECTIONS.includes(name as typeof BACKUP_COLLECTIONS[number])) return sendError(res, 400, `Unsupported backup collection: ${name}`);
          if (!isRecordPayload(value) || !Array.isArray(value.documents)) return sendError(res, 400, `Invalid document list for ${name}.`);
          for (const document of value.documents) {
            if (!isRecordPayload(document) || !isSafeDocId(document.id) || !isRecordPayload(document.data)) return sendError(res, 400, `Invalid document in ${name}; no writes were started.`);
            if (validateRecordShape(document.data) || Buffer.byteLength(JSON.stringify(document.data), 'utf8') > MAX_IMPORT_DOC_BYTES) return sendError(res, 400, `Document ${document.id.slice(0, 60)} in ${name} is too large or malformed; no writes were started.`);
            if (entries.length >= MAX_IMPORT_DOCS_PER_REQUEST) return sendError(res, 413, `Send at most ${MAX_IMPORT_DOCS_PER_REQUEST} documents per import request.`);
            entries.push({ collection: name, id: document.id, data: document.data });
          }
        }
        let written = 0;
        for (let start = 0; start < entries.length; start += 100) {
          const batch = db.batch();
          for (const entry of entries.slice(start, start + 100)) batch.set(db.collection(entry.collection).doc(entry.id), restoreBackupTimestamps(entry.data) as Record<string, unknown>);
          await batch.commit();
          written += Math.min(100, entries.length - start);
        }
        return res.status(200).json({ ok: true, importedDocuments: written });
      }
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return sendError(res, 405, 'Method not allowed for backup endpoint.');
    }

    if (route !== 'data') return sendError(res, 404, 'Endpoint not found.');
    const collectionName = readQuery(req.query.collection);
    if (!isDashboardCollection(collectionName)) return sendError(res, 400, 'Collection is not available through this dashboard.');
    const collection = collectionName;
    const collectionRef = db.collection(collectionName);
    const id = readQuery(req.query.id);

    if (req.method === 'GET' && !id) {
      const snapshot = await collectionRef.limit(MAX_RESULTS).get();
      const records = snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
      return res.status(200).json({ ok: true, records, limit: MAX_RESULTS, returned: records.length });
    }

    if (req.method === 'GET' && id) {
      const snapshot = await collectionRef.doc(safeDocId(id)).get();
      if (!snapshot.exists) return sendError(res, 404, 'Record not found.');
      return res.status(200).json({ ok: true, record: { ...snapshot.data(), id: snapshot.id } });
    }

    if (req.method === 'POST') {
      const data = req.body;
      if (!isRecordPayload(data)) return sendError(res, 400, 'Body must be a JSON object.');
      const validationError = validateRecordPayload(collection, data, 'create');
      if (validationError) return sendError(res, 400, validationError);
      const payload = prepareCreateRecord(data);
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_DOC_BYTES) return sendError(res, 413, 'Record is too large. Store images/files in file storage and save URLs here.');
      const requestedId = collectionName === 'settings' && typeof data.id === 'string' ? safeDocId(data.id) : '';
      const ref = requestedId ? collectionRef.doc(requestedId) : collectionRef.doc();
      if (requestedId && (await ref.get()).exists) return sendError(res, 409, 'A record with this ID already exists. Edit the existing record instead.');
      await ref.set(payload);
      return res.status(201).json({ ok: true, record: { id: ref.id, ...payload } });
    }

    if (req.method === 'PATCH' && id) {
      const data = req.body;
      if (!isRecordPayload(data)) return sendError(res, 400, 'Body must be a JSON object.');
      const validationError = validateRecordPayload(collection, data, 'update');
      if (validationError) return sendError(res, 400, validationError);
      const payload = prepareUpdateRecord(data);
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_DOC_BYTES) return sendError(res, 413, 'Record is too large. Store images/files in file storage and save URLs here.');
      const ref = collectionRef.doc(safeDocId(id));
      const existing = await ref.get();
      if (!existing.exists) return sendError(res, 404, 'Record not found.');
      await ref.set(payload, { merge: true });
      const updated = await ref.get();
      return res.status(200).json({ ok: true, record: { ...updated.data(), id: updated.id } });
    }

    if (req.method === 'DELETE' && id) {
      const ref = collectionRef.doc(safeDocId(id));
      const existing = await ref.get();
      if (!existing.exists) return sendError(res, 404, 'Record not found.');
      await ref.set(prepareSoftDelete(), { merge: true });
      return res.status(200).json({ ok: true, deleted: true, mode: 'soft-delete' });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
    return sendError(res, 405, 'Method not allowed for this endpoint.');
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    if (status >= 400 && status < 500) return sendError(res, status, getPublicErrorMessage(error));
    console.error('BrandiQue Data API error:', error instanceof Error ? error.message : 'unknown');
    return sendError(res, 500, 'Server error. Check deployment environment variables and server logs.');
  }
}
