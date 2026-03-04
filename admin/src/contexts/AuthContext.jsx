import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  getAdditionalUserInfo
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { collection, query, where, getDocs, getDoc, onSnapshot, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db, ADMIN_UID, googleProvider, appleProvider } from '../config/firebase';

const isNative = Capacitor.isNativePlatform();

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Safety timeout: if onAuthStateChanged never fires (e.g. network issue on
  // native), stop showing the spinner so the login screen is reachable.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn('Auth state timeout — showing login screen');
        return false;
      });
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let unsubClient = null;

    console.log('[MCF] subscribing to onAuthStateChanged');
    window.__mcf = { step: 'subscribing', ts: Date.now() };
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      console.log('[MCF] onAuthStateChanged fired — user:', user?.uid || 'null');
      window.__mcf = { step: 'authStateChanged', uid: user?.uid || null, ts: Date.now() };
      setCurrentUser(user);

      // Clean up previous client listener
      if (unsubClient) {
        unsubClient();
        unsubClient = null;
      }

      if (user) {
        if (user.uid === ADMIN_UID) {
          setIsAdmin(true);
          setIsClient(false);
          setClientData(null);
          setLoading(false);
        } else {
          // Real-time listener on this user's client doc
          setIsAdmin(false);
          const clientsQuery = query(
            collection(db, 'clients'),
            where('uid', '==', user.uid)
          );
          // Helper: direct doc read using the clientId stashed in localStorage
          // (survives Stripe cross-domain redirects that can break query auth)
          const tryDirectRead = async () => {
            const storedId = localStorage.getItem('mcf_clientId');
            if (!storedId) return;
            try {
              const snap = await getDoc(doc(db, 'clients', storedId));
              if (snap.exists()) {
                setIsClient(true);
                setClientData({ id: snap.id, ...snap.data() });
              }
            } catch (e) {
              console.error('Direct client read failed:', e);
            }
          };

          unsubClient = onSnapshot(clientsQuery, async (snapshot) => {
            if (!snapshot.empty) {
              const clientDoc = snapshot.docs[0];
              setIsClient(true);
              setClientData({ id: clientDoc.id, ...clientDoc.data() });
              // Keep localStorage in sync for post-redirect recovery
              try { localStorage.setItem('mcf_clientId', clientDoc.id); } catch {};
            } else {
              // Query returned empty — may happen after cross-domain redirect
              // (e.g. Stripe checkout) when the auth token isn't fully ready.
              // Fall back to a direct document read by stored ID.
              await tryDirectRead();
            }
            setLoading(false);
          }, async (error) => {
            console.error('Error listening to client data:', error);
            await tryDirectRead();
            setLoading(false);
          });
        }
      } else {
        setIsAdmin(false);
        setIsClient(false);
        setClientData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubClient) unsubClient();
    };
  }, []);

  const login = async (email, password, rememberMe = true) => {
    // Set persistence based on remember me checkbox
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential;
  };

  const logout = () => {
    try { localStorage.removeItem('mcf_clientId'); } catch {};
    return signOut(auth);
  };

  const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const signup = async (name, email, password) => {
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    const user = userCredential.user;

    const clientRef = doc(collection(db, 'clients'));
    const clientDoc = {
      uid: user.uid,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      clientType: 'core_buddy',
      coreBuddyAccess: true,
      status: 'active',
      tier: 'free',
      subscriptionStatus: null,
      signupSource: 'self_signup',
      createdAt: Timestamp.now(),
    };
    await setDoc(clientRef, clientDoc);

    // Set client data immediately to avoid race condition with onAuthStateChanged
    setIsClient(true);
    setClientData({ id: clientRef.id, ...clientDoc });

    // Persist the Firestore doc ID so we can recover after cross-domain
    // redirects (e.g. Stripe checkout) that may clear the auth token cache.
    try { localStorage.setItem('mcf_clientId', clientRef.id); } catch {};

    return userCredential;
  };

  const loginWithGoogle = async () => {
    await setPersistence(auth, browserLocalPersistence);

    let user, name;

    if (isNative) {
      // Use Capacitor Firebase plugin for native Google sign-in.
      // With skipNativeAuth: false the plugin automatically signs into
      // Firebase Auth, so onAuthStateChanged will fire.
      const nativeResult = await FirebaseAuthentication.signInWithGoogle();
      user = auth.currentUser;
      name = nativeResult.user?.displayName || '';
    } else {
      const result = await signInWithPopup(auth, googleProvider);
      user = result.user;
      const additionalInfo = getAdditionalUserInfo(result);
      name = user.displayName
        || additionalInfo?.profile?.name
        || [additionalInfo?.profile?.given_name, additionalInfo?.profile?.family_name].filter(Boolean).join(' ')
        || '';
    }

    if (!user) return;

    // Check if a client doc already exists for this user
    const q = query(collection(db, 'clients'), where('uid', '==', user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      // First-time Google sign-in — create a client doc
      const clientRef = doc(collection(db, 'clients'));
      const clientDoc = {
        uid: user.uid,
        name,
        email: (user.email || '').toLowerCase(),
        clientType: 'core_buddy',
        coreBuddyAccess: true,
        status: 'active',
        tier: 'free',
        subscriptionStatus: null,
        signupSource: 'google',
        createdAt: Timestamp.now(),
      };
      await setDoc(clientRef, clientDoc);
      setIsClient(true);
      setClientData({ id: clientRef.id, ...clientDoc });
      try { localStorage.setItem('mcf_clientId', clientRef.id); } catch {};
    } else if (name && !snap.docs[0].data().name) {
      // Returning user with a missing name — backfill it
      const existingDoc = snap.docs[0];
      await updateDoc(doc(db, 'clients', existingDoc.id), { name });
    }
  };

  const loginWithApple = async () => {
    await setPersistence(auth, browserLocalPersistence);

    let user, name;

    if (isNative) {
      // Use Capacitor Firebase plugin for native Apple sign-in.
      // With skipNativeAuth: false the plugin automatically signs into
      // Firebase Auth, so onAuthStateChanged will fire.
      const nativeResult = await FirebaseAuthentication.signInWithApple();
      user = auth.currentUser;
      // Apple only provides name on first authorization
      name = nativeResult.user?.displayName || '';
    } else {
      const result = await signInWithPopup(auth, appleProvider);
      user = result.user;
      const additionalInfo = getAdditionalUserInfo(result);
      const tokenResponse = result._tokenResponse || {};
      const appleName = [tokenResponse.firstName, tokenResponse.lastName].filter(Boolean).join(' ')
        || additionalInfo?.profile?.name
        || [additionalInfo?.profile?.given_name, additionalInfo?.profile?.family_name].filter(Boolean).join(' ')
        || user.providerData?.[0]?.displayName
        || '';
      name = user.displayName || appleName || '';
    }

    if (!user) return;

    // Check if a client doc already exists for this user
    const q = query(collection(db, 'clients'), where('uid', '==', user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      // First-time Apple sign-in — create a client doc
      const clientRef = doc(collection(db, 'clients'));
      const clientDoc = {
        uid: user.uid,
        name,
        email: (user.email || '').toLowerCase(),
        clientType: 'core_buddy',
        coreBuddyAccess: true,
        status: 'active',
        tier: 'free',
        subscriptionStatus: null,
        signupSource: 'apple',
        createdAt: Timestamp.now(),
      };
      await setDoc(clientRef, clientDoc);
      setIsClient(true);
      setClientData({ id: clientRef.id, ...clientDoc });
      try { localStorage.setItem('mcf_clientId', clientRef.id); } catch {};
    } else if (name && !snap.docs[0].data().name) {
      // Returning user with a missing name — backfill it
      const existingDoc = snap.docs[0];
      await updateDoc(doc(db, 'clients', existingDoc.id), { name });
    }
  };

  const updateClientData = (fields) => {
    setClientData(prev => prev ? { ...prev, ...fields } : fields);
  };

  // Imperatively resolve the client record — returns the data or null.
  // Re-uses the same localStorage → uid-query fallback chain as the
  // onSnapshot listener so the logic lives in one place.
  const resolveClient = async () => {
    if (clientData) return clientData;

    const storedId = localStorage.getItem('mcf_clientId');
    if (storedId) {
      try {
        const snap = await getDoc(doc(db, 'clients', storedId));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setIsClient(true);
          setClientData(data);
          return data;
        }
      } catch (e) {
        console.error('resolveClient direct read failed:', e);
      }
    }

    if (currentUser) {
      const q = query(collection(db, 'clients'), where('uid', '==', currentUser.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setIsClient(true);
        setClientData(data);
        return data;
      }
    }

    return null;
  };

  const value = {
    currentUser,
    isAdmin,
    isClient,
    clientData,
    updateClientData,
    resolveClient,
    login,
    loginWithGoogle,
    loginWithApple,
    signup,
    logout,
    resetPassword,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
