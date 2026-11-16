# SOUQNA — Security and Release Audit

Status: initial static source review only. Not a penetration test or production readiness certification.

## Confirmed findings
1. **Critical: star credits and debits are performed by client-side Firestore writes.** The `ordok`, `prok`, and `subok` handlers update balances, ledger entries, and request statuses in separate operations. Repeated approvals, concurrent actions, and partial failures can produce incorrect balances.
2. **Critical pending rules review: authorization is displayed based on `users/{uid}.role`.** The frontend uses `isStaff()` and `isAdm()`; these are UI checks only. Verify deployed Firestore Security Rules reject unauthorized writes regardless of client code.
3. **High: store advertisement quotas are enforced in the browser.** The `post` handler counts locally loaded ads. Enforce limits on the trusted backend.
4. **High: request amounts and subscription plan data are client-supplied.** The backend must look up authoritative package pricing and validate ownership, approval state, and amount.
5. **Medium: no Firestore rules, test suite, or deployment configuration was visible in the repository root during this review.** This does not prove deployed rules are missing.
6. **PWA: the service worker previously precached missing `ui.jpg` and swallowed installation errors.** The service worker was updated in this branch to precache existing core assets and avoid silently ignoring install errors.

## Required before production
- Export and review the **deployed** Firestore Security Rules and relevant Firebase Auth settings.
- Implement a trusted server-side approval endpoint (e.g. Firebase Cloud Functions) using Firestore transactions. Check pending status and account balances inside the transaction, and write balance, request status, and ledger atomically. Use stable request IDs as idempotency keys.
- Restrict privileged approval functions to administrator custom claims or equivalent server-verified roles.
- Test authorization with a second non-admin account, including direct SDK requests.
- Add emulator tests for unauthorized reads/writes, double approvals, negative balances, cross-account store edits, and subscription expiry.
- Test navigation, search, advertisements, stores, reviews, notifications, images, and PWA install on desktop and mobile.
- Verify hosting, backup, privacy notice, moderation workflows, and payment procedures.

## Change management
This branch is isolated from `main`. No security rules or financial balance code have been changed yet. Do not launch payments until the critical items are resolved.
