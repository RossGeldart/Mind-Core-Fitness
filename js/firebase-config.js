// Firebase Configuration for Mind Core Fitness
// =============================================
// INSTRUCTIONS: Replace the placeholder values below with your Firebase project config
// Get these from: Firebase Console > Project Settings > Your Apps > Web App

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Check if Firebase is configured
function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "YOUR_API_KEY";
}

// Export for use in other files
window.MCF = window.MCF || {};
window.MCF.auth = auth;
window.MCF.db = db;
window.MCF.isConfigured = isFirebaseConfigured;
