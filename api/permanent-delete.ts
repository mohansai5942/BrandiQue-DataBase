import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_COLLECTIONS = new Set([
  'messages', 'projects', 'settings', 'websites', 'n8n_projects', 'n8n_project_forms', 'prompts',
]);

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Firebase service account is not configured.');
  const serviceAccount = JSON.parse(raw);
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ ok: false, error: 'Authentication required.' });

    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(token, true);
    if (!decoded.email || decoded.email_verified !== true) {
      return res.status(403).json({ ok: false, error: 'A verified admin account is required.' });
    }
    const allowlist = (process.env.ADMIN_EMAILS || process.env.ADMIN_ALLOWLIST || '')
      .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!allowlist.includes(decoded.email.toLowerCase())) {
      return res.status(403).json({ ok: false, error: 'This account is not authorized to permanently delete records.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const collection = typeof body?.collection === 'string' ? body.collection : '';
    const id = typeof body?.id === 'string' ? body.id : '';
    if (body?.confirmation !== 'DELETE' || !ALLOWED_COLLECTIONS.has(collection) || !id || id.length > 1500 || id.includes('/')) {
      return res.status(400).json({ ok: false, error: 'Invalid collection, record ID, or confirmation.' });
    }

    const db = getFirestore(app);
    const document = db.collection(collection).doc(id);
    const snapshot = await document.get();
    if (!snapshot.exists) return res.status(404).json({ ok: false, error: 'Record was not found. It may already have been deleted.' });
    await document.delete();
    return res.status(200).json({ ok: true, permanentlyDeleted: true, collection, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Permanent delete failed.';
    return res.status(500).json({ ok: false, error: message });
  }
}
