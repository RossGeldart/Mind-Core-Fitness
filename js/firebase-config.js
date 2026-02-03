// Firebase Configuration for Mind Core Fitness
// =============================================
// INSTRUCTIONS: Replace the placeholder values below with your Firebase project config
// Get these from: Firebase Console > Project Settings > Your Apps > Web App

const firebaseConfig = {
    apiKey: "AIzaSyDb1gtBSB85GYcRgBRtQuKxNTitSVF3LCI",
    authDomain: "mind-core-fitness-dashboard.firebaseapp.com",
    projectId: "mind-core-fitness-dashboard",
    storageBucket: "mind-core-fitness-dashboard.firebasestorage.app",
    messagingSenderId: "1090834044897",
    appId: "1:1090834044897:web:9dc72e48eb9794950524a0"
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
