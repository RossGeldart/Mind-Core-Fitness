// Stripe publishable key (safe for client-side — switch to pk_live_ for production)
export const STRIPE_PUBLISHABLE_KEY =
  'pk_test_51T0qGRGd5tLfJN5xq1wrmfh3y0GjJSaS15lBU2jjIpdMnaviJwU9D7qEmkZ1cDsy6crpbAbhPSPAMpCSeX3C5qRD00sfAgdLPP';

// Price IDs — update after creating products in Stripe Dashboard
export const STRIPE_PRICES = {
  monthly: 'price_PLACEHOLDER_MONTHLY',
  annual: 'price_PLACEHOLDER_ANNUAL',
};
