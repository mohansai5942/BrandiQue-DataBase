export type VerifiedToken = { uid: string; email?: string; email_verified?: boolean };
export type AdminAccount = { email?: string; emailVerified?: boolean; disabled?: boolean };
export type AdminAuthVerifier = {
  verifyIdToken(token: string, checkRevoked: boolean): Promise<VerifiedToken>;
  getUser(uid: string): Promise<AdminAccount>;
};

function authError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export function parseAdminAllowlist(configuredEmails: string | undefined): string[] {
  return (configuredEmails || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

/**
 * Every protected API route goes through this check:
 * 1. a Firebase ID token in `Authorization: Bearer <token>` that verifies and is not revoked,
 * 2. a live, enabled Firebase account,
 * 3. an email on the server-side ADMIN_EMAILS allowlist (exact, case-insensitive),
 * 4. Firebase reports that email as verified.
 */
export async function authorizeAdminToken(
  authHeader: string | string[] | undefined,
  firebaseAuth: AdminAuthVerifier,
  configuredEmails: string | undefined,
): Promise<{ uid: string; email: string }> {
  const header = Array.isArray(authHeader) ? authHeader[0] || '' : authHeader || '';
  const match = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/i.exec(header.trim());
  if (!match) throw authError('Sign-in required.', 401);
  let decoded: VerifiedToken;
  let account: AdminAccount;
  try {
    decoded = await firebaseAuth.verifyIdToken(match[1], true);
    account = await firebaseAuth.getUser(decoded.uid);
  } catch {
    // Expired, malformed, revoked, or disabled: never echo the SDK error to the caller.
    throw authError('Sign-in required. Your session is invalid or has expired; sign in again.', 401);
  }
  if (account.disabled) throw authError('This account is not authorized.', 403);
  const email = (account.email || '').toLowerCase().trim();
  const allowlist = parseAdminAllowlist(configuredEmails);
  if (!email || !allowlist.includes(email)) throw authError('This account is not authorized.', 403);
  if (account.emailVerified !== true) {
    throw authError('Firebase reports this email as unverified. Verify this user in Firebase Authentication, then sign out and sign in again.', 403);
  }
  return { uid: decoded.uid, email };
}
