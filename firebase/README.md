# Proposed Firestore rules — DO NOT PUBLISH YET

This is a **draft for staging and emulator testing**, not a drop-in production replacement.

- Financial balances, request approvals, ledger and notification creation are server-only.
- The existing frontend still writes financial approvals directly; those buttons will fail if these rules are deployed before migrating the UI to callable functions.
- Existing staff management flows depend on role stored in Firestore. The proposed `admin()` instead requires a trusted Firebase Auth custom claim; it must be provisioned safely.
- The restricted user profile creation/update fields must be reconciled with the exact frontend account creation and editing payloads.
- Validate that every existing document has expected fields; missing fields and legacy data may require migrations.
- For store subscriptions and promotions, **do not trust client-submitted prices, plan IDs, or days**. A trusted server must read current package definitions and check ownership, limits, and pending status in a transaction.
- Check `stores`, `ads`, `follows`, `reviews`, `sorders` fields and query compatibility with Firebase Emulator Suite before publishing.
- Add tests for read queries: Firestore rules are not query filters.
- Current `staff()` is retained for UI compatibility, but should ultimately use server-verified claims and per-role permissions.
- Current `stores` and `ads` update policies still permit staff to edit broadly. Further least-privilege hardening is needed.
