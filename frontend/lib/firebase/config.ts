import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Project: cryptpilot-madhav-01. The ids below are public and only a fallback; set the NEXT_PUBLIC_FIREBASE_* variables
// (frontend/.env.local, and on the host) so the real values win. The apiKey has no fallback on purpose: it is a build-safe
// placeholder, so a missing key fails loudly at sign-in instead of silently signing users in to someone else's project.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "set-NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "cryptpilot-madhav-01.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "cryptpilot-madhav-01",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "cryptpilot-madhav-01.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "756253858167",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:756253858167:web:61c5569e2b2bd4bb90a972",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined, // Analytics is not enabled on this project
};

if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  console.warn("NEXT_PUBLIC_FIREBASE_API_KEY is not set: Firebase sign-in will fail. Add it to frontend/.env.local (see docs/GO_LIVE.md, step 0c).");
}

// Initialize Firebase singleton
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);
