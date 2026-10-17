import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeRecord, timeAgo } from '../src/notifications.ts';

test('timeAgo renders relative timestamps', () => {
  assert.equal(timeAgo(undefined), '—');
  assert.equal(timeAgo('not-a-date'), '—');
  const now = Date.now();
  assert.equal(timeAgo(new Date(now - 5_000).toISOString()), 'just now');
  assert.equal(timeAgo(new Date(now - 45_000).toISOString()), '45s ago');
  assert.equal(timeAgo(new Date(now - 2 * 60_000).toISOString()), '2m ago');
  assert.equal(timeAgo(new Date(now - 3 * 3_600_000).toISOString()), '3h ago');
  assert.equal(timeAgo(new Date(now - 5 * 86_400_000).toISOString()), '5d ago');
});

test('summarizeRecord builds lead titles without leaking raw payloads', () => {
  const lead = summarizeRecord('messages', { name: 'Anu', phone: '+917093320572', service: 'AI Agents', message: 'Need a chatbot' });
  assert.equal(lead.title, 'New lead: Anu — +917093320572');
  assert.match(lead.detail, /AI Agents/);

  const enquiry = summarizeRecord('n8n_project_forms', { name: 'Ravi', phone: '9999999999', projectTitle: 'Clinic Bot' });
  assert.equal(enquiry.title, 'New automation enquiry: Ravi — 9999999999');
  assert.match(enquiry.detail, /Clinic Bot/);

  const anonymous = summarizeRecord('messages', { email: 'a@b.co' });
  assert.equal(anonymous.title, 'New lead: a@b.co');
  const noName = summarizeRecord('messages', { message: 'hi' });
  assert.equal(noName.title, 'New lead: Someone');
});
