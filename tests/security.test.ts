import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter, getAllowedOrigins, getCorsHeaders, getMessageClassification, getPublicErrorMessage, isAllowedOrigin, isRecordPayload, normalizeOrigin } from '../api/_security.ts';
import { isDashboardCollection, isSafeDocId, validateRecordShape, prepareCreateRecord, prepareSoftDelete, prepareUpdateRecord, validateRecordPayload } from '../api/_validation.ts';
import { authorizeAdminToken } from '../api/_admin-auth.ts';

test('normalizes origins and rejects unsafe or malformed values', () => {
  assert.equal(normalizeOrigin('HTTPS://Data.Brandique.in/path?q=1'), 'https://data.brandique.in');
  assert.equal(normalizeOrigin('javascript:alert(1)'), '');
  assert.equal(normalizeOrigin('not a host'), '');
});

test('dashboard routes allow only the dashboard and this deployment; the website only for submissions', () => {
  const env = {
    DASHBOARD_ORIGIN: 'https://dashboard.example.test',
    ALLOWED_ORIGINS: 'https://preview.example.test, https://another.example.test/',
    VERCEL_URL: 'brandi-que-data-base-preview.vercel.app',
  };
  const dashboard = getAllowedOrigins(env, 'dashboard');
  assert.equal(isAllowedOrigin('https://data.brandique.in', dashboard), true);
  assert.equal(isAllowedOrigin('https://dashboard.example.test', dashboard), true);
  assert.equal(isAllowedOrigin('https://brandi-que-data-base-preview.vercel.app', dashboard), true);
  assert.equal(isAllowedOrigin('https://brandique.in', dashboard), false);
  assert.equal(isAllowedOrigin('https://www.brandique.in', dashboard), false);
  assert.equal(isAllowedOrigin('https://preview.example.test', dashboard), false);
  assert.equal(isAllowedOrigin('https://data.brandique.in.attacker.test', dashboard), false);
  assert.equal(isAllowedOrigin('http://data.brandique.in', dashboard), false);
  assert.equal(isAllowedOrigin('https://unconfigured.vercel.app', dashboard), false);
  assert.equal(isAllowedOrigin('null', dashboard), false);
  assert.equal(isAllowedOrigin(undefined, dashboard), true);
  const submission = getAllowedOrigins(env, 'submission');
  assert.equal(isAllowedOrigin('https://brandique.in', submission), true);
  assert.equal(isAllowedOrigin('https://www.brandique.in', submission), true);
  assert.equal(isAllowedOrigin('https://preview.example.test', submission), true);
  assert.equal(isAllowedOrigin('https://evil.example.test', submission), false);
});

test('preflight returns explicit CORS headers only for allowed origins', () => {
  const headers = getCorsHeaders('https://data.brandique.in', {});
  assert.equal(headers?.['Access-Control-Allow-Origin'], 'https://data.brandique.in');
  assert.match(headers?.['Access-Control-Allow-Methods'] || '', /OPTIONS/);
  assert.match(headers?.['Access-Control-Allow-Headers'] || '', /Authorization/);
  assert.equal(headers?.['Access-Control-Allow-Credentials'], undefined);
  assert.notEqual(headers?.['Access-Control-Allow-Origin'], '*');
  assert.equal(getCorsHeaders('https://brandique.in', {}, 'dashboard'), null);
  const site = getCorsHeaders('https://www.brandique.in', {}, 'submission');
  assert.equal(site?.['Access-Control-Allow-Origin'], 'https://www.brandique.in');
  assert.equal(site?.['Access-Control-Allow-Methods'], 'POST, OPTIONS');
  assert.doesNotMatch(site?.['Access-Control-Allow-Headers'] || '', /Authorization/);
  assert.equal(getCorsHeaders('https://evil.example.test', {}, 'submission'), null);
});

test('document IDs and record shapes are validated before any Firestore path is built', () => {
  assert.equal(isSafeDocId('aB3dE5fG7hJ9kL1mN2pQ'), true);
  assert.equal(isSafeDocId('contact'), true);
  for (const bad of ['', '.', '..', 'a/b', '../settings', '__name__', ' padded', 'x'.repeat(1501), 'line\nbreak', 42, null]) {
    assert.equal(isSafeDocId(bad), false, String(bad));
  }
  assert.equal(validateRecordShape({ a: { b: [1, 'two', true, null] } }), null);
  assert.match(validateRecordShape(JSON.parse('{"__proto__":{"x":1}}')) || '', /not allowed/);
  assert.match(validateRecordShape({ __name__: 1 }) || '', /not allowed/);
  let deep: Record<string, unknown> = {};
  const root = deep;
  for (let i = 0; i < 20; i++) { const next = {}; deep.n = next; deep = next; }
  assert.match(validateRecordShape(root) || '', /nested/);
  assert.match(validateRecordPayload('prompts', { title: 'x', prompt: 'y', __x__: 1 }, 'create') || '', /not allowed/);
});

test('only our own 4xx messages reach clients; internal errors stay generic', () => {
  assert.equal(getPublicErrorMessage(Object.assign(new Error('Invalid document ID.'), { statusCode: 400 })), 'Invalid document ID.');
  assert.equal(getPublicErrorMessage(new Error('7 PERMISSION_DENIED: secret internals')), 'Server error. Please try again later.');
  assert.equal(getPublicErrorMessage('boom'), 'Server error. Please try again later.');
});

test('rate limiter blocks after the limit within the window and resets after it', () => {
  const allow = createRateLimiter(2, 1000);
  assert.equal(allow('ip', 0), true);
  assert.equal(allow('ip', 10), true);
  assert.equal(allow('ip', 20), false);
  assert.equal(allow('other', 20), true);
  assert.equal(allow('ip', 1001), true);
});

