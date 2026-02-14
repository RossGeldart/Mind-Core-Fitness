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
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        if (user.uid === ADMIN_UID) {
          setIsAdmin(true);
          setIsClient(false);
          setClientData(null);
        } else {
          // Check if this user is a client
          setIsAdmin(false);
          try {
            const clientsQuery = query(
              collection(db, 'clients'),
              where('uid', '==', user.uid)
            );
            const snapshot = await getDocs(clientsQuery);
            if (!snapshot.empty) {
              const clientDoc = snapshot.docs[0];
              setIsClient(true);
              setClientData({ id: clientDoc.id, ...clientDoc.data() });
            } else {
              setIsClient(false);
              setClientData(null);
            }
          } catch (error) {
            console.error('Error fetching client data:', error);
            setIsClient(false);
            setClientData(null);
          }
        }
      } else {
        setIsAdmin(false);
        setIsClient(false);
        setClientData(null);
      }

      setLoading(false);
    });

    return unsubscribe;
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
    await setDoc(clientRef, {
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
    });

    return userCredential;
  };

  const updateClientData = (fields) => {
    setClientData(prev => prev ? { ...prev, ...fields } : prev);
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
