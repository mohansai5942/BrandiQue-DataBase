# Security notes

- Never commit `FIREBASE_SERVICE_ACCOUNT_JSON`, private keys, passwords, or tokens.
- Use Firebase Authentication verified-email accounts and set the exact administrator email allowlist in Vercel.
- Rotate a service-account key immediately if it is exposed; remove the exposed key from Google Cloud IAM.
- Keep the Vercel service-account secret server-only. Do not prefix it with `VITE_`.
- Do not publish the example Firestore rules until the live website integration has been audited and the change has been tested in staging.
- Report a suspected exposure by disabling the affected key/token and reviewing Firebase/GCP audit logs.
