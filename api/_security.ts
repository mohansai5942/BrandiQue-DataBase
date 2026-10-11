const PRODUCTION_DASHBOARD_ORIGIN = 'https://data.brandique.in';
// The public website may call only the submission-notification endpoint.
const PUBLIC_WEBSITE_ORIGINS = ['https://brandique.in', 'https://www.brandique.in'];

/** `dashboard`: admin + same-site routes. `submission`: /api/notify-submission called by brandique.in. */
export type CorsScope = 'dashboard' | 'submission';

export function normalizeOrigin(value: string): string {
  try {
    const parsed = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.origin.toLowerCase();
  } catch {
    return '';
  }
}

/** Origins of this dashboard itself: production domain plus this deployment's own Vercel URLs. */
export function getDashboardOrigins(environment: Record<string, string | undefined>): Set<string> {
  const values = [
    PRODUCTION_DASHBOARD_ORIGIN,
    environment.DASHBOARD_ORIGIN || '',
    environment.VERCEL_URL || '',
    environment.VERCEL_BRANCH_URL || '',
    environment.VERCEL_PROJECT_PRODUCTION_URL || '',
  ];
  return new Set(values.map(normalizeOrigin).filter(origin => origin.startsWith('https://')));
}

export function getAllowedOrigins(environment: Record<string, string | undefined>, scope: CorsScope = 'dashboard'): Set<string> {
  const origins = getDashboardOrigins(environment);
  if (scope === 'submission') {
    for (const value of [...PUBLIC_WEBSITE_ORIGINS, ...(environment.ALLOWED_ORIGINS || '').split(',')]) {
      const origin = normalizeOrigin(value);
      if (origin.startsWith('https://')) origins.add(origin);
    }
  }
  return origins;
}

export function isAllowedOrigin(originHeader: string | undefined, allowedOrigins: ReadonlySet<string>): boolean {
  // CORS does not authenticate callers. A missing Origin is normal for same-origin GETs and
  // server-to-server requests; protected routes still require a verified Firebase admin token.
  if (!originHeader) return true;
  const origin = normalizeOrigin(originHeader);
  return Boolean(origin && allowedOrigins.has(origin));
}

/**
 * Returns the CORS headers for an allowed caller, or null when the Origin is not allowed.
 * Never a wildcard, never Access-Control-Allow-Credentials (auth uses Bearer tokens, not cookies).
 */
export function getCorsHeaders(originHeader: string | undefined, environment: Record<string, string | undefined>, scope: CorsScope = 'dashboard'): Record<string, string> | null {
  if (!isAllowedOrigin(originHeader, getAllowedOrigins(environment, scope))) return null;
  if (!originHeader) return { Vary: 'Origin' };
  const origin = normalizeOrigin(originHeader);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': scope === 'submission' ? 'Content-Type' : 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': scope === 'submission' ? 'POST, OPTIONS' : 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function isServiceEnquiry(record: Record<string, unknown>): boolean {
  if (record.source === 'service') return true;
  const details = record.serviceDetails;
  return typeof details === 'object' && details !== null && !Array.isArray(details) && Object.keys(details).length > 0;
}

export function getMessageClassification(record: Record<string, unknown>): 'contact' | 'service' | 'legacy' {
  if (record.source === 'contact') return 'contact';
  if (isServiceEnquiry(record)) return 'service';
  return 'legacy';
}

export function isRecordPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getErrorStatus(error: unknown): number {
  if (!isRecordPayload(error)) return 500;
  const status = error.statusCode;
  return typeof status === 'number' && Number.isInteger(status) ? status : 500;
}

/** Only messages we raised ourselves (with a 4xx statusCode) reach the client. Everything else is generic. */
export function getPublicErrorMessage(error: unknown): string {
  const status = getErrorStatus(error);
  if (status >= 400 && status < 500 && error instanceof Error && error.message) return error.message;
  return 'Server error. Please try again later.';
}

/** Best-effort, per-instance fixed-window limiter for unauthenticated endpoints. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      if (hits.size > 5000) hits.clear();
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
