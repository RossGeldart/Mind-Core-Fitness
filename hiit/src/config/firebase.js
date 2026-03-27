import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDDbAh64Mxc09z6m5wXdwwxcLMTn-wpQlY',
  authDomain: 'core-hiit-75562.firebaseapp.com',
  projectId: 'core-hiit-75562',
  storageBucket: 'core-hiit-75562.firebasestorage.app',
  messagingSenderId: '213134911727',
  appId: '1:213134911727:web:7830f0e48c2af25ba9131a',
  measurementId: 'G-NVN5NEWWNM',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

export default app;
