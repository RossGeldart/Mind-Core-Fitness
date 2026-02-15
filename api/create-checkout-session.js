import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { priceId, clientId, uid, email } = req.body;

  if (!priceId || !clientId || !uid || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
      },
      success_url: `${req.headers.origin}/login/client/core-buddy?upgraded=true`,
      cancel_url: `${req.headers.origin}/login/upgrade`,
      customer_email: email,
      metadata: {
        firebaseUid: uid,
        firestoreClientId: clientId,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    return res.status(500).json({ error: err.message });
  }
}
