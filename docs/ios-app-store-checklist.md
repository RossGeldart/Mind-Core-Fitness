# Apple Developer & App Store Connect Checklist

## 1. Apple Developer Account
- [x] Enrolled in Apple Developer Program (£79/yr)
- [x] Account holder has accepted latest agreements

## 2. App Store Connect — App Listing
- [ ] App created with bundle ID `com.corebuddy.app`
- [ ] App name reserved (e.g. "Core Buddy" or "Mind Core Fitness")
- [ ] Primary language set
- [ ] Category selected (Health & Fitness)
- [ ] Age rating questionnaire completed

## 3. App Store Connect — Paid Apps Agreement
- [ ] **Paid Apps agreement** accepted (separate from the free apps agreement)
- [ ] Bank account added for payments
- [ ] Tax forms completed (this is required before you can sell subscriptions)

## 4. App Store Connect — Subscription Products
- [ ] Created a **Subscription Group** (e.g. "Core Buddy Premium")
- [ ] **Monthly product** created:
  - Product ID: e.g. `core_buddy_monthly`
  - Price: £9.99/mo
  - Auto-renewable
  - 7-day free trial configured (if you want to match the web offer)
- [ ] **Annual product** created:
  - Product ID: e.g. `core_buddy_annual`
  - Price: £99.99/yr
  - Auto-renewable
  - 7-day free trial configured
- [ ] Subscription localisation added (display name, description)
- [ ] Review screenshot uploaded for each product (can be a simple screenshot of the paywall)

## 5. App Store Connect — Sandbox Testing
- [ ] At least one **Sandbox tester account** created (Settings → Sandbox → Test Accounts)
- [ ] Sandbox tester uses an email NOT linked to a real Apple ID

## 6. Certificates & Provisioning (Xcode/Build)
- [ ] iOS Distribution certificate created
- [ ] App ID registered with bundle ID `com.corebuddy.app`
- [ ] **In-App Purchase capability** enabled on the App ID
- [ ] Provisioning profile created (or using automatic signing in Xcode)

## 7. RevenueCat Setup (if using RevenueCat)
- [ ] RevenueCat account created at [revenuecat.com](https://www.revenuecat.com)
- [ ] New project created in RevenueCat dashboard
- [ ] **App Store Connect API key** generated and added to RevenueCat:
  - App Store Connect → Users & Access → Integrations → Keys → In-App Purchase
  - Download the `.p8` key file and upload to RevenueCat
- [ ] **App Store Connect Shared Secret** added to RevenueCat:
  - App Store Connect → App → Subscriptions → App-Specific Shared Secret
- [ ] Products mapped in RevenueCat (Entitlements → Offerings → Packages)
- [ ] RevenueCat **API key** noted (public key for the app, starts with `appl_`)

## 8. Server Notifications (for subscription lifecycle)
- [ ] **RevenueCat webhook URL** configured (you'll set this after building the endpoint)
- [ ] OR: Apple Server-to-Server notifications URL set in App Store Connect (RevenueCat handles this for you if using RevenueCat)
