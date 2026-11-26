"use strict";
const categories = [
  "سيارات",
  "عقارات",
  "أجهزة كهربائية",
  "هواتف",
  "معدات",
  "أثاث",
];
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function amount(n, min = 0) {
  check(
    Number.isSafeInteger(n) && n >= min && n <= 1e12,
    "قيمة مالية غير صالحة",
  );
  return n;
}
function safeId(s) {
  check(
    typeof s === "string" &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(s) &&
      !Object.hasOwn(Object.prototype, s),
    "معرف غير صالح",
  );
  return s;
}
function label(s, max) {
  check(
    typeof s === "string" && s.trim().length && s.length <= max,
    "النص مطلوب أو يتجاوز الحد",
  );
  return s.trim();
}
function link(s) {
  const u = new URL(s);
  check(
    u.protocol === "https:" && !u.username && !u.password && s.length < 1500,
    "رابط HTTPS مطلوب",
  );
  return u.href;
}
function draft(d, cats) {
  check(
    cats.includes(d.category) && ["USD", "SYP"].includes(d.currency),
    "راجع التصنيف والعملة",
  );
  check(
    Number.isSafeInteger(d.start) &&
      Number.isSafeInteger(d.end) &&
      d.end > d.start,
    "راجع وقت الافتتاح والإغلاق",
  );
  check(
    Array.isArray(d.photos) &&
      d.photos.length <= 30 &&
      Array.isArray(d.videos) &&
      d.videos.length <= 5,
    "الحد 30 صورة و5 فيديوهات",
  );
  return {
    title: label(d.title, 120),
    description: label(d.description, 2000),
    seller: safeId(d.seller),
    category: d.category,
    currency: d.currency,
    start: d.start,
    end: d.end,
    opening: amount(d.opening, 1),
    reserve: amount(d.reserve),
    step: amount(d.step, 1),
    deposit: amount(d.deposit, 1),
    fee: amount(d.fee),
    commission: amount(d.commission),
    photos: d.photos.map(safeId),
    videos: d.videos.map(link),
    pdf: d.pdf ? safeId(d.pdf) : "",
    spin: !!d.spin,
    stream: d.stream ? link(d.stream) : "",
  };
}
function init(d) {
  check(d.commission <= 100, "العمولة تتجاوز 100٪");
  return {
    ...d,
    status: "draft",
    price: d.opening,
    leader: "",
    entries: [],
    count: 0,
    confirmations: [],
  };
}
function view(a) {
  const { entries, reserve, leader, seller, confirmations, ...pub } = a;
  return { ...pub, reserveMet: a.count > 0 && a.price >= reserve };
}
// Each entry carries a private maximum. Stable ordering gives equal maxima to the earlier offer.
function apply(a, actor, cmd, now) {
  const movements = [],
    events = [],
    uid = safeId(actor.uid);
  function move(user, available, held, type, pledged = 0) {
    movements.push({
      uid: user,
      available,
      held,
      pledged,
      type,
      currency: a.currency,
    });
  }
  const coverage = (price) => Math.max(0, price - a.deposit);
  if (cmd.action === "publish") {
    check(
      actor.staff && a.status === "draft" && a.end > now,
      "تعذر نشر المزاد",
    );
    if (a.fee) move(a.seller, -a.fee, 0, "listing");
    a.status = "published";
  } else if (cmd.action === "bid") {
    check(
      actor.verified && !actor.staff && uid !== a.seller,
      "تتطلب المزايدة حساباً موثقاً مستقلاً عن البائع والإدارة",
    );
    check(
      a.status === "published" && now >= a.start && now < a.end,
      "المزاد خارج وقت المزايدة",
    );
    const limit = amount(cmd.amount, 1),
      entry = a.entries.find((e) => e.uid === uid);
    check(["manual", "auto"].includes(cmd.mode), "نوع المزايدة غير صالح");
    check(
      limit >= (a.count ? a.price + a.step : a.opening) &&
        (!entry || limit > entry.max),
      "المبلغ أقل من المزايدة المطلوبة",
    );
    check(
      !entry || now - entry.time >= 1500,
      "انتظر قليلاً قبل المزايدة التالية",
    );
    check(uid !== a.leader || cmd.mode === "auto", "أنت صاحب أعلى عرض");
    if (!entry) {
      check(a.entries.length < 40, "اكتمل عدد المشاركين في المزاد التجريبي");
      move(uid, -a.deposit, a.deposit, "hold", coverage(limit));
    } else move(uid, 0, 0, "limit", coverage(limit) - coverage(entry.max));
    const previous = a.leader;
    a.entries = a.entries.filter((e) => e.uid !== uid);
    a.entries.push({ uid, max: limit, time: now, order: a.count + 1 });
    a.entries.sort((x, y) => y.max - x.max || x.order - y.order);
    const [first, second] = a.entries;
    const competitive = second
      ? Math.min(first.max, second.max + a.step)
      : a.opening;
    a.price = Math.max(
      a.price,
      competitive,
      Math.min(a.reserve, first.max),
      cmd.mode === "manual" ? limit : 0,
    );
    a.leader = first.uid;
    a.count++;
    if (a.end - now <= 30000) a.end += 60000;
    if (previous && previous !== a.leader)
      events.push({ uid: previous, text: "تجاوز مزايد آخر عرضك" });
    events.push({
      uid,
      text: a.leader === uid ? "عرضك في الصدارة" : "تجاوز عرض تلقائي مزايدتك",
    });
  } else if (cmd.action === "close") {
    check(
      actor.system && a.status === "published" && now >= a.end,
      "لم يحن موعد الإغلاق",
    );
    const sold = a.count > 0 && a.price >= a.reserve;
    a.status = sold ? "awarded" : "unsold";
    for (const e of a.entries) {
      if (!sold || e.uid !== a.leader)
        move(e.uid, a.deposit, -a.deposit, "release", -coverage(e.max));
      else move(e.uid, 0, 0, "limit", coverage(a.price) - coverage(e.max));
      events.push({
        uid: e.uid,
        text:
          sold && e.uid === a.leader
            ? "فزت بالمزاد"
            : "أغلق المزاد وأعيد تأمينك",
      });
    }
    events.push({
      uid: a.seller,
      text: sold ? "رسا المزاد بانتظار التسليم" : "انتهى المزاد دون بيع",
    });
  } else if (cmd.action === "confirm") {
    check(
      a.status === "awarded" &&
        [a.seller, a.leader].includes(uid) &&
        !a.confirmations.includes(uid),
      "لا يمكن تأكيد هذه العملية",
    );
    a.confirmations.push(uid);
    if (a.confirmations.length === 2) {
      const fee = Math.round((a.price * a.commission) / 100);
      move(
        a.leader,
        a.deposit - a.price,
        -a.deposit,
        "purchase",
        -coverage(a.price),
      );
      move(a.seller, a.price - fee, 0, "sale");
      movements[movements.length-1].commissionFee=fee;
      for(const party of [a.seller,a.leader]) events.push({uid:party,text:"اكتمل البيع وسُويت المحفظة الافتراضية"});
      a.status = "completed";
    }
  } else throw new Error("عملية غير معروفة");
  return { movements, events };
}
function wallet(old, m) {
  const next = {
    ...old,
    [m.currency]: {
      available: (old[m.currency]?.available || 0) + m.available,
      held: (old[m.currency]?.held || 0) + m.held,
      pledged: (old[m.currency]?.pledged || 0) + (m.pledged || 0),
    },
  };
  check(
    next[m.currency].available >= 0 &&
      next[m.currency].held >= 0 &&
      next[m.currency].pledged >= 0 &&
      next[m.currency].available >= next[m.currency].pledged,
    "الرصيد الافتراضي غير كافٍ",
  );
  return next;
}
const funds = () => ({
  USD: { available: 25000, held: 0 },
  SYP: { available: 100000000, held: 0 },
});
const auctionCore = {
  categories,
  draft,
  init,
  view,
  apply,
  wallet,
  funds,
  check,
  safeId,
  label,
};
if (typeof module !== "undefined") module.exports = auctionCore;
