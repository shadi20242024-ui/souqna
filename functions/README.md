# SOUQNA: trusted star-credit approval (staged)

This directory contains an **un-deployed** Firebase callable function for approving pending star top-up requests atomically. It is not yet wired into the frontend and does not prove production security.

## Before deploying
1. Verify Firebase project ownership, billing/Cloud Functions availability, region, and App Check setup.
2. Review **deployed** Firestore rules and deny client-side writes to `users.stars`, `transactions`, and approvals of `starOrders`. Ensure other user profile fields can still be updated safely with field-level validation.
3. Grant the `admin: true` Firebase Authentication custom claim **only through trusted admin tooling**. Never allow a client to grant this claim or rely on the editable Firestore `role` field.
4. Configure Firebase App Check for the web client before enabling this function; otherwise calls will be rejected.
5. Deploy to a staging Firebase project first, with Emulator Suite tests for duplicate calls, simultaneous approvals, malformed orders, missing users, invalid balances, non-admins, and offline errors.
6. After deployment and tests, replace the frontend `ordok` direct writes with an authenticated `httpsCallable(functions, "approveStarOrder")` call, and re-fetch the updated data.
7. Implement equivalent trusted transactions for promotions and store subscriptions **before accepting real payments**.

No production database or rules have been modified by this commit. The function intentionally cannot be invoked from the current UI.
