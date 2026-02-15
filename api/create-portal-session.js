import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialise Firebase Admin (once per cold start)
if (!getApps().length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString()
  );
  initializeApp({ credential: cert(serviceAccount) });
}

const adminDb = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stripeCustomerId, clientId } = req.body;

  if (!stripeCustomerId || !clientId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Verify the caller owns this client record by checking the Firebase ID
  // token passed in the Authorization header.
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = await getAuth().verifyIdToken(token);
      const clientDoc = await adminDb.collection('clients').doc(clientId).get();
      if (!clientDoc.exists || clientDoc.data().uid !== decoded.uid || clientDoc.data().stripeCustomerId !== stripeCustomerId) {
        return res.status(403).json({ error: 'Unauthorised' });
      }
    } catch (err) {
      console.error('Auth verification failed:', err);
      return res.status(403).json({ error: 'Unauthorised' });
    }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${req.headers.origin}/login/client/core-buddy`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Portal session error:', err);
    return res.status(500).json({ error: err.message });
  }
}
