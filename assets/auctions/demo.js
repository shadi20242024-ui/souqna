const stateKey = "souqna.auctions.training.v1";
const accounts = {
  guest: "زائر",
  buyer: "مشتري أول",
  rival: "مشتري ثانٍ",
  seller: "البائع",
  manager: "المدير العام",
  agent: "المشرف",
};
let who = "guest";
function seed() {
  const now = Date.now(),
    lots = {},
    names = [
      "كيا سبورتاج • فحص ومعاينة",
      "شقة سكنية في السويداء",
      "غسالة أوتوماتيكية",
      "هاتف ذكي",
      "معدات ورشة",
      "طقم جلوس",
    ];
  auctionCore.categories.forEach((category, i) => {
    const id = "lot" + i;
    lots[id] = {
      ...auctionCore.init({
        title: names[i],
        description: "معروض تجريبي لاختبار المزايدة والتسليم في سوقنا.",
        category,
        seller: "seller",
        currency: "USD",
        start: now + (i === 1 ? 3600000 : -60000),
        end: now + (i === 1 ? 7200000 : i === 2 ? 90000 : 86400000),
        opening: [7500, 17000, 100, 180, 350, 400][i],
        reserve: i === 0 ? 8000 : 0,
        step: i === 0 ? 100 : 10,
        deposit: i === 0 ? 200 : 20,
        fee: 0,
        commission: 2,
        photos: [],
        videos: [],
        pdf: "",
        spin: false,
        stream: "",
      }),
      id,
      status: "published",
    };
  });
  return {
    lots,
    cats: [...auctionCore.categories],
    staff: { agent: true },
    wallets: Object.fromEntries(
      Object.keys(accounts)
        .filter((x) => x !== "guest")
        .map((x) => [x, auctionCore.funds()]),
    ),
    audit: [],
    notifications: [],
    media: {},
    issues: [],
  };
}
let memory = seed();
function readState() {
  try {
    return JSON.parse(localStorage.getItem(stateKey)) || memory;
  } catch {
    return memory;
  }
}
function writeState(s) {
  try {
    localStorage.setItem(stateKey, JSON.stringify(s));
  } catch {
    throw Error("تعذر حفظ التجربة. تحقق من المساحة المتاحة للمتصفح");
  }
  memory = s;
}
if (!localStorage.getItem(stateKey)) writeState(memory);
function identity(s) {
  return {
    uid: who,
    admin: who === "manager",
    staff: who === "manager" || !!s.staff[who],
    wallet: s.wallets[who],
    verified: who !== "guest",
  };
}
function execute(s, actor, d) {
  const a = s.lots[d.id];
  let movements = [],
    events = [];
  if (d.action === "category") {
    auctionCore.check(
      actor.admin && !s.cats.includes(d.name),
      "التصنيف موجود أو الصلاحية غير كافية",
    );
    s.cats.push(auctionCore.label(d.name, 60));
  } else if (d.action === "assign") {
    auctionCore.check(
      actor.admin && accounts[d.target] && d.target !== "guest",
      "راجع الحساب",
    );
    s.staff[d.target] = d.enabled;
  } else if (d.action === "save") {
    auctionCore.check(
      actor.staff && (!a || a.status === "draft") && s.wallets[d.lot.seller],
      "راجع صلاحية التعديل وحساب البائع",
    );
    s.lots[d.id] = {
      ...auctionCore.init(auctionCore.draft(d.lot, s.cats)),
      id: d.id,
    };
  } else if (d.action === "dispute") {
    auctionCore.check(
      [a.seller, ...a.entries.map((e) => e.uid)].includes(actor.uid) &&
        !s.issues.some((v) => v.id === d.id && v.uid === actor.uid),
      "الشكوى مسجلة أو الحساب غير مشارك",
    );
    s.issues.push({
      id: d.id,
      uid: actor.uid,
      text: auctionCore.label(d.text, 800),
      status: "open",
    });
  } else if (d.action === "resolve") {
    auctionCore.check(actor.staff, "صلاحية مطلوبة");
    const issue = s.issues.find(
      (i) => i.id === d.id && i.uid === d.target && i.status === "open",
    );
    issue.resolution = auctionCore.label(d.text, 800);
    issue.status = "resolved";
  } else {
    if (d.action === "bid")
      auctionCore.check(
        d.amount <=
          (s.wallets[actor.uid]?.[a.currency]?.available || 0) +
            (a.entries.some((e) => e.uid === actor.uid) ? a.deposit : 0),
        "المبلغ يتجاوز الرصيد الافتراضي",
      );
    if (d.action === "confirm")
      auctionCore.check(
        !s.issues.some(
          (i) =>
            i.id === d.id &&
            i.status === "open" &&
            [a.seller, a.leader].includes(i.uid),
        ),
        "التسوية معلقة لحين حل النزاع",
      );
    ({ movements, events } = auctionCore.apply(a, actor, d, Date.now()));
    for (const m of movements)
      s.wallets[m.uid] = auctionCore.wallet(s.wallets[m.uid], m);
  }
  s.notifications.push(...events);
  s.audit.push({
    id: d.id,
    uid: actor.uid,
    time: Date.now(),
    action: d.action,
    movements,
    price: a?.price || 0,
  });
}
async function mutateDemo(f) {
  const run = () => {
    const s = readState();
    f(s);
    writeState(s);
  };
  if (navigator.locks) await navigator.locks.request(stateKey, run);
  else run();
}
// Media is kept outside the small Web Storage quota used for the local ledger.
let mediaDatabase;
async function localMedia(key, value) {
  if (!mediaDatabase)
    mediaDatabase = new Promise((ok, fail) => {
      const r = indexedDB.open("souqna-auction-media", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
  const db = await mediaDatabase;
  return new Promise((ok, fail) => {
    const tx = db.transaction("files", value ? "readwrite" : "readonly"),
      store = tx.objectStore("files"),
      r = value ? store.put(value, key) : store.get(key);
    tx.oncomplete = () => ok(r.result);
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
  });
}
const service = {
  demo: true,
  async load() {
    let s = readState();
    if (
      Object.values(s.lots).some(
        (a) => a.status === "published" && a.end <= Date.now(),
      )
    ) {
      await mutateDemo((v) => {
        for (const a of Object.values(v.lots))
          if (a.status === "published" && a.end <= Date.now())
            execute(
              v,
              { uid: "scheduler", system: true },
              { action: "close", id: a.id },
            );
      });
      s = readState();
    }
    const me = identity(s);
    return {
      me,
      cats: s.cats,
      lots: Object.values(s.lots).filter(
        (a) => me.staff || a.status !== "draft",
      ),
      notes: s.notifications.filter((n) => n.uid === who),
      issues: me.staff ? s.issues : [],
      audit: me.staff ? s.audit : [],
    };
  },
  async command(d) {
    if (d.action === "media") {
      const s = readState();
      auctionCore.check(
        identity(s).staff && (!s.lots[d.id] || s.lots[d.id].status === "draft"),
        "المرفقات للمسودات فقط",
      );
      await localMedia(
        d.id + "/" + d.file,
        "data:" + d.mime + ";base64," + d.bytes,
      );
      return;
    }
    await mutateDemo((s) => execute(s, identity(s), d));
  },
  async media(id, file) {
    return (
      (await localMedia(id + "/" + file)) || readState().media[id + "/" + file]
    );
  },
  async history(id) {
    return readState()
      .audit.filter((e) => e.id === id && e.action === "bid")
      .reverse();
  },
};
