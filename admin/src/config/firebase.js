import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBCIgMJd3By7qkWH27YiW9VooIBGE3bFLs",
  authDomain: "mind-core-fitness-client.firebaseapp.com",
  projectId: "mind-core-fitness-client",
  storageBucket: "mind-core-fitness-client.firebasestorage.app",
  messagingSenderId: "669343392406",
  appId: "1:669343392406:web:f5a35ee062387e7d6f58b7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Secondary app for creating user accounts without logging out admin
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);

// Admin UID - only this user can access the dashboard
export const ADMIN_UID = "EYdciKDOi3UYBLk1u8hHams5tmO2";
