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
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, Timestamp } from 'firebase/firestore';
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
          unsubClient = onSnapshot(clientsQuery, (snapshot) => {
            if (!snapshot.empty) {
              const clientDoc = snapshot.docs[0];
              setIsClient(true);
              setClientData({ id: clientDoc.id, ...clientDoc.data() });
            }
            // Don't clear clientData on empty snapshot — during signup the
            // doc may not be visible to the query yet but signup() already
            // set clientData directly. The real-time listener will pick up
            // the doc once it appears.
            setLoading(false);
          }, async (error) => {
            console.error('Error listening to client data:', error);
            // Fallback: try a one-time fetch so the session isn't stuck
            try {
              const snap = await getDocs(clientsQuery);
              if (!snap.empty) {
                const clientDoc = snap.docs[0];
                setIsClient(true);
                setClientData({ id: clientDoc.id, ...clientDoc.data() });
              }
            } catch (fallbackErr) {
              console.error('Fallback client fetch also failed:', fallbackErr);
            }
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
