import { initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  OAuthProvider
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyBCIgMJd3By7qkWH27YiW9VooIBGE3bFLs",
  authDomain: "mind-core-fitness-client.firebaseapp.com",
  projectId: "mind-core-fitness-client",
  storageBucket: "mind-core-fitness-client.firebasestorage.app",
  messagingSenderId: "669343392406",
  appId: "1:669343392406:web:f5a35ee062387e7d6f58b7"
};

const app = initializeApp(firebaseConfig);

// On native (capacitor:// origin) IndexedDB is unreliable, so use
// localStorage-based persistence. On web keep the default IndexedDB → localStorage
// fallback chain for best performance.
const _isNative = Capacitor.isNativePlatform();
console.log('[MCF] firebase.js init — isNative:', _isNative, 'platform:', Capacitor.getPlatform());
export const auth = _isNative
  ? initializeAuth(app, { persistence: browserLocalPersistence })
  : getAuth(app);
console.log('[MCF] auth created OK');

export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Secondary app for creating user accounts without logging out admin
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = Capacitor.isNativePlatform()
  ? initializeAuth(secondaryApp, { persistence: browserLocalPersistence })
  : getAuth(secondaryApp);

// Admin UID - only this user can access the dashboard
export const ADMIN_UID = "EYdciKDOi3UYBLk1u8hHams5tmO2";
