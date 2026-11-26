import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const firebaseApp = initializeApp(AUCTION_CONFIG),
  auth = getAuth(firebaseApp),
  db = getFirestore(firebaseApp);
const command = async (d) =>
  (
    await httpsCallable(
      getFunctions(firebaseApp, "us-central1"),
      "souqnaAuctionTest",
    )({ ...d, requestId: crypto.randomUUID() })
  ).data;
const rows = (s) =>
  s.docs.map((d) => ({ ...d.data(), id: d.data().id || d.id }));
const service = {
  demo: false,
  command,
  async verify() {
    await sendEmailVerification(auth.currentUser);
  },
  async recheck() {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
  },
  async load() {
    await auth.authStateReady();
    const me = auth.currentUser
      ? await command({ action: "session" })
      : { uid: "guest" };
    me.verified = !!(
      auth.currentUser?.emailVerified || auth.currentUser?.phoneNumber
    );
    const [pub, cat, drafts, issues, audit, notes] = await Promise.all([
      getDocs(collection(db, "auctionTestPublic")),
      getDoc(doc(db, "auctionTestSettings", "catalog")),
      me.staff
        ? getDocs(
            query(
              collection(db, "auctionTestLots"),
              where("status", "==", "draft"),
            ),
          )
        : null,
      me.staff ? getDocs(collection(db, "auctionTestIssues")) : null,
      me.staff ? getDocs(collection(db, "auctionTestReports")) : null,
      auth.currentUser
        ? getDocs(
            query(collection(db, "notifs"), where("userId", "==", me.uid)),
          )
        : null,
    ]);
    return {
      me,
      lots: [...rows(pub), ...(drafts ? rows(drafts) : [])],
      cats: cat.data()?.categories || auctionCore.categories,
      issues: issues ? rows(issues) : [],
      audit: audit ? rows(audit) : [],
      notes: notes ? rows(notes).sort((a, b) => a.createdAt - b.createdAt) : [],
    };
  },
  async media(id, file) {
    const m = (
      await getDoc(doc(db, "auctionTestLots", id, "media", file))
    ).data();
    return m ? "data:" + m.mime + ";base64," + m.bytes : "";
  },
  async history(id) {
    return rows(
      await getDocs(
        query(
          collection(db, "auctionTestPublic", id, "history"),
          orderBy("count", "desc"),
          limit(50),
        ),
      ),
    );
  },
};
