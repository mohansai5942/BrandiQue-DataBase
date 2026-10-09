export type VerifiedToken = { uid: string; email?: string };
export type AdminAccount = { email?: string; emailVerified?: boolean; disabled?: boolean };
export type AdminAuthVerifier = {
  verifyIdToken(token: string, checkRevoked: boolean): Promise<VerifiedToken>;
  getUser(uid: string): Promise<AdminAccount>;
};

function authError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export async function authorizeAdminToken(
  authHeader: string | string[] | undefined,
  firebaseAuth: AdminAuthVerifier,
  configuredEmails: string | undefined,
): Promise<{ uid: string; email: string }> {
  const header = Array.isArray(authHeader) ? authHeader[0] || '' : authHeader || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw authError('Sign-in required.', 401);
  const decoded = await firebaseAuth.verifyIdToken(match[1], true);
  const account = await firebaseAuth.getUser(decoded.uid);
  if (account.disabled) throw authError('This Firebase account is disabled.', 403);
  const email = (account.email || decoded.email || '').toLowerCase().trim();
  const allowlist = (configuredEmails || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowlist.includes(email)) {
    throw authError('Admin email is not present in the Production ADMIN_EMAILS allowlist. Check spelling and redeploy.', 403);
  }
  if (account.emailVerified !== true) {
    throw authError('Firebase reports this email as unverified. Verify this user in Firebase Authentication, then sign out and sign in again.', 403);
  }
  return { uid: decoded.uid, email };
}
