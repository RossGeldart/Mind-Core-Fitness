import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import BADGE_DEFS from './badgeConfig';

/**
 * Award a badge to a user if they haven't already earned it.
 * Returns the badge object if newly awarded, or null if already owned / not found.
 */
export async function awardBadge(badgeId, clientData) {
  const badge = BADGE_DEFS.find(b => b.id === badgeId);
  if (!badge || !clientData?.id) return null;

  try {
    const badgeDocRef = doc(db, 'coreBuddyBadges', clientData.id);
    const badgeSnap = await getDoc(badgeDocRef);
    const existing = badgeSnap.exists() ? (badgeSnap.data().earned || []) : [];

    if (existing.some(b => b.id === badge.id)) return null; // already earned

    const newBadge = { id: badge.id, earnedAt: new Date().toISOString() };
    if (badgeSnap.exists()) {
      await updateDoc(badgeDocRef, { earned: [...existing, newBadge] });
    } else {
      await setDoc(badgeDocRef, { earned: [newBadge] });
    }

    // Create journey post
    await addDoc(collection(db, 'posts'), {
      authorId: clientData.id,
      authorName: clientData.name || 'Anonymous',
      authorPhotoURL: clientData.photoURL || null,
      type: 'badge_earned',
      metadata: { title: badge.name, badgeDesc: badge.desc, badgeId: badge.id },
      createdAt: serverTimestamp(),
      likeCount: 0,
      commentCount: 0,
    });

    return badge;
  } catch (err) {
    console.error('Badge award failed:', err);
    return null;
  }
}
