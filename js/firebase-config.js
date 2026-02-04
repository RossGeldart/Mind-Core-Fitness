// Firebase Configuration for Mind Core Fitness
const firebaseConfig = {
  apiKey: "AIzaSyDdcnhyQW_7Ivwh82WEa1yNFjzit4-fhDw",
  authDomain: "mind-core-fitness-dashbo-da5fe.firebaseapp.com",
  projectId: "mind-core-fitness-dashbo-da5fe",
  storageBucket: "mind-core-fitness-dashbo-da5fe.firebasestorage.app",
  messagingSenderId: "756528803345",
  appId: "1:756528803345:web:c204362670c627d8130bb0",
  measurementId: "G-BNEPCX46ZE"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Auth helper functions
async function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function getUserRole(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      return doc.data().role || 'client';
    }
    return 'client';
  } catch (error) {
    console.error('Error getting user role:', error);
    return 'client';
  }
}

async function getUserData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

function logout() {
  auth.signOut().then(() => {
    window.location.href = '/dashboard/login.html';
  });
}
