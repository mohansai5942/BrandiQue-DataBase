import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'brandique-web-solutions.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'brandique-web-solutions',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || 'brandique-web-solutions.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = Boolean(config.apiKey && config.appId && config.messagingSenderId);
let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
if (firebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(config);
  authInstance = getAuth(app);
}
export const auth = authInstance as Auth;
