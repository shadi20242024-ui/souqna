# SOUQNA — Social syndication of featured ads

## Accepted behavior

A customer's paid featured listing becomes eligible for organic publishing to SOUQNA's official Facebook Page and Instagram Professional account only after (1) its listing is approved and (2) the financial admin has confirmed the promotion and the stored stars are debited in one Firestore transaction.

The paid featured listing's own expiration `ads.featuredUntil` is the single source of truth. The same transaction creates or updates `socialPromotionJobs/{adId}` with `expiresAt` equal to that value. Re-approval of a completed request is rejected. Renewal extends that deadline and preserves remote post IDs to avoid duplicate publication.

When an ad is removed, `socialPromotionJobs/{adId}` is marked `removal_requested`.

This document distinguishes **organic posting to SOUQNA-owned profiles** from paid Facebook/Instagram advertising through Meta Ads Manager. The customer pays SOUQNA for featured placement; no Meta ad budget is created.

## Current implementation

- `functions/social-promotion.js`: validates promotional periods, selects verified JPEG photos, prevents duplicate posts on renewal and records `nextActionAt`.
- `functions/index.js`: creates or extends the private posting job only after the financial administrator approves the paid promotion.
- `functions/meta-social-client.js`: implements guarded Facebook photo/feed publishing, Instagram media-container publishing, and confirmed remote deletion through Graph API. The adapter defaults to **disabled**.
- `functions/social-queue-worker.js`: implements staging-only due-job processing, per-platform claims, five-minute leases, expiry reconciliation and review-required status for ambiguous API results. It never blindly retries uncertain publishes.
- `functions/social-triggers.js`: defines immediate document-change and five-minute scheduled triggers; these are **not registered** in `functions/index.js`, so no trigger is deployed.
- `functions/social-status.js` and `index.html`: expose an administrator-only, read-only queue status listing without remote post IDs or credentials.
- `functions/delete-ad.js`: flags associated published social content for removal when an ad is deleted.
- `firestore.rules` and `firestore.staging.rules`: prohibit direct client reads or writes of private posting jobs.
- Tests: `tests/social-promotion.test.mjs`, `tests/social-worker.test.mjs`, `tests/social-status.test.mjs`, and the emulator payment/approval test in `tests/gallery-e2e.test.mjs`.

**No Facebook or Instagram posting is operational yet.** The pages and approved Meta integration are not connected. No credentials, scheduled functions or publishing triggers have been deployed. New jobs remain unprocessed until integration is explicitly authorized and activated.

## Work required before turning on automatic publishing

1. Create official SOUQNA Facebook Page and connected Instagram Professional account (Business/Creator).
2. Create or authorize a suitable Meta app using Facebook Login for Business; request and validate the required Page publishing and Instagram content permissions.
3. Store credentials server-side using an approved secret-management facility. Never put Meta access tokens in web HTML or Firestore documents accessible by clients.
4. Provide an image reachable by Meta. Gallery Storage download URLs may be suitable; a listing with only an embedded Base64 primary photo needs a separately hosted branded image for Instagram.
5. Configure and review server-side Meta Graph API credentials. Set the adapter's `enabled` flag only after real account IDs and permissions are verified, with rate limits and safe credential rotation.
6. After explicit authorization, wire the factory from `functions/social-triggers.js` to staging Firebase exports and deploy the trigger(s). The code is prepared but deliberately not registered now; a scheduled trigger can require a paid Firebase plan.
7. Verify actual removal permissions. Facebook PagePost deletion is supported via the Graph API but may be permission-restricted; Instagram content deletion requires suitable permissions including `instagram_manage_contents` for supported media and account types. If either API refuses removal, retain the task for manual action and do not report success.
8. Extend admin controls for securely connecting accounts, previewing posts, resolving uncertain publishes, manually retrying confirmed failures and deactivating social distribution.
9. Confirm that public JPEG images are accessible to Meta and exercise posting/removal using owned Meta test accounts before enabling customer-facing automatic posting.

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
