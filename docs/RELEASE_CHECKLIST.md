# SOUQNA — development validation checklist

This branch is a proposed update, **not a production release**. It preserves the existing blue-and-gold codebase while adding dual news ribbons, fuel stations, ad image optimization, and paid-banner booking requests.

## Local source check

Run `npm install`, `npm --prefix functions install`, then `npm test` (Node 22+, Java 21+); this checks source, cache assets, Auth/Firestore/Functions emulators, and trusted financial approval flows. Run `node scripts/check-souqna.mjs` for the lightweight source check alone. It validates JavaScript syntax and confirms key UI features are present. It does **not** verify UI rendering, Firebase integration, or deployed security.

## Before merging or publishing

1. Compare the new interface with the separately approved SOUQNA interactive mockup (navy/blue and gold, Sweida background, 3D icons). The existing GitHub interface is not yet a full visual match.
2. Use two ordinary test accounts and an existing administrator on a **test Firebase project**. Confirm users cannot write `role`, `stars`, `featuredUntil`, store subscription fields, or approve their own sponsors through direct Firestore calls.
3. Review `firestore.rules` and test it with the Firestore emulator. The rules are a draft and have **not** been deployed. Firestore-emulator unit tests have been added to GitHub Actions; verify the current CI result and run additional integration tests before deploying to production.
4. Verify new-account registration, ad posting/approval, store registration and editing, subscription requests, reviews, notifications, services, and account login. Test both authenticated and anonymous query access.
5. Upload JPEG, PNG, and WebP images, verify preview and compressed output; reject oversized/invalid images; check duplicate-image selection and rapid re-selection.
6. Enter news text and on-duty pharmacy/fuel-station data as admin; confirm both ribbons display appropriately, and the second is **below the paid sponsor banner**. Verify the settings toggles and reduced-motion behavior.
7. Create a sponsor request as a regular user. Admin should see it; the sponsor must **not appear publicly before** the admin explicitly confirms payment. Test rejection, repeat approval attempts, and Firestore transaction security.
8. Check mobile screens, keyboard navigation, assistive technology labels, PWA installation, HTTPS, cache updates, and offline fallback.
9. Audit billing logic for stars, promotions, store subscriptions, and all admin approvals. Star top-up, store subscriptions, ad promotion, paid banner activation, and manual star adjustments now use the **server-side** `souqnaFinance` callable function with atomic Firestore transactions and admin authorization. User-side writes to balances, subscription state, paid sponsorship approvals and ledgers are denied by the draft rules. **The admin's confirmation is not bank/payment-provider verification**; manual reconciliation with actual receipts is still required.
10. Monitor Firestore document-size limits. Compressed images are currently embedded in documents; for scale and production reliability, migrate uploads to protected object storage.

## Infrastructure notes

- Firebase project previously configured in the app: `souqna-sweida`. Firebase SDK modules load from Google's CDN.
- No direct Firebase production deployment or database alteration is performed by this branch.
- The 1-star = USD 1 convention is a **business pricing rule**, not automatic online payment processing.
- Fuel-station and pharmacy status content is entered by administrators; it must not be represented as independently verified real-time data.
- Account-level `maxStores` and store-level `maxAds` are currently enforced by client UI; server-side enforcement is necessary before production.
- Role and billing controls are now enforced in the `firestore.rules` draft and server-side callable. Additional end-to-end production security review is still needed.
- Firebase Functions deployment **requires Blaze billing**, despite no-cost monthly usage allowances. Local emulator testing can remain free. Set a billing budget, alerts and Cloud Run maximum instances before deployment.
- Existing production users may still have an older cached site/service worker. Schedule a coordinated deployment of Functions, Security Rules and the client and check old-tab behavior. **Never deploy these restrictive rules alone** while the old client still performs direct billing writes.
- Additional pre-launch requirements: implement App Check where practical, explicitly log manual payment verification references, audit role changes, verify authorization revocations and migrate base64 media out of Firestore at scale.
