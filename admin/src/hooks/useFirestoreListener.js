import { useEffect, useState, useRef } from 'react';
import { onSnapshot } from 'firebase/firestore';

/**
 * Subscribe to a Firestore query in real time.
 *
 * @param {import('firebase/firestore').Query|null} query  – pass null to skip
 * @param {object}  [opts]
 * @param {(docs: Array<{id:string}&object>) => any} [opts.transform] – post-process docs before setting state
 * @param {(err: import('firebase/firestore').FirestoreError) => void} [opts.onError]
 * @returns {{ data: any[], loading: boolean, error: Error|null }}
 */
export default function useFirestoreListener(query, opts = {}) {
  const { transform, onError } = opts;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(!!query);
  const [error, setError] = useState(null);

  // Keep callbacks stable across renders without forcing re-subscribe
  const transformRef = useRef(transform);
  const onErrorRef = useRef(onError);
  transformRef.current = transform;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!query) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      query,
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setData(transformRef.current ? transformRef.current(docs) : docs);
        setLoading(false);
      },
      (err) => {
        console.error('useFirestoreListener error:', err);
        setError(err);
        setLoading(false);
        onErrorRef.current?.(err);
      },
    );

    return () => unsub();
    // Re-subscribe when query reference changes.
    // Callers should useMemo their query so this doesn't churn.
  }, [query]);

  return { data, loading, error };
}
