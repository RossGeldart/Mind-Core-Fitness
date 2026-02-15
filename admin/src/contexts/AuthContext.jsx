import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
} from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, onSnapshot, doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db, ADMIN_UID } from '../config/firebase';

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

  useEffect(() => {
    let unsubClient = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
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

  const updateClientData = (fields) => {
    setClientData(prev => prev ? { ...prev, ...fields } : fields);
  };

  const value = {
    currentUser,
    isAdmin,
    isClient,
    clientData,
    updateClientData,
    login,
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
