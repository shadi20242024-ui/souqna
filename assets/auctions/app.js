const $ = (s) => document.querySelector(s),
  box = $("#screen"),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const money = (v, c) =>
  new Intl.NumberFormat("ar-SY").format(v) +
  " " +
  (c === "USD" ? "دولار" : "ل.س");
const date = (t) => new Date(t).toLocaleString("ar-SY"),
  dt = (t) =>
    new Date(t - new Date(t).getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
const status = (a) =>
  a.status === "published"
    ? Date.now() < a.start
      ? "قادم"
      : Date.now() >= a.end
        ? "بانتظار الإغلاق"
        : "مباشر"
    : {
        draft: "مسودة",
        unsold: "انتهى دون بيع",
        awarded: "بانتظار التسليم",
        completed: "مكتمل",
      }[a.status];
let data,
  page = "home",
  selected = "",
  filter = "الكل",
  cat = "",
  sound = false,
  lastNotice,
  loading = false;
const pic = (a) =>
  AUCTION_IMAGES[auctionCore.categories.indexOf(a.category)] ||
  AUCTION_IMAGES[0];
const btn = (name, action, id = "", gold = false) =>
  '<button class="' +
  (gold ? "gold" : "") +
  '" data-act="' +
  action +
  '" data-id="' +
  esc(id) +
  '">' +
  esc(name) +
  "</button>";
function toast(s) {
  $("#notice").textContent = s;
  clearTimeout(lastNotice);
  lastNotice = setTimeout(() => ($("#notice").textContent = ""), 5000);
}
function beep() {
  if (!sound) return;
  try {
    const c = new AudioContext(),
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = 740;
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0.065, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    o.start();
    o.stop(c.currentTime + 0.2);
    o.onended = () => c.close();
  } catch {}
}
const opts = (list, val) =>
  list
    .map(
      (x) =>
        "<option " + (x === val ? "selected" : "") + ">" + esc(x) + "</option>",
    )
    .join("");
const line = (s) => '<div class="line">' + s + "</div>";
function timer(t) {
  const n = Math.max(0, Math.ceil((t - Date.now()) / 1000));
  return [
    Math.floor(n / 86400) + " ي",
    String(Math.floor(n / 3600) % 24).padStart(2, "0"),
    String(Math.floor(n / 60) % 60).padStart(2, "0"),
    String(n % 60).padStart(2, "0"),
  ].join(" : ");
}
function clock(a) {
  if (a.status !== "published") return "";
  const t = Date.now() < a.start ? a.start : a.end;
  return (
    "<span> " +
    (t === a.start ? "يفتح خلال" : "يغلق خلال") +
    ' <b dir="ltr" data-time="' +
    t +
    '">' +
    timer(t) +
    "</b></span>"
  );
}
function home() {
  const pub = data.lots.filter((a) => a.status !== "draft"),
    list = pub.filter(
      (a) =>
        (!cat || a.category === cat) &&
        (filter === "الكل" ||
          filter === status(a) ||
          (filter === "الأرشيف" && a.status !== "published")),
    );
  box.innerHTML =
    '<section class="hero"><small>SOUQNA AUCTIONS</small><h1>مزادات السويداء</h1><p>تصفّح المعروض، راجع تقرير الفحص وتابع السعر حتى إغلاق المزاد.</p></section><div class="row"><h2>قاعة المزادات</h2><span>' +
    pub.length +
    ' مزادات</span></div><div class="tools"><div class="tabs">' +
    ["الكل", "مباشر", "قادم", "الأرشيف"]
      .map(
        (x) =>
          '<button data-filter="' +
          x +
          '" class="' +
          (filter === x ? "active" : "") +
          '">' +
          x +
          "</button>",
      )
      .join("") +
    '</div><select aria-label="تصفية حسب التصنيف" id="category"><option value="">جميع التصنيفات</option>' +
    opts(data.cats, cat) +
    '</select></div><div class="grid">' +
    (list
      .map(
        (a) =>
          '<article class="card"><img data-cover="' +
          esc(a.id) +
          '" src="' +
          pic(a) +
          '" alt="' +
          esc(a.category) +
          '"><div class="row"><small><img class="category-mark" src="' +
          (AUCTION_ICONS[auctionCore.categories.indexOf(a.category)] ||
            AUCTION_ICONS[0]) +
          '" alt=""> ' +
          esc(a.category) +
          '</small><b class="tag">' +
          status(a) +
          "</b></div><h3>" +
          esc(a.title) +
          '</h3><span class="money">' +
          money(a.price, a.currency) +
          "</span><div>" +
          clock(a) +
          "</div>" +
          btn("عرض المزاد", "detail", a.id, true) +
          "</article>",
      )
      .join("") || "<p>لا توجد مزادات بهذه المواصفات.</p>") +
    "</div>";
  $("#category").onchange = (e) => {
    cat = e.target.value;
    home();
  };
  for (const img of box.querySelectorAll("[data-cover]")) {
    const a = list.find((l) => l.id === img.dataset.cover);
    if (a.photos.length)
      service
        .media(a.id, a.photos[0])
        .then((src) => {
          if (src) img.src = src;
        })
        .catch(() => {});
  }
}
async function detail() {
  const a = data.lots.find((l) => l.id === selected);
  if (!a) {
    page = "home";
    return home();
  }
  const me = data.me,
    guest = me.uid === "guest",
    live = status(a) === "مباشر";
  const position = service.demo
    ? {
        party: [a.seller, a.leader].includes(me.uid),
        leading: a.leader === me.uid,
        confirmed: a.confirmations.includes(me.uid),
      }
    : guest
      ? {}
      : await service.command({ action: "position", id: a.id });
  const history = await service.history(a.id);
  box.innerHTML =
    btn("عودة إلى المزادات", "home") +
    '<div class="tools"><div><small>' +
    esc(a.category) +
    " · " +
    status(a) +
    "</small><h2>" +
    esc(a.title) +
    "</h2></div>" +
    clock(a) +
    '</div><div class="pair"><section class="panel"><img class="photo" id="mainphoto" alt="صورة المعروض"><div class="thumbs" id="thumbs"></div><p>' +
    esc(a.description) +
    '</p><div id="attachments"></div></section><section class="panel"><small>السعر الحالي</small><h2 class="money">' +
    money(a.price, a.currency) +
    "</h2>" +
    line("سعر البداية " + money(a.opening, a.currency)) +
    line("الزيادة الدنيا " + money(a.step, a.currency)) +
    line("تأمين المشاركة " + money(a.deposit, a.currency)) +
    "<small>تُحجز أيضاً تغطية من الرصيد لسقف عرضك حتى الإغلاق.</small>" +
    line("الافتتاح " + date(a.start)) +
    line("الإغلاق " + date(a.end)) +
    line("عدد المزايدات " + a.count) +
    (position.leading ? '<p class="tag">عرضك في الصدارة</p>' : "") +
    (guest
      ? "<p>تصفّح كزائر. للمشاركة اختر حساب مشتري تجريبي أو سجل الدخول من سوقنا.</p>"
      : live && !me.staff
        ? '<form id="bidform"><div class="fields"><label>نوع المزايدة<select name="mode"><option value="manual">مباشرة</option><option value="auto">تلقائية بحد أقصى سري</option></select></label><label>المبلغ (' +
          a.currency +
          ')<input name="amount" type="number" required step="1" min="' +
          (a.count ? a.price + a.step : a.opening) +
          '" value="' +
          (a.count ? a.price + a.step : a.opening) +
          '"></label></div><button class="gold">تأكيد المزايدة</button></form>'
        : "") +
    (a.status === "awarded" && position.party && !position.confirmed
      ? btn("تأكيد البيع أو الاستلام", "confirm", a.id, true)
      : "") +
    (a.status === "draft" && me.staff
      ? btn("نشر المزاد", "publish", a.id, true)
      : "") +
    '</section></div><section class="panel"><h3>سجل المزايدات</h3>' +
    (history
      .map((h) => line(date(h.time) + " · " + money(h.price, a.currency)))
      .join("") || "بانتظار أول عرض") +
    "</section>" +
    (!guest
      ? '<details><summary>تقديم شكوى</summary><form id="dispute"><label>تفاصيل الشكوى<textarea required name="text" maxlength="800"></textarea></label><button>إرسال الشكوى</button></form></details>'
      : "");
  const photos = a.photos.length
    ? await Promise.all(a.photos.map((f) => service.media(a.id, f)))
    : [pic(a)];
  if (page !== "detail" || selected !== a.id || !$("#mainphoto")) return;
  const image = $("#mainphoto");
  image.src = photos[0];
  image.onclick = () => {
    $("#zoom img").src = image.src;
    $("#zoom").showModal();
  };
  for (const [i, p] of photos.entries()) {
    if (photos.length === 1) break;
    const b = document.createElement("button"),
      im = new Image();
    im.src = p;
    im.alt = "الصورة " + (i + 1);
    b.append(im);
    b.onclick = () => (image.src = p);
    $("#thumbs").append(b);
  }
  if (a.spin && photos.length > 1) {
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = photos.length - 1;
    slider.value = 0;
    slider.setAttribute("aria-label", "تدوير المعروض 360 درجة");
    slider.oninput = () => (image.src = photos[slider.value]);
    $("#thumbs").after(slider);
  }
  const attach = $("#attachments");
  for (const [i, url] of [
    ...a.videos,
    ...(a.stream ? [a.stream] : []),
  ].entries()) {
    const l = document.createElement("a");
    l.href = url;
    l.target = "_blank";
    l.rel = "noopener noreferrer";
    l.textContent = url === a.stream ? "فتح البث المباشر" : "فيديو " + (i + 1);
    attach.append(l, " · ");
  }
  if (a.pdf) {
    const b = document.createElement("button");
    b.textContent = "تنزيل تقرير الفحص PDF";
    b.onclick = async () =>
      download(
        "inspection.pdf",
        await (await fetch(await service.media(a.id, a.pdf))).blob(),
      );
    attach.append(b);
  }
}
const input = (name, title, value = "", type = "text", extra = "") =>
  "<label>" +
  title +
  '<input name="' +
  name +
  '" type="' +
  type +
  '" value="' +
  esc(value) +
  '" ' +
  extra +
  " required></label>";
function editor(id) {
  const a = data.lots.find((l) => l.id === id) || {},
    now = Date.now();
  selected = id || "lot-" + crypto.randomUUID();
  page = "editor";
  box.innerHTML =
    '<div class="row"><h2>تحرير مسودة</h2>' +
    btn("مكتب المزادات", "office") +
    '</div><form id="edit" class="panel"><div class="fields">' +
    input("title", "اسم المعروض", a.title, "text", 'maxlength="120"') +
    input(
      "seller",
      "معرّف حساب البائع",
      a.seller || (service.demo ? "seller" : ""),
    ) +
    '<label>التصنيف<select name="category">' +
    opts(data.cats, a.category) +
    '</select></label><label>عملة الاختبار<select name="currency">' +
    opts(["USD", "SYP"], a.currency) +
    "</select></label>" +
    input(
      "start",
      "الافتتاح بالتوقيت المحلي",
      dt(a.start || now),
      "datetime-local",
    ) +
    input(
      "end",
      "الإغلاق بالتوقيت المحلي",
      dt(a.end || now + 3600000),
      "datetime-local",
    ) +
    [
      ["opening", "سعر البداية", 1],
      ["reserve", "السعر الاحتياطي", 0],
      ["step", "الزيادة الدنيا", 1],
      ["deposit", "تأمين المشاركة", 1],
      ["fee", "رسم النشر", 0],
      ["commission", "عمولة البيع ٪", 0],
    ]
      .map(([k, n, v]) => input(k, n, a[k] ?? v, "number", 'min="0" step="1"'))
      .join("") +
    '</div><label>وصف المنتج<textarea name="description" maxlength="2000" required>' +
    esc(a.description) +
    '</textarea></label><p>تُضاف الصور الجديدة بعد الصور المحتفظ بها، حسب ترتيب الملفات.</p><div id="retained">' +
    (a.photos || [])
      .map(
        (p, i) =>
          '<label><span><input type="checkbox" name="keep" checked value="' +
          esc(p) +
          '"> الاحتفاظ بالصورة ' +
          (i + 1) +
          "</span></label>",
      )
      .join("") +
    '</div><div class="fields"><label>صور المنتج حتى 30<input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp"></label><label>تقرير فحص حتى 640 كيلوبايت<input type="file" name="pdf" accept="application/pdf"></label></div>' +
    (a.pdf
      ? '<label><span><input type="checkbox" name="keepPdf" checked> الاحتفاظ بالتقرير الحالي</span></label>'
      : "") +
    '<label><span><input type="checkbox" name="spin" ' +
    (a.spin ? "checked" : "") +
    '> الصور مرتبة لدوران 360 درجة</span></label><label>روابط الفيديو، كل رابط في سطر (حتى 5)<textarea name="videos">' +
    esc((a.videos || []).join("\n")) +
    '</textarea></label><label>رابط البث المباشر<input type="url" name="stream" value="' +
    esc(a.stream) +
    '"></label><button class="gold">حفظ ومعاينة المسودة</button></form>';
}
function office() {
  if (!data.me.staff) {
    page = "home";
    return home();
  }
  box.innerHTML =
    '<div class="row"><h2>مكتب مشرف المزادات</h2>' +
    btn("إضافة معروض", "new", "", true) +
    '</div><section class="panel"><h3>المنتجات والمواعيد</h3>' +
    data.lots
      .map((a) =>
        line(
          "<b>" +
            esc(a.title) +
            "</b> · " +
            status(a) +
            " " +
            btn("معاينة", "detail", a.id) +
            (a.status === "draft" ? btn("تعديل", "edit", a.id) : ""),
        ),
      )
      .join("") +
    '</section><section class="panel"><h3>الشكاوى والنزاعات</h3>' +
    (data.issues
      .map((i) =>
        line(
          esc(i.text) +
            " · " +
            esc(i.status === "open" ? "مفتوحة" : "محلولة") +
            " " +
            esc(i.resolution || "") +
            (i.status === "open"
              ? '<form data-issue="' +
                esc(i.id) +
                '" data-target="' +
                esc(i.uid) +
                '"><input name="text" aria-label="قرار الشكوى" required><button>حفظ القرار</button></form>'
              : ""),
        ),
      )
      .join("") || "لا توجد شكاوى") +
    '</section><section class="panel"><h3>تقارير العمليات والحركات المالية</h3>' +
    btn("تنزيل Excel", "excel") +
    btn("طباعة / حفظ PDF", "pdf") +
    '<div class="report">' +
    table() +
    "</div></section>" +
    (data.me.admin
      ? '<section class="panel"><h3>إعدادات المدير العام</h3><form id="addcat">' +
        input("name", "تصنيف جديد") +
        '<button>إضافة التصنيف</button></form><form id="assign">' +
        input("target", "معرّف الموظف", service.demo ? "agent" : "") +
        '<select name="enabled"><option value="yes">تعيين مشرف</option><option value="no">إنهاء التكليف</option></select><button>حفظ التكليف</button></form></section>'
      : "");
}
const actionNames = {
  bid: "مزايدة",
  hold: "حجز",
  limit: "تعديل تغطية العرض",
  release: "رد التأمين",
  sale: "بيع",
  purchase: "شراء",
  listing: "رسوم نشر",
  demo_credit: "رصيد افتراضي",
  category: "تصنيف",
  assign: "تكليف",
  save: "حفظ",
  media: "مرفق",
  publish: "نشر",
  close: "إغلاق",
  confirm: "تأكيد",
  enroll: "تفعيل",
  dispute: "شكوى",
  resolve: "حل شكوى",
};
function report() {
  return [
    [
      "التاريخ",
      "المزاد",
      "الحساب",
      "العملية",
      "الحركة",
      "العملة",
      "تغير المتاح",
      "تغير المحجوز",
      "تغير تغطية العروض",
      "عمولة البيع",
    ],
    ...data.audit
      .slice()
      .sort((a, b) => a.time - b.time)
      .flatMap((e) =>
        (e.movements.length ? e.movements : [{}]).map((m) => [
          date(e.time),
          e.id,
          m.uid || e.uid,
          actionNames[e.action] || e.action,
          actionNames[m.type] || "",
          m.currency || "",
          m.available ?? "",
          m.held ?? "",
          m.pledged ?? "",
          m.commissionFee ?? "",
        ]),
      ),
  ];
}
function inventory() {
  return [
    [
      "المزاد",
      "التصنيف",
      "الحالة",
      "وقت الافتتاح",
      "وقت الإغلاق",
      "العملة",
      "السعر",
      "العروض",
      "التأمين",
      "رسم النشر",
      "العمولة ٪",
    ],
    ...data.lots.map((a) => [
      a.title,
      a.category,
      status(a),
      date(a.start),
      date(a.end),
      a.currency,
      a.price,
      a.count,
      a.deposit,
      a.fee,
      a.commission,
    ]),
  ];
}
function table(rows = report()) {
  return (
    "<table>" +
    rows
      .map(
        (row) =>
          "<tr>" + row.map((v) => "<td>" + esc(v) + "</td>").join("") + "</tr>",
      )
      .join("") +
    "</table>"
  );
}
function download(name, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}
function excel() {
  const files = {},
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    rels = "http://schemas.openxmlformats.org/package/2006/relationships",
    office =
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const add = (path, xml) =>
    (files[path] = fflate.strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' + xml,
    ));
  const sheets = [
    ["الحركات المالية", report()],
    ["إدارة المزادات", inventory()],
  ];
  add(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets
        .map(
          (_, i) =>
            '<Override PartName="/xl/worksheets/sheet' +
            (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        )
        .join("") +
      "</Types>",
  );
  add(
    "_rels/.rels",
    '<Relationships xmlns="' +
      rels +
      '"><Relationship Id="rId1" Type="' +
      office +
      '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  add(
    "xl/workbook.xml",
    '<workbook xmlns="' +
      ns +
      '" xmlns:r="' +
      office +
      '"><sheets>' +
      sheets
        .map(
          ([title], i) =>
            '<sheet name="' +
            title +
            '" sheetId="' +
            (i + 1) +
            '" r:id="rId' +
            (i + 1) +
            '"/>',
        )
        .join("") +
      "</sheets></workbook>",
  );
  add(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="' +
      rels +
      '">' +
      sheets
        .map(
          (_, i) =>
            '<Relationship Id="rId' +
            (i + 1) +
            '" Type="' +
            office +
            '/worksheet" Target="worksheets/sheet' +
            (i + 1) +
            '.xml"/>',
        )
        .join("") +
      "</Relationships>",
  );
  sheets.forEach(([, rows], i) =>
    add(
      "xl/worksheets/sheet" + (i + 1) + ".xml",
      '<worksheet xmlns="' +
        ns +
        '"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>' +
        rows
          .map(
            (row, r) =>
              '<row r="' +
              (r + 1) +
              '">' +
              row
                .map(
                  (v, j) =>
                    '<c r="' +
                    String.fromCharCode(65 + j) +
                    (r + 1) +
                    '" ' +
                    (typeof v === "number"
                      ? 't="n"><v>' + v + "</v>"
                      : 't="inlineStr"><is><t>' +
                        esc(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") +
                        "</t></is>") +
                    "</c>",
                )
                .join("") +
              "</row>",
          )
          .join("") +
        "</sheetData></worksheet>",
    ),
  );
  download(
    "SOUQNA-Auctions.xlsx",
    new Blob([fflate.zipSync(files)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}
async function render() {
  data = await service.load();
  const me = data.me;
  $("#office").hidden = !me.staff;
  $("#environment").textContent = service.demo
    ? "تجربة محلية · رصيد افتراضي"
    : "سوقنا التجريبية · رصيد افتراضي";
  if (service.demo) {
    $("#identity").innerHTML =
      '<span>تجربة الدور</span><select id="person">' +
      Object.entries(accounts)
        .map(
          ([k, v]) =>
            '<option value="' +
            k +
            '" ' +
            (who === k ? "selected" : "") +
            ">" +
            v +
            "</option>",
        )
        .join("") +
      "</select>";
    $("#person").onchange = async (e) => {
      if(loading){e.target.value=who;return;}
      who = e.target.value;
      page = "home";
      await refresh();
    };
  } else
    $("#identity").innerHTML =
      me.uid === "guest"
        ? '<a href="../../index.html">الدخول من سوقنا</a>'
        : !me.verified
          ? btn("إرسال رابط توثيق البريد", "verify") +
            btn("تحقّق من التوثيق", "recheck")
          : !me.wallet
            ? btn("تفعيل محفظة افتراضية", "enroll")
            : "";
  if (me.wallet)
    $("#identity").insertAdjacentHTML(
      "beforeend",
      "<small>" +
        Object.entries(me.wallet)
          .map(
            ([c, b]) =>
              "متاح " +
              money(b.available - (b.pledged || 0), c) +
              " / تأمين " +
              money(b.held, c) +
              " / تغطية عروض " +
              money(b.pledged || 0, c),
          )
          .join(" · ") +
        "</small>",
    );
  if (data.notes.length)
    $("#identity").insertAdjacentHTML(
      "beforeend",
      "<details><summary>إشعاراتي (" +
        data.notes.length +
        ")</summary>" +
        data.notes
          .slice(-12)
          .map((n) => line(esc(n.text)))
          .join("") +
        "</details>",
    );
  $("#ticker").textContent =
    data.lots
      .filter((a) => status(a) === "قادم")
      .map((a) => "قريباً · " + a.title + " · " + date(a.start))
      .join("     |     ") || "لا توجد مزادات قادمة مجدولة";
  if (page === "office") office();
  else if (page === "detail") await detail();
  else if (page === "home") home();
}
async function refresh() {
  try {
    await render();
  } catch (e) {
    toast(e.message);
  }
}
async function saveMedia(file, id) {
  if (!file?.size) return "";
  let blob = file;
  if (file.type.startsWith("image/")) {
    const im = await createImageBitmap(file);
    const c = document.createElement("canvas"),
      ratio = Math.min(1, 1280 / Math.max(im.width, im.height));
    c.width = Math.round(im.width * ratio);
    c.height = Math.round(im.height * ratio);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    im.close();
    blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.78));
  }
  if (!blob || blob.size > 655360)
    throw Error("يتجاوز المرفق 640 كيلوبايت بعد المعالجة");
  const bytes = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  const key = "m" + crypto.randomUUID();
  await service.command({
    action: "media",
    id,
    file: key,
    mime: blob.type,
    bytes,
  });
  return key;
}
async function action(name, id) {
  if (name === "new" || name === "edit") return editor(id);
  if (name === "verify") {
    await service.verify();
    return toast("أرسل رابط التوثيق إلى بريد حسابك");
  }
  if (name === "recheck") {
    await service.recheck();
    return refresh();
  }
  if (name === "excel") return excel();
  if (name === "pdf") {
    $("#printout").innerHTML =
      "<h2>سوقنا · تقرير المزادات التجريبية</h2>" +
      table(inventory()) +
      table();
    return window.print();
  }
  if (["detail", "home", "office"].includes(name)) {
    page = name;
    selected = id;
  } else {
    await service.command({ action: name, id: id || "setup" });
    beep();
    toast("تم تسجيل العملية");
  }
  await refresh();
}
async function guard(fn) {
  if (loading) return;
  loading = true;
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  } finally {
    loading = false;
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act],[data-filter]");
  if (!el) return;
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    home();
  } else guard(() => action(el.dataset.act, el.dataset.id));
});
$("#home").onclick = () => guard(() => action("home", ""));
$("#office").onclick = () => guard(() => action("office", ""));
$("#sound").onclick = () => {
  sound = !sound;
  $("#sound").setAttribute("aria-pressed", sound);
  $("#sound").textContent = sound ? "الصوت مفعّل" : "الصوت مغلق";
  beep();
};
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target,
    form = new FormData(f),
    o = Object.fromEntries(form);
  guard(async () => {
    let cmd;
    if (f.id === "bidform")
      cmd = {
        action: "bid",
        id: selected,
        mode: o.mode,
        amount: Number(o.amount),
      };
    else if (f.id === "dispute")
      cmd = { action: "dispute", id: selected, text: o.text };
    else if (f.id === "assign")
      cmd = {
        action: "assign",
        id: "settings",
        target: o.target,
        enabled: o.enabled === "yes",
      };
    else if (f.id === "addcat")
      cmd = { action: "category", id: "settings", name: o.name };
    else if (f.dataset.issue)
      cmd = {
        action: "resolve",
        id: f.dataset.issue,
        target: f.dataset.target,
        text: o.text,
      };
    else if (f.id === "edit") {
      const photos = form.getAll("keep"),
        files = form.getAll("photos").filter((v) => v.size),
        videos = o.videos
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);
      if (photos.length + files.length > 30 || videos.length > 5)
        throw Error("الحد 30 صورة و5 روابط فيديو");
      const old = data.lots.find((l) => l.id === selected);
      const lot = {
        ...o,
        photos,
        videos,
        pdf: o.keepPdf ? old.pdf : "",
        spin: !!o.spin,
        start: new Date(o.start).getTime(),
        end: new Date(o.end).getTime(),
      };
      for (const k of [
        "opening",
        "reserve",
        "step",
        "deposit",
        "fee",
        "commission",
      ])
        lot[k] = Number(o[k]);
      const clean = auctionCore.draft(lot, data.cats);
      for (const [i,file] of files.entries()){
        toast("جارٍ حفظ الصورة "+(i+1)+" من "+files.length);
        clean.photos.push(await saveMedia(file, selected));
      }
      if (o.pdf.size) clean.pdf = await saveMedia(o.pdf, selected);
      cmd = { action: "save", id: selected, lot: clean };
    } else return;
    await service.command(cmd);
    if (cmd.action === "save") page = "detail";
    beep();
    toast("تم الحفظ");
    await refresh();
  });
});
document.documentElement.style.setProperty(
  "--hero",
  'url("' + AUCTION_IMAGES[0] + '")',
);
refresh();
let lastTick=Date.now();
setInterval(() => {
  document
    .querySelectorAll("[data-time]")
    .forEach((el) => (el.textContent = timer(+el.dataset.time)));
  if (
    data &&
    !loading &&
    page !== "editor" &&
    data.lots.some((a) => a.status === "published" && ((a.start>lastTick && a.start<=Date.now()) || (a.end<=Date.now() && (service.demo || a.end>lastTick))))
  )
    guard(refresh);
  if(!loading) lastTick=Date.now();
}, 1000);
window.addEventListener("storage", () => {
  if (page !== "editor" && !loading) refresh();
});
