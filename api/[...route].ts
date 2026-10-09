import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_COLLECTIONS = new Set([
  'messages',
  'projects',
  'settings',
  'websites',
  'n8n_projects',
  'n8n_project_forms',
  'prompts'
]);
const MAX_DOC_BYTES = 220 * 1024;
const MAX_RESULTS = 100;

function getApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.project_id !== process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_PROJECT_ID) {
      throw new Error('Service account project mismatch.');
    }
    return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  }
  // Useful for Vercel deployments using an explicitly configured Google runtime identity.
  return initializeApp({ credential: applicationDefault(), projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'brandique-web-solutions' });
}

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const allowed = [
    process.env.DASHBOARD_ORIGIN || '',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim())
  ].filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  return !origin || allowed.includes(origin);
}

function sendError(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ ok: false, error: message });
}

function readQuery(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

async function requireAdmin(req: VercelRequest) {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw Object.assign(new Error('Sign-in required.'), { statusCode: 401 });
  const decoded = await getAuth(getApp()).verifyIdToken(match[1]);
  const email = (decoded.email || '').toLowerCase().trim();
  const allowedEmails = (process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowedEmails.includes(email) || decoded.email_verified !== true) {
    throw Object.assign(new Error('This account is not an authorized, verified administrator.'), { statusCode: 403 });
  }
  return { uid: decoded.uid, email };
}

function safeDocId(value: string) {
  if (!value || value.length > 1500 || value.includes('/')) throw Object.assign(new Error('Invalid document ID.'), { statusCode: 400 });
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return sendError(res, 403, 'Origin not allowed.');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const route = Array.isArray(req.query.route) ? req.query.route.join('/') : String(req.query.route || '');
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
    if (!ALLOWED_COLLECTIONS.has(collectionName)) return sendError(res, 400, 'Collection is not available through this dashboard.');
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
      if (!data || typeof data !== 'object' || Array.isArray(data)) return sendError(res, 400, 'Body must be a JSON object.');
      const payload = { ...data };
      delete payload.id;
      payload.updatedAt = new Date().toISOString();
      payload.createdAt = payload.createdAt || new Date().toISOString();
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_DOC_BYTES) return sendError(res, 413, 'Record is too large. Store images/files in file storage and save URLs here.');
      const requestedId = collectionName === 'settings' && typeof data.id === 'string' ? safeDocId(data.id) : '';
      const ref = requestedId ? collectionRef.doc(requestedId) : collectionRef.doc();
      if (requestedId && (await ref.get()).exists) return sendError(res, 409, 'A record with this ID already exists. Edit the existing record instead.');
      await ref.set(payload);
      return res.status(201).json({ ok: true, record: { id: ref.id, ...payload } });
    }

    if (req.method === 'PATCH' && id) {
      const data = req.body;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return sendError(res, 400, 'Body must be a JSON object.');
      const payload = { ...data };
      delete payload.id;
      payload.updatedAt = new Date().toISOString();
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
      await ref.set({ isDeleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      return res.status(200).json({ ok: true, deleted: true, mode: 'soft-delete' });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
    return sendError(res, 405, 'Method not allowed for this endpoint.');
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    if (status === 401 || status === 403 || status === 400) return sendError(res, status, error.message || 'Request rejected.');
    console.error('BrandiQue Data API error:', error?.message || error);
    return sendError(res, 500, 'Server error. Check deployment environment variables and server logs.');
  }
}