test('classifies service and contact records only from reliable fields', () => {
  assert.equal(getMessageClassification({ source: 'service', service: 'Brand design' }), 'service');
  assert.equal(getMessageClassification({ serviceDetails: { budget: '5000' } }), 'service');
  assert.equal(getMessageClassification({ source: 'contact', service: 'web development' }), 'contact');
  assert.equal(getMessageClassification({ service: 'website development' }), 'legacy');
  assert.equal(getMessageClassification({ email: 'legacy@example.test' }), 'legacy');
});

test('accepts only plain JSON object payloads', () => {
  assert.equal(isRecordPayload({ title: 'ok' }), true);
  assert.equal(isRecordPayload(null), false);
  assert.equal(isRecordPayload(['not', 'a', 'record']), false);
});

test('validates project media limits and preserves partial edits', () => {
  assert.equal(validateRecordPayload('projects', { title: 'Site', images: Array.from({ length: 10 }, () => 'https://cdn.example.test/image.png') }, 'create'), null);
  assert.match(validateRecordPayload('projects', { title: 'Site', images: Array.from({ length: 11 }, () => 'https://cdn.example.test/image.png') }, 'create') || '', /up to 10/);
  assert.equal(validateRecordPayload('projects', { category: 'Portfolio' }, 'update'), null);
  assert.match(validateRecordPayload('projects', { title: '' }, 'create') || '', /required/);
});

test('validates workflow JSON and lead emails before persistence', () => {
  assert.equal(validateRecordPayload('n8n_projects', { title: 'Workflow', workflowJson: '{"nodes":[],"connections":{}}' }, 'create'), null);
  assert.match(validateRecordPayload('n8n_projects', { title: 'Workflow', workflowJson: '{bad json' }, 'create') || '', /valid JSON/);
  assert.match(validateRecordPayload('messages', { name: 'Mohan', email: 'invalid' }, 'create') || '', /valid email/);
  assert.equal(validateRecordPayload('messages', { serviceDetails: { budget: '5000' } }, 'update'), null);
});

test('create, update, and soft-delete payloads preserve document identity and metadata', () => {
  const created = prepareCreateRecord({ id: 'caller-id', title: 'Record', createdAt: 'old-created-at' }, 'now');
  assert.equal(created.id, undefined);
  assert.equal(created.createdAt, 'old-created-at');
  assert.equal(created.updatedAt, 'now');
  const updated = prepareUpdateRecord({ id: 'must-not-overwrite-id', category: 'Portfolio', serviceDetails: { budget: 8000, requirements: 'keep both submitted keys' } }, 'later');
  const stored = { id: 'firestore-document-id', createdAt: 'original-created-at', ...updated };
  assert.equal(stored.id, 'firestore-document-id');
  assert.equal(stored.createdAt, 'original-created-at');
  assert.deepEqual(stored.serviceDetails, { requirements: 'keep both submitted keys', budget: 8000 });
  assert.deepEqual(prepareSoftDelete('deleted-at'), { isDeleted: true, deletedAt: 'deleted-at', updatedAt: 'deleted-at' });
});

test('exposes only approved dashboard collections', () => {
  assert.equal(isDashboardCollection('messages'), true);
  assert.equal(isDashboardCollection('users'), false);
});

test('verifies revocation, current account state, and exact admin allowlist membership', async () => {
  const T = 'Bearer id-token-0123456789abcdef';
  const calls: Array<[string, string | boolean]> = [];
  const verifier = {
    async verifyIdToken(token: string, checkRevoked: boolean) { calls.push(['verify', `${token}:${checkRevoked}`]); return { uid: 'admin-1', email: 'ADMIN@BRANDIQUE.IN' }; },
    async getUser(uid: string) { calls.push(['user', uid]); return { email: 'admin@brandique.in', emailVerified: true, disabled: false }; },
  };
  type E = Error & { statusCode?: number };
  assert.deepEqual(await authorizeAdminToken(T, verifier, 'admin@brandique.in'), { uid: 'admin-1', email: 'admin@brandique.in' });
  assert.deepEqual(calls, [['verify', 'id-token-0123456789abcdef:true'], ['user', 'admin-1']]);
  await assert.rejects(() => authorizeAdminToken(undefined, verifier, 'admin@brandique.in'), (e: E) => e.statusCode === 401 && /Sign-in required/.test(e.message));
  await assert.rejects(() => authorizeAdminToken('Bearer short', verifier, 'admin@brandique.in'), (e: E) => e.statusCode === 401);
  await assert.rejects(() => authorizeAdminToken(T, verifier, 'other@brandique.in'), (e: E) => e.statusCode === 403 && /not authorized/.test(e.message));
  await assert.rejects(() => authorizeAdminToken(T, verifier, ''), (e: E) => e.statusCode === 403);
  await assert.rejects(() => authorizeAdminToken(T, { ...verifier, async verifyIdToken() { throw new Error('auth/id-token-expired internal detail'); } }, 'admin@brandique.in'), (e: E) => e.statusCode === 401 && !/internal detail/.test(e.message));
  await assert.rejects(() => authorizeAdminToken(T, { ...verifier, async getUser() { return { email: 'admin@brandique.in', emailVerified: true, disabled: true }; } }, 'admin@brandique.in'), (e: E) => e.statusCode === 403);
  await assert.rejects(() => authorizeAdminToken(T, { ...verifier, async getUser() { return { email: 'admin@brandique.in', emailVerified: false }; } }, 'admin@brandique.in'), (e: E) => e.statusCode === 403 && /unverified/.test(e.message));
});
