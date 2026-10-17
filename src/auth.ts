/**
 * Signing in and out, on the web and in the Android app.
 * Web: Firebase's Google popup. Android: the phone's own Google account picker via
 * @capacitor-firebase/authentication, then the Firebase JS SDK signs in with that credential.
 */
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './firebase';

export const isNative = () => Capacitor.isNativePlatform();

export async function signInWithGoogle() {
  if (!isNative()) {
    await signInWithPopup(auth, new GoogleAuthProvider());
    return;
  }
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw Object.assign(new Error('Google gaf geen inlogbewijs terug.'), { code: 'auth/no-id-token' });
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, result.credential?.accessToken));
}

export async function logOut() {
  if (isNative()) await FirebaseAuthentication.signOut().catch(() => {});
  await signOut(auth);
}
