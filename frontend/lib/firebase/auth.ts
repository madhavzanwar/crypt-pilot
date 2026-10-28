import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  multiFactor,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  signInWithPhoneNumber,
  setPersistence,
  inMemoryPersistence,
  getAuth,
  RecaptchaVerifier,
  type ConfirmationResult,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import { auth, firebaseConfig } from "./config";
import { endDemo, setAuthUserId } from "@/lib/user";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Sign in with Google using a popup.
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  if (result.user) {
    setAuthUserId(result.user.uid);
  }
  return result.user;
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  if (result.user) {
    setAuthUserId(result.user.uid);
  }
  return result.user;
}

/**
 * Sign up a new user with email and password.
 */
export async function signUpWithEmail(email: string, pass: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (result.user) {
    setAuthUserId(result.user.uid);
  }
  return result.user;
}

/**
 * If a sign-in error is "second factor required", return the resolver the UI
 * passes to finishTotpSignIn(); otherwise null.
 */
export function getMfaResolver(err: unknown): MultiFactorResolver | null {
  return (err as { code?: string })?.code === "auth/multi-factor-auth-required"
    ? getMultiFactorResolver(auth, err as MultiFactorError)
    : null;
}

/**
 * Finish a sign-in that threw auth/multi-factor-auth-required, using the
 * 6-digit code from the user's authenticator app.
 */
export async function finishTotpSignIn(resolver: MultiFactorResolver, code: string): Promise<User> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("No authenticator app is enrolled for this account.");
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code);
  const result = await resolver.resolveSignIn(assertion);
  setAuthUserId(result.user.uid);
  return result.user;
}

/** Step 1 of TOTP enrollment: returns the secret to show as QR / manual key. */
export async function startTotpEnroll(): Promise<TotpSecret> {
  if (!auth.currentUser) throw new Error("Not signed in");
  const session = await multiFactor(auth.currentUser).getSession();
  return TotpMultiFactorGenerator.generateSecret(session);
}

/** Step 2: confirm the first code from the authenticator app. */
export async function finishTotpEnroll(secret: TotpSecret, code: string, displayName = "Authenticator app"): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in");
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
  await multiFactor(auth.currentUser).enroll(assertion, displayName);
}

export function listTotpFactors() {
  const user = auth.currentUser;
  return user
    ? multiFactor(user).enrolledFactors.filter((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID)
    : [];
}

export async function unenrollFactor(uid: string): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in");
  await multiFactor(auth.currentUser).unenroll(uid);
}

let recaptcha: RecaptchaVerifier | null = null;

/**
 * Auth instance used only to prove ownership of a phone number. It is separate from the app's
 * main auth, so verifying never signs anyone in or changes who the app thinks the user is.
 */
async function phoneAuth() {
  const app = getApps().find((a) => a.name === "phone-verify") ?? initializeApp(firebaseConfig, "phone-verify");
  const a = getAuth(app);
  await setPersistence(a, inMemoryPersistence);
  return a;
}

/**
 * Text a real OTP to an Indian mobile number. `container` hosts the invisible reCAPTCHA.
 * Needs the Phone provider enabled in the Firebase console.
 */
export async function sendPhoneOtp(mobile: string, container: HTMLElement): Promise<ConfirmationResult> {
  const a = await phoneAuth();
  // a verifier can't be reused after a failed or completed attempt
  recaptcha?.clear();
  container.replaceChildren(); // a leftover widget in the same element makes reCAPTCHA throw "already been rendered"
  const host = container.appendChild(document.createElement("div"));
  recaptcha = new RecaptchaVerifier(a, host, { size: "invisible" });
  try {
    return await signInWithPhoneNumber(a, `+91${mobile}`, recaptcha);
  } catch (e) {
    recaptcha.clear();
    recaptcha = null;
    throw e;
  }
}

/** Check the 6-digit code from the SMS, then drop the throwaway session. Throws on a wrong code. */
export async function confirmPhoneOtp(result: ConfirmationResult, code: string): Promise<void> {
  await result.confirm(code);
  await firebaseSignOut(await phoneAuth());
}

/**
 * Sign out of Firebase.
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
  endDemo();
  setAuthUserId(null);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.clear();
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith("finpilot:benefits_session_closed:") || k.startsWith("finpilot:onboarding_closed:"))) {
          window.localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      setAuthUserId(user.uid);
    } else {
      setAuthUserId(null);
    }
    callback(user);
  });
}

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/user-not-found": "No account with that email. Use \"Sign up\" first.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/invalid-email": "That email address is not valid.",
  "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/operation-not-allowed": "This sign-in method is not enabled in the Firebase console (Authentication > Sign-in method).",
  "auth/configuration-not-found": "Firebase Authentication is not set up for this project yet (Firebase console > Authentication > Get started).",
  "auth/unauthorized-domain": "This domain is not authorized in Firebase (Authentication > Settings > Authorized domains).",
  "auth/popup-blocked": "The sign-in popup was blocked. Allow popups for this site and retry.",
  "auth/popup-closed-by-user": "Sign-in popup was closed before finishing.",
  "auth/cancelled-popup-request": "Sign-in popup was closed before finishing.",
  "auth/network-request-failed": "Network error. Check your connection and retry.",
  "auth/invalid-api-key": "The Firebase API key is invalid. Check NEXT_PUBLIC_FIREBASE_API_KEY.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase API key is invalid. Check NEXT_PUBLIC_FIREBASE_API_KEY.",
  "auth/invalid-verification-code": "Invalid code. Check the code and try again.",
  "auth/invalid-phone-number": "That mobile number is not valid.",
  "auth/code-expired": "That code expired. Request a new one.",
  "auth/quota-exceeded": "SMS limit reached for this project. Try again later.",
  "auth/captcha-check-failed": "The reCAPTCHA check failed. Refresh the page and retry.",
  "auth/billing-not-enabled": "Firebase needs the Blaze (pay-as-you-go) plan to send real SMS. Use a test number or enable billing.",
};

/** Turn a Firebase auth error into a message a person can act on. */
export function authErrorMessage(err: unknown, fallback = "Sign-in failed. Please try again."): string {
  const e = err as { code?: string; message?: string };
  return (e.code && AUTH_ERRORS[e.code]) || (e.code ? `${fallback} (${e.code})` : e.message || fallback);
}
