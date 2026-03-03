import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  getAdditionalUserInfo
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { collection, query, where, getDocs, getDoc, onSnapshot, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db, ADMIN_UID, googleProvider, appleProvider } from '../config/firebase';

const isNative = Capacitor.isNativePlatform();
const signInWithProvider = isNative ? signInWithRedirect : signInWithPopup;

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

  // Handle redirect result for native platforms (signInWithRedirect flow)
  useEffect(() => {
    if (!isNative) return;
    getRedirectResult(auth).then(async (result) => {
      if (!result) return;
      const user = result.user;
      // Check if client doc exists, create if first-time social login
      const q = query(collection(db, 'clients'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      if (snap.empty) {
        const additionalInfo = getAdditionalUserInfo(result);
        const name = user.displayName || additionalInfo?.profile?.name || '';
        const source = result.providerId === 'apple.com' ? 'apple' : 'google';
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
          signupSource: source,
          createdAt: Timestamp.now(),
        };
        await setDoc(clientRef, clientDoc);
        setIsClient(true);
        setClientData({ id: clientRef.id, ...clientDoc });
        try { localStorage.setItem('mcf_clientId', clientRef.id); } catch {};
      }
    }).catch((err) => {
      console.error('Redirect sign-in failed:', err);
    });
  }, []);

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
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      console.log('[MCF] onAuthStateChanged fired — user:', user?.uid || 'null');
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
    const result = await signInWithProvider(auth, googleProvider);
    if (!result) return; // redirect flow — result comes via getRedirectResult
    const user = result.user;

    // Extract name from multiple sources — displayName or Google profile data
    const additionalInfo = getAdditionalUserInfo(result);
    const name = user.displayName
      || additionalInfo?.profile?.name
      || [additionalInfo?.profile?.given_name, additionalInfo?.profile?.family_name].filter(Boolean).join(' ')
      || '';

    // Check if a client doc already exists for this user
    const q = query(collection(db, 'clients'), where('uid', '==', user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      // First-time Google sign-in — create a client doc
      const clientRef = doc(collection(db, 'clients'));
      const clientDoc = {
        uid: user.uid,
        name,
        email: user.email.toLowerCase(),
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

    return result;
  };

  const loginWithApple = async () => {
    await setPersistence(auth, browserLocalPersistence);
    const result = await signInWithProvider(auth, appleProvider);
    if (!result) return; // redirect flow — result comes via getRedirectResult
    const user = result.user;

    // Apple only provides firstName/lastName on the FIRST authorization.
    // Firebase doesn't always set user.displayName from it, so we check
    // every available source: displayName, the internal token response,
    // getAdditionalUserInfo profile, and providerData.
    const additionalInfo = getAdditionalUserInfo(result);
    const tokenResponse = result._tokenResponse || {};
    const appleName = [tokenResponse.firstName, tokenResponse.lastName].filter(Boolean).join(' ')
      || additionalInfo?.profile?.name
      || [additionalInfo?.profile?.given_name, additionalInfo?.profile?.family_name].filter(Boolean).join(' ')
      || user.providerData?.[0]?.displayName
      || '';
    const name = user.displayName || appleName || '';

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

    return result;
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
