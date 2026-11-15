# SOUQNA — local integration testing (development only)

This directory contains an emulator configuration for Auth, Firestore, and Cloud Functions.
It does **not** deploy anything to the live Firebase project.

## Prerequisites
- Node.js 22 and Java 21
- Firebase CLI installed from `firebase/package.json`
- Install dependencies in both directories

```bash
cd firebase
npm install
cd ../functions
npm install
cd ../firebase
npm run test:rules
npx firebase emulators:start --project demo-souqna --only auth,firestore,functions
```

Firebase emulator endpoints: Auth 9099, Firestore 8080, Functions 5001.
The functions source is `../functions`, resolved relative to `firebase/firebase.json`.

## Testing callable functions
The browser currently uses the production Firebase configuration and the callable region
`europe-west1`. **Do not point the normal production UI at the emulator.**
For a local-only test page, use the Firebase Web SDK's `connectAuthEmulator`,
`connectFirestoreEmulator`, and `connectFunctionsEmulator` before any requests.

Create fake emulator-only users, ads, stores, packages, plans, and pending requests.
To simulate an administrator, set an `admin: true` custom claim **only in the Auth
emulator**, not on a live account. Call the eight endpoints with authenticated users.
The functions have `enforceAppCheck: true`; use a supported local App Check testing
configuration, and do not disable App Check in production.

Check:
1. Non-admin approval and moderation are denied.
2. Approval updates the balance and request status exactly once and creates a ledger
   entry and notification where applicable.
3. Repeated approvals/rejections do not double-charge or double-credit.
4. Rejecting an already approved request fails.
5. Invalid prices, missing related records, or insufficient stars fail without partial writes.
6. Ad/store moderation creates a notification in the same transaction.
7. Firestore client writes cannot modify paid fields.

## Before any real deployment
- Confirm the 25 Firestore rules tests and frontend checks pass on GitHub Actions.
- Test functions against emulators and review logs.
- Verify an administrator custom claim was assigned through a trusted process.
- Configure App Check and verify client support.
- Review all Firestore rule changes against live user journeys and back up data.
- Confirm Firebase billing implications and obtain explicit owner approval.
- Deploy rules/functions only after review; never deploy from this guide automatically.
