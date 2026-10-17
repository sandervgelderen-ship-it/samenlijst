import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Same Firebase project as Moestuin: one login for both apps.
// Samenlijst keeps its data in its own top-level collections (samenlijstHouseholds, samenlijstInvites).
setLogLevel('silent');

export const app = initializeApp(firebaseConfig);

// Offline cache: the list keeps working in a supermarket without signal, and
// every write shows up on screen immediately (Firestore latency compensation).
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
