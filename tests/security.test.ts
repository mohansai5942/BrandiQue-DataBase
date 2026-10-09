import assert from 'node:assert/strict';
import test from 'node:test';
import { getAllowedOrigins, getCorsHeaders, getMessageClassification, isAllowedOrigin, isRecordPayload, normalizeOrigin } from '../api/security.ts';
import { isDashboardCollection, prepareCreateRecord, prepareSoftDelete, prepareUpdateRecord, validateRecordPayload } from '../api/validation.ts';
import { authorizeAdminToken } from '../api/admin-auth.ts';

test('normalizes origins and rejects unsafe or malformed values', () => {
  assert.equal(normalizeOrigin('HTTPS://Data.Brandique.in/path?q=1'), 'https://data.brandique.in');
  assert.equal(normalizeOrigin('javascript:alert(1)'), '');
  assert.equal(normalizeOrigin('not a host'), '');
});

test('allows only the production dashboard and explicitly configured deployment origins', () => {
  const allowlist = getAllowedOrigins({
    DASHBOARD_ORIGIN: 'https://dashboard.example.test',
    ALLOWED_ORIGINS: 'https://preview.example.test, https://another.example.test/',
    VERCEL_URL: 'brandi-que-data-base-preview.vercel.app',
  });
  assert.equal(isAllowedOrigin('https://data.brandique.in', allowlist), true);
  assert.equal(isAllowedOrigin('https://dashboard.example.test', allowlist), true);
  assert.equal(isAllowedOrigin('https://brandi-que-data-base-preview.vercel.app', allowlist), true);
  assert.equal(isAllowedOrigin('https://data.brandique.in.attacker.test', allowlist), false);
  assert.equal(isAllowedOrigin('https://unconfigured.vercel.app', allowlist), false);
  assert.equal(isAllowedOrigin(undefined, allowlist), true);
});

test('preflight returns explicit CORS headers only for allowed origins', () => {
  const headers = getCorsHeaders('https://data.brandique.in', {});
  assert.equal(headers?.['Access-Control-Allow-Origin'], 'https://data.brandique.in');
  assert.match(headers?.['Access-Control-Allow-Methods'] || '', /OPTIONS/);
  assert.match(headers?.['Access-Control-Allow-Headers'] || '', /Authorization/);
  assert.equal(headers?.['Access-Control-Allow-Credentials'], undefined);
  assert.notEqual(headers?.['Access-Control-Allow-Origin'], '*');
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
  const calls: Array<[string, string | boolean]> = [];
  const verifier = {
    async verifyIdToken(token: string, checkRevoked: boolean) { calls.push(['verify', `${token}:${checkRevoked}`]); return { uid: 'admin-1', email: 'ADMIN@BRANDIQUE.IN' }; },
    async getUser(uid: string) { calls.push(['user', uid]); return { email: 'admin@brandique.in', emailVerified: true, disabled: false }; },
  };
  assert.deepEqual(await authorizeAdminToken('Bearer id-token', verifier, 'admin@brandique.in'), { uid: 'admin-1', email: 'admin@brandique.in' });
  assert.deepEqual(calls, [['verify', 'id-token:true'], ['user', 'admin-1']]);
  await assert.rejects(() => authorizeAdminToken(undefined, verifier, 'admin@brandique.in'), /Sign-in required/);
  await assert.rejects(() => authorizeAdminToken('Bearer id-token', verifier, 'other@brandique.in'), /allowlist/);
  await assert.rejects(() => authorizeAdminToken('Bearer id-token', { ...verifier, async getUser() { return { email: 'admin@brandique.in', emailVerified: false }; } }, 'admin@brandique.in'), /unverified/);
});
