const PRODUCTION_DASHBOARD_ORIGIN = 'https://data.brandique.in';

export function normalizeOrigin(value: string): string {
  try {
    const parsed = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.origin.toLowerCase();
  } catch {
    return '';
  }
}

export function getAllowedOrigins(environment: Record<string, string | undefined>): Set<string> {
  const values = [
    PRODUCTION_DASHBOARD_ORIGIN,
    environment.DASHBOARD_ORIGIN || '',
    ...(environment.ALLOWED_ORIGINS || '').split(','),
    environment.VERCEL_URL || '',
    environment.VERCEL_BRANCH_URL || '',
    environment.VERCEL_PROJECT_PRODUCTION_URL || '',
  ];
  return new Set(values.map(normalizeOrigin).filter(Boolean));
}

export function isAllowedOrigin(originHeader: string | undefined, allowedOrigins: ReadonlySet<string>): boolean {
  // CORS does not authenticate callers. A missing Origin is normal for server-to-server
  // requests; protected data routes still require a verified Firebase admin token.
  if (!originHeader) return true;
  const origin = normalizeOrigin(originHeader);
  return Boolean(origin && allowedOrigins.has(origin));
}

export function getCorsHeaders(originHeader: string | undefined, environment: Record<string, string | undefined>): Record<string, string> | null {
  if (!isAllowedOrigin(originHeader, getAllowedOrigins(environment))) return null;
  if (!originHeader) return {};
  const origin = normalizeOrigin(originHeader);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown server error.';
}
