import type { IncomingMessage, ServerResponse } from 'node:http';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { authorizeAdminToken } from './admin-auth';
import { getCorsHeaders, getErrorMessage, getErrorStatus, isRecordPayload } from './security';
import { isDashboardCollection, prepareCreateRecord, prepareSoftDelete, prepareUpdateRecord, validateRecordPayload } from './validation';

const MAX_DOC_BYTES = 220 * 1024;
const MAX_RESULTS = 100;
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

function cors(req: VercelRequest, res: VercelResponse) {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const headers = getCorsHeaders(originHeader, process.env);
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

function safeDocId(value: string) {
  if (!value || value.length > 1500 || value.includes('/')) throw Object.assign(new Error('Invalid document ID.'), { statusCode: 400 });
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return sendError(res, 403, 'Origin not allowed.');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const queryRoute = Array.isArray(req.query.route) ? req.query.route.join('/') : String(req.query.route || '');
  // Vercel catch-all routes can expose the wildcard differently across runtime/build versions.
  // Fall back to the URL path so /api/health is recognized reliably.
  const pathname = String(req.url || '').split('?')[0];
  const pathRoute = pathname.startsWith('/api/') ? pathname.slice('/api/'.length).replace(/\/$/, '') : '';
  const route = queryRoute || pathRoute;
  if (route === 'health' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'BrandiQue Data API',
      projectConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
      adminAllowlistConfigured: Boolean(process.env.ADMIN_EMAILS)
    });
  }

  try {
    const admin = await requireAdmin(req);
    const db = getFirestore(getApp());

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
    if (status === 401 || status === 403 || status === 400) return sendError(res, status, getErrorMessage(error) || 'Request rejected.');
    console.error('BrandiQue Data API error:', getErrorMessage(error));
    return sendError(res, 500, 'Server error. Check deployment environment variables and server logs.');
  }
}
