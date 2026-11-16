# SOUQNA staging preparation — 2026-11-16

Status: preparation only. No Firebase cloud project has been created or selected. Nothing has been deployed. Billing has not been enabled. Production souqna-sweida has not been accessed or modified.

## Findings from main at 0d34b65a9dfa2957dd306a54b765a472a5e45dda

- index.html directly initializes production Firebase.
- No firebase.json, .firebaserc, Firestore rules or indexes are checked into this revision. Deployed rules are unknown; this is not an audit of live production rules.
- The client changes user roles, star balances, subscriptions and promotion approvals with separate Firestore writes. Backend authorization must enforce these actions. Financial operations need atomic, idempotent trusted processing before release.
- User profiles include name/email/role/stars. Never allow broad profile reads or self-assigned privileges.
- Stores have ownerId; subscriptions are per store. Rules must verify store ownership, package references and immutable owner fields.
- Guest browsing and owner/admin queries must be tested against final rules.
- Several client paths swallow errors; successful rendering does not establish successful backend operations.

## Files

firebase.staging.json is separate from production configuration. No default project alias or automatic deployment workflow is added.
staging/firestore.rules is a deny-all quarantine baseline, NOT final application authorization. Firestore features will be blocked until reviewed, model-specific rules are implemented and emulator tests pass.
staging/firestore.indexes.json is an empty initial file, not a verified index inventory.
scripts/build-staging.mjs produces staging-dist using an actual staging web-app config, rejects production targets and replaces the staging service worker to prevent stale cached production HTML.

## Required cloud setup (not executed)

1. Obtain an existing independent staging project ID or create a free Spark project (suggested ID prefix: souqna-staging). Do not attach billing.
2. Verify actual project ID, billing status and available free quota. Choose a supported free Firestore edition/location before creating the database; location is a persistent decision.
3. Register a separate Web app, retrieve its real SDK config, and save it outside the hosting output. No guessed API keys or app IDs.
4. Enable email/password Authentication only; do not enable phone/SMS. Verify authorized domains.
5. Review all collections, queries and business operations; implement/test final rules. No live rules were retrieved in this session.
6. Explicit approval is required before any deployment, including Auth settings, rules, indexes or Hosting. No deploy command is executed by the supplied build script.

## Local preparation after Firebase access is available

Run from repository root:

```powershell
npx -y firebase-tools@latest --version
npx -y firebase-tools@latest login:list
node scripts/build-staging.mjs PATH_TO_STAGING_WEB_CONFIG.json
npx -y firebase-tools@latest emulators:start --config firebase.staging.json --project demo-souqna-staging
```

The demo project is for emulators only. The built client still needs explicit emulator SDK connections for Auth/Firestore before any local data testing; do not assume hosting emulator alone redirects SDK calls. The deny-all baseline deliberately prevents Firestore data access.

## Verification limits

GitHub source and configuration were reviewed. Node is available. Firebase CLI installation failed due to restricted access to the npm registry; emulator compilation, authorization tests, real sign-in and cloud connectivity have NOT run. Firebase is installed as a plugin, but no Firebase service tools were exposed in this session.

Do not launch or describe this branch as a working staging environment yet.
