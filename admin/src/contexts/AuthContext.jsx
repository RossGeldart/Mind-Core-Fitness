import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
} from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
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

  const value = {
    currentUser,
    isAdmin,
    isClient,
    clientData,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
