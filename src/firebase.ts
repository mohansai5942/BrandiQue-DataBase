import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, browserSessionPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'brandique-web-solutions.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'brandique-web-solutions',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'brandique-web-solutions.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.appId && config.messagingSenderId);
const app: FirebaseApp | null = firebaseConfigured
  ? getApps().length ? getApp() : initializeApp(config)
  : null;
// Email/password only: initializing without a popup/redirect resolver keeps the same persistence as
// getAuth() but never loads Google's gapi script or auth iframe, so the CSP can stay script-src 'self'.
export const auth = app ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }) : null;
export const storage = app ? getStorage(app) : null;
