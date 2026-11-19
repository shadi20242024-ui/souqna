# SOUQNA — Social syndication of featured ads

## Accepted behavior

A customer's paid featured listing becomes eligible for organic publishing to SOUQNA's official Facebook Page and Instagram Professional account only after (1) its listing is approved and (2) the financial admin has confirmed the promotion and the stored stars are debited in one Firestore transaction.

The paid featured listing's own expiration `ads.featuredUntil` is the single source of truth. The same transaction creates or updates `socialPromotionJobs/{adId}` with `expiresAt` equal to that value. Re-approval of a completed request is rejected. Renewal extends that deadline and preserves remote post IDs to avoid duplicate publication.

When an ad is removed, `socialPromotionJobs/{adId}` is marked `removal_requested`.

This document distinguishes **organic posting to SOUQNA-owned profiles** from paid Facebook/Instagram advertising through Meta Ads Manager. The customer pays SOUQNA for featured placement; no Meta ad budget is created.

## Current implementation

- `functions/social-promotion.js`: validates promotional terms and plans actions for both networks.
- `functions/index.js`: builds a private posting job only upon administrator approval of a verified featured listing purchase.
- `functions/delete-ad.js`: flags associated published social content for removal when an ad is deleted.
- `firestore.rules` and `firestore.staging.rules`: prohibit client-side reads and writes of private posting jobs.
- Tests: `tests/social-promotion.test.mjs` and an emulator-backed payment/approval test in `tests/gallery-e2e.test.mjs`.

**No Facebook or Instagram posting is operational yet.** No Meta API credentials, publishing jobs, schedules or live connections have been created. Jobs remain `awaiting_connection`.

## Work required before turning on automatic publishing

1. Create official SOUQNA Facebook Page and connected Instagram Professional account (Business/Creator).
2. Create or authorize a suitable Meta app using Facebook Login for Business; request and validate the required Page publishing and Instagram content permissions.
3. Store credentials server-side using an approved secret-management facility. Never put Meta access tokens in web HTML or Firestore documents accessible by clients.
4. Provide an image reachable by Meta. Gallery Storage download URLs may be suitable; a listing with only an embedded Base64 primary photo needs a separately hosted branded image for Instagram.
5. Implement a server-side, idempotent posting worker using the Meta Graph API, with rate limiting, retries, response IDs and a durable per-platform status. Only post while `now < expiresAt`. Re-read the latest promotion state before each publishing action.
6. Implement a scheduled expiry reconciler. Use `actionsForSocialPromotion(job, now, connections)` to decide when removal is due; preserve the exact remote post IDs and recheck the current expiration to respect renewals.
7. Verify actual removal permissions. Meta's Facebook PagePost reference states that API deletion is restricted to select developers. Instagram media deletion is documented with Facebook Login and the `instagram_manage_contents` permission for supported non-ad content. If either API refuses removal, do **not** report success; keep the job open and alert administrators for manual removal.
8. Add admin controls for connecting accounts, previewing posts, viewing publishing failures, manually retrying and deactivating social distribution.

## Publishing and expiration policy

- No post before payment verification or if the ad is unapproved.
- No post after the end of the premium period or for deleted listings.
- No duplicate posts on renewal.
- No access tokens or user financial data in the generated post.
- A failed social publish must not cancel an already paid featured placement inside SOUQNA.
- A failed remote deletion must not leave the task falsely marked completed. Notify administrators and retry only when supported.
- Avoid promises of instantaneous publication or instantaneous deletion: external API approval, limits, outages and scheduler polling can introduce delays.
- Do not deploy Cloud Functions, enable billing, schedule jobs, or connect accounts without the owner's explicit approval.

## Relevant Meta documentation

- Facebook Page publishing: https://developers.facebook.com/docs/graph-api/reference/page/feed/
- PagePost deletion restrictions: https://developers.facebook.com/docs/graph-api/reference/pagepost
- Instagram media deletion: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/v21.0/
- Instagram API account and page requirements: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
