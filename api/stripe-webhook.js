import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialise Firebase Admin (once per cold start)
if (!getApps().length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString()
  );
  initializeApp({ credential: cert(serviceAccount) });
}

const adminDb = getFirestore();

// Disable Vercel body parsing so we can verify the raw Stripe signature
export const config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':   return 'active';
    case 'trialing': return 'trialing';
    case 'canceled': return 'cancelled';
    case 'past_due':
    case 'unpaid':   return 'expired';
    default:         return stripeStatus;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read raw body for signature verification
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // --- Checkout completed (first subscription) ---
      case 'checkout.session.completed': {
        const session = event.data.object;
        const clientId = session.metadata?.firestoreClientId;

        if (clientId) {
          await adminDb.collection('clients').doc(clientId).update({
            tier: 'premium',
            subscriptionStatus: 'trialing',
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          });
        }
        break;
      }

      // --- Subscription updated (trial → active, payment failed, etc.) ---
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status;

        const snapshot = await adminDb
          .collection('clients')
          .where('stripeCustomerId', '==', subscription.customer)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const updates = {
            subscriptionStatus: mapStripeStatus(status),
          };

          if (['canceled', 'unpaid', 'past_due'].includes(status)) {
            updates.tier = 'free';
          } else if (['active', 'trialing'].includes(status)) {
            updates.tier = 'premium';
          }

          await doc.ref.update(updates);
        }
        break;
      }

      // --- Subscription fully deleted ---
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        const snapshot = await adminDb
          .collection('clients')
          .where('stripeCustomerId', '==', subscription.customer)
          .get();

        if (!snapshot.empty) {
          await snapshot.docs[0].ref.update({
            tier: 'free',
            subscriptionStatus: 'expired',
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}
