import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getCorsHeaders, isRecordPayload } from './security';

const COLLECTIONS = ['messages', 'projects', 'settings', 'websites', 'n8n_projects', 'n8n_project_forms', 'prompts'] as const;
const MAX_BODY_BYTES = 50 * 1024 * 1024;
type RequestLike = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type ResponseLike = { status(code: number): ResponseLike; json(value: unknown): unknown; end(): unknown; setHeader(name: string, value: string): void };
function getAdminApp() {
  if (getApps().length) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'brandique-web-solutions';
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    return initializeApp({ credential: cert(serviceAccount), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId });
}
function sendError(res: ResponseLike, status: number, message: string) {
  return res.status(status).json({ ok: false, error: message });
}
function restoreTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreTimestamps);
  if (!isRecordPayload(value)) return value;
  if (value.type === 'firestore/timestamp/1.0' && typeof value.seconds === 'number') return new Timestamp(value.seconds, typeof value.nanoseconds === 'number' ? value.nanoseconds : 0);
  if (typeof value._seconds === 'number' && typeof value._nanoseconds === 'number' && Object.keys(value).every(key => key === '_seconds' || key === '_nanoseconds')) return new Timestamp(value._seconds, value._nanoseconds);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreTimestamps(child)]));
}
export default async function handler(req: RequestLike, res: ResponseLike) {
  const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const cors = getCorsHeaders(originHeader, process.env);
  if (!cors) return sendError(res, 403, 'Origin is not allowed.');
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendError(res, 405, 'Method not allowed.');
  }
  try {
    const authorizationHeader = req.headers.authorization;
    const authorization = Array.isArray(authorizationHeader) ? authorizationHeader[0] || '' : authorizationHeader || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) return sendError(res, 401, 'Sign in as an approved administrator first.');
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(match[1], true);
    if (!decoded.email || decoded.email_verified !== true) return sendError(res, 403, 'A verified administrator email is required.');
    const allowed = (process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length || !allowed.includes(decoded.email.toLowerCase())) return sendError(res, 403, 'This account is not on the administrator allowlist.');
    const db = getFirestore(app);
    if (req.method === 'GET') {
      const collections: Record<string, { count: number; documents: Array<{ id: string; data: Record<string, unknown> }> }> = {};
      for (const name of COLLECTIONS) {
        const snapshot = await db.collection(name).get();
        collections[name] = { count: snapshot.size, documents: snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() as Record<string, unknown> })) };
      }
      return res.status(200).json({ ok: true, format: 'brandique-firestore-export', formatVersion: 1, exportedAt: new Date().toISOString(), projectId: process.env.FIREBASE_PROJECT_ID || 'brandique-web-solutions', collections });
    }
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return sendError(res, 413, 'Import file is larger than the 50 MB limit.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!isRecordPayload(body) || body.format !== 'brandique-firestore-export' || body.formatVersion !== 1 || !isRecordPayload(body.collections)) {
      return sendError(res, 400, 'Invalid backup file. Upload a BrandiQue Firestore JSON export (formatVersion 1).');
    }
    const entries: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
    for (const [name, value] of Object.entries(body.collections)) {
      if (!COLLECTIONS.includes(name as typeof COLLECTIONS[number])) return sendError(res, 400, `Collection "${name}" is not supported by this dashboard.`);
      if (!isRecordPayload(value) || !Array.isArray(value.documents)) return sendError(res, 400, `Collection "${name}" has an invalid document list.`);
      for (const doc of value.documents) {
        if (!isRecordPayload(doc) || typeof doc.id !== 'string' || !doc.id.trim() || doc.id.includes('/') || !isRecordPayload(doc.data)) {
          return sendError(res, 400, `Collection "${name}" contains an invalid document. No data has been written.`);
        }
        entries.push({ collection: name, id: doc.id, data: doc.data });
      }
    }
    // Validate the entire file before any writes. Commit in batches below Firestore's 500-write limit.
    let written = 0;
    for (let start = 0; start < entries.length; start += 400) {
      const batch = db.batch();
      for (const entry of entries.slice(start, start + 400)) {
        batch.set(db.collection(entry.collection).doc(entry.id), restoreTimestamps(entry.data) as Record<string, unknown>);
      }
      await batch.commit();
      written += Math.min(400, entries.length - start);
    }
    return res.status(200).json({ ok: true, importedDocuments: written, collections: Object.fromEntries(COLLECTIONS.map(name => [name, entries.filter(item => item.collection === name).length])) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup operation failed.';
    return sendError(res, 500, message);
  }
}
