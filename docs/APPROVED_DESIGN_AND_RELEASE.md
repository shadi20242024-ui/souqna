# SOUQNA — Approved As-Suwayda Marketplace UI

## Design is locked to the owner's latest reference

This branch is implementing the last approved navy-and-gold desktop layout, not replacing it with a new design. Preserve all major sections:

- Gold shopping-bag identity with Arabic **سوقنا** and English **SOUQNA**;
- Dark-blue global navigation with account, stars/balances, ads, stores and services;
- As-Suwayda city hero, wide RTL search, and the owner's approved brand imagery;
- Two-level animated news bar: administrative headline ticker + weather, duty pharmacies, fuel and featured-offer shortcuts;
- Left desktop sidebar for real-time As-Suwayda weather and manually verified local services;
- Glossy 3D category icons and responsive, image-led cars / real estate / shopping listings;
- Store-creation and vehicle promo strips, separately scheduled paid sponsor banner with manual payment approval;
- Admin-controlled news, fuel availability, duty shifts and sponsor placement;
- Responsive behavior for tablet/mobile preserving the same blue/gold brand.

The existing native Firebase/Firestore data models, permissions and callable handlers must remain intact. The home page layout refactor is not authorization or a deploy command.

## Screens and functionality

The app has real Firebase Auth / Firestore integration, approved ad and store listings, a user dashboard, wallet/credit records, subscription/featured requests, staff management, service orders, reviews/follows, WhatsApp links and admin-managed news/banners.

The supplied standalone HTML preview separately demonstrates visual behaviors with local data and localStorage. Sample cars, phones and property photos in that preview are **examples**, not live offers.

## Information accuracy

The weather widget requests current readings for As-Suwayda from Open-Meteo. It must not show fictitious 'current' temperatures if the API is unavailable.

Pharmacy duty changes must be admin-confirmed, expire after 24 hours and be displayed as manually maintained. Fuel availability must be admin-updated and excluded from the news ribbon after 24 hours. Do not imply governmental or real-time verification.

A sponsor placement is not automatically activated because a user submitted a request. Ads appear only if `active===true`, `paymentVerified===true`, the start date is reached and end date has not passed. Payment verification is **manual** at this stage; there is no payment gateway.

## Owner branding and Firebase setup (development branch)

The approved screenshot was packaged with two deployable images in a separate user-facing archive: `logo_bag.webp` and `sweida_approved_hero_clean.webp`. The application admin screen now previews and compresses both images before saving them. This improves the existing Firebase site-settings workflow; it does **not** deploy assets into Firebase automatically.

1. In an isolated staging Firebase environment, provision a trustworthy admin custom claim from a secured server-side tool, not browser code.
2. In the admin dashboard open **🎨 المظهر والإعدادات**, choose `logo_bag.webp` as logo and `sweida_approved_hero_clean.webp` as hero banner, verify previews and save.
3. The hero image is a cropped design reference; verify no remnant UI or duplicate search field is visible when applied to the responsive home page. This image is **not** a verified standalone licensed city photograph.
4. Set up reCAPTCHA v3 App Check in Firebase Console, register authorized domains and enter only the **public site key**. The frontend now clearly rejects privileged callable actions if App Check is not initialized. SDK initialized does **not** prove server token acceptance.
5. If the trusted admin claim was recently granted, use the owner-account **🔐 تحديث صلاحيات حسابي** control to refresh the ID token, and re-test the authorized dashboard.
6. Confirm backend callable operations in staging. Release to production only after all remaining items below are checked.

## Marketplace browsing improvements — November 16, 2026

- The approved categories now include the All Categories tile and an expandable More button without changing the navy/gold design.
- The real public approved-ad listing supports Arabic letter-form normalization (alef/hamza, ya, Arabic diacritics), text and city/area filtering, and sort by newest, oldest, featured or price.
- Minimum and maximum price filters become active only after a currency is selected. Unlike a currency converter, price sorting groups different currencies rather than silently treating their numbers as equivalent.
- Large result sets display twelve ads at a time with previous/next pagination, result count and clear-filter action.
- Ad thumbnails use HTML image tags with URL and HTML escaping rather than interpolating an untrusted URL inside an inline CSS declaration. Shop background image URLs also use an encoded, restricted URL path. This preserves the same visual cards.
- CI added automated checks covering Arabic normalization, price sorting and filtering, pagination controls, trusted image protocols, and injection safety.

## Production release checklist

- [x] Firestore rules and permissions tests on emulator
- [x] Functions authorization/validation tests
- [x] Firestore Emulator integration for critical financial and moderation transactions
- [x] Frontend JavaScript syntax/regression tests
- [x] Desktop-first screenshot-aligned home implementation + mobile responsive CSS
- [x] Two animated information ribbons, duty/fuel cards, and manually approved paid banner
- [ ] Add approved brand imagery to the Firebase site settings (the actual site banner and logo). These image assets are present in the standalone preview; the development repository does **not** yet embed the matching exported raster asset
- [ ] Provision Firebase App Check reCAPTCHA v3 in the Firebase console, register authorized hosts and put the **public site key** in owner settings; verify tokens in browser
- [ ] Set owner Firebase Auth custom claim (`admin: true`) through a trusted operator tool, never from client JS
- [ ] Verify Firestore composite indexes in a staging instance, browser login/signup and service orders
- [ ] Confirm Firebase Functions v2 hosting/billing/quotas, backups and rollback; review data-protection requirements
- [ ] Review live data sources and rights for local business contact information and marketplace images
- [ ] Get the owner's explicit permission to merge to `main` and deploy to production

Nothing in this branch authorizes a production deploy, live financial transaction or real payment.
