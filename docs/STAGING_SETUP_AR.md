# سوقنا SOUQNA — تشغيل مشروع Firebase التجريبي على Windows 11

الحالة: **دليل تجهيز فقط، ليس دليلاً على إنشاء مشروع خارجي أو نشره**.

## الهدف والحدود

نريد مشروع Firebase **مستقلاً تماماً** للتجربة، باسم اختياري فريد مثل `souqna-staging-2026-xxxx` (استبدل xxxx بقيمة فريدة). **معرّف المشروع الفعلي يجب أن تختاره أنت وتتحقق من أنه متاح؛ لا تفترض وجود هذا المثال.**

الإنتاج الحالي المشار إليه في كود التطبيق: `souqna-sweida`. ممنوع استخدامه لعمليات الاختبار أو نشر الدوال.

## المسار الأول — تطبيق Firebase المتصل في ChatGPT

يمكن توصيل إضافة Firebase الرسمية إلى ChatGPT ومراجعة صلاحيات الوصول، ثم إنشاء مشروع اختبار وتطبيق Web منفصل من خلالها، إذا كانت أوامر الحساب تسمح بذلك. تثبيت الإضافة أو توصيلها **قرار يتخذه صاحب الحساب بنفسه**. لا تربط أي حساب يتضمن أموال العملاء أو تمنح صلاحيات مالية غير لازمة.

## المسار الثاني — تنفيذ خطوات المشروع من جهاز Windows

افتح Terminal في Windows (PowerShell) داخل مستودع `souqna`. ثبّت Node.js 22 واتبع التعليمات الرسمية لبرنامج Firebase CLI. هذا المستودع يتضمن حزمة `firebase-tools` مثبتة كاعتماد تطوير.

تحقق أولاً من الحساب المخوّل:

~~~powershell
npm install --no-audit --no-fund
npx firebase login
npx firebase projects:list
~~~

اختر معرّف مشروع فريداً جديداً ثم أنشئ المشروع، وتأكد من ظهور الاسم في حسابك. المثال التالي يحتاج تغيير `YOUR_UNIQUE_STAGING_PROJECT_ID` إلى الاسم الذي اخترته:

~~~powershell
npx firebase projects:create YOUR_UNIQUE_STAGING_PROJECT_ID --display-name "SOUQNA Staging"
npx firebase projects:list
~~~

بعد إنشاء المشروع سجّل تطبيق Web تجريبياً:

~~~powershell
npx firebase apps:create WEB "SOUQNA Staging Web" --project YOUR_UNIQUE_STAGING_PROJECT_ID
npx firebase apps:list --project YOUR_UNIQUE_STAGING_PROJECT_ID
~~~

استخدم **معرّف تطبيق الويب** الذي أعادته `apps:list`، وليس معرّف المشروع أو أي تطبيق إنتاج:

~~~powershell
npx firebase apps:sdkconfig WEB YOUR_STAGING_FIREBASE_WEB_APP_ID --project YOUR_UNIQUE_STAGING_PROJECT_ID
~~~

انسخ قيم Web SDK الست إلى ملف محلي باسم `firebase.staging.json` بجذر المستودع. احرص على استعمال بيانات المشروع التجريبي فقط: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. إذا لم يُنشأ Storage bucket في مشروع الاختبار، فراجع إعدادات Firebase Console ولا تنسخ بيانات الإنتاج للتعويض.

## إعداد Firebase تلقائياً من حساب Google Cloud الموجود (بدون الحافظة أو Notepad)

إذا أصبح `firebase.staging.json` فارغاً أو معطوباً، **لا تُعد كتابته يدوياً**. يوجد أمر جديد يستخرج بيانات Web App المسجلة من **Firebase Management API للقراءة فقط**، ويتحقق من تطابق معرّف المشروع وApp ID وauthDomain وstorageBucket، ثم يحفظ ملف JSON محلياً، ويبني حزمة Staging ويشغّل فحص preflight:

~~~powershell
cd "$HOME\souqna"
git pull --ff-only origin feature/news-media-2026-11-16
node scripts/auto-staging-setup.mjs
~~~

لا يلزم نسخ أي شيء من صفحة Firebase إلى الحافظة. تستخدم الأداة تسجيل الدخول السابق عبر `gcloud.cmd auth application-default login` وملف `%APPDATA%\gcloud\application_default_credentials.json` **على جهاز المستخدم فقط**. لا تطبع مفتاح API أو رمز الدخول إلى شاشة الأوامر، ولا ترفع ملف بيانات الاتصال إلى GitHub. لا تكتب شيئاً إلى Firebase؛ فقط تقرأ Web App وتحفظ إعدادات محلية وتنشئ `dist/` بعد التحقق.

إذا ظهر `Firebase Management API HTTP 403`، تأكد أن حساب Google المستخدَم يملك صلاحية قراءة إعدادات `souqna-staging`. قد يلزم ضبط مشروع حصة استخدام بيانات الدخول محلياً:

~~~powershell
gcloud.cmd auth application-default set-quota-project souqna-staging
node scripts/auto-staging-setup.mjs
~~~

هذا الأمر لا يفعل فوترة، ولا ينشئ مشاريع أو تطبيقات أو مفاتيح. إذا فشل، أرسل **نص الخطأ فقط**، ولا تنسخ بيانات الدخول أو مفاتيح Service Account. لا تستخدم `souqna-sweida`. إذا تعددت تطبيقات Web ولم يوجد اسم `SOUQNA Staging Web` واضح، ستتوقف الأداة لتجنب بناء نسخة لتطبيق خاطئ.

**علامة النجاح**:
`SOUQNA STAGING AUTO SETUP SUCCESS. No deployment or paid service enabled.`

## تأسيس البيانات التجريبية الأساسية

أُضيف سكربت آمن باسم `scripts/seed-staging.mjs` لتجهيز 24 مستنداً أساسياً تشمل: 8 أقسام للإعلانات، 4 باقات للمتاجر، 5 باقات تمييز، إعدادات الموقع والتواصل، و5 خدمات رقمية. لا ينشئ حسابات أشخاص أو أرصدة أو إيصالات دفع أو معلومات تماس حقيقية.

للاستعراض فقط (لا يتصل بـ Firebase ولا ينشئ شيئاً):

~~~powershell
npm run seed:staging -- --project YOUR_UNIQUE_STAGING_PROJECT_ID
~~~

بعد تأكيد إعداد مشروع تجريبي منفصل ووجود صلاحيات Google Application Default Credentials لمشروع الاختبار، يمكن تشغيل الكتابة **بإذن المالك الصريح فقط**:

~~~powershell
npm run seed:staging -- --project YOUR_UNIQUE_STAGING_PROJECT_ID --execute --confirm SEED:YOUR_UNIQUE_STAGING_PROJECT_ID
~~~

لن يسمح السكربت باستخدام المشروع الحقيقي `souqna-sweida`، ولا ينفذ أي كتابة افتراضياً، ولا يغيّر المستندات الموجودة مسبقاً. عند التنفيذ يُنشئ الناقص فقط. **لم يُشغّل أمر التنفيذ على مشروع Firebase حقيقي.**

## إعداد المنتجات على Spark إن أمكن

من Firebase Console لمشروع التجربة وحده:

1. فعّل Authentication لطريقة Email/Password، مع استخدام حسابات تجريبية غير حقيقية.
2. أنشئ Firestore Database في منطقة تناسب السوق وتكلفة المشروع، ولا تنقل بيانات العملاء أو أي إيصالات أو أرقام هواتف حقيقية إليه.
3. لا تنشئ أو ترفع دالة مالية فعلياً قبل الموافقة على خطة Blaze والفوترة. دالتا `souqnaFinance` و`souqnaMarketplace` ضروريتان لاعتماد النجوم/البنرات وإنشاء المتاجر والإعلانات مع حصص حقيقية؛ اختبارات Functions الحالية تعمل محلياً في المحاكيات.
4. استخدم بيانات بذور وهمية للاختبار فقط مع قواعد Firestore الآمنة. لا تفتح قواعد القاعدة بـ `allow read, write: if true`.
5. لا تعيّن دور `admin` من الواجهة العامة؛ تعيين الدور يجب أن يكون من مسار مسؤول موثوق، وبمستخدم تجريبي معلوم.

**قد تؤثر حدود Spark وتوافر المنتجات بحسب المنطقة على الخدمات المتاحة؛ راجع صفحة التسعير الرسمية قبل أي عملية تؤدي إلى فوترة.**

## تعيين مدير الاختبار الأول

يجب أن يسجل مالك المشروع أولاً حساب مستخدم **تجريبياً** في Firebase Authentication داخل مشروع Staging، مع ملفه في `users/{uid}` في Firestore. لا يمكن لأي زائر منح نفسه صلاحيات الإدارة.

تم تجهيز أداة تحكم موثوقة `functions/bootstrap-staging-admin.cjs` تعمل **افتراضياً في وضع المعاينة فقط** وتحتاج صلاحيات مشروع Firebase التجريبي عند التنفيذ. لا تربطها أبداً بمشروع الإنتاج.

استعراض الدور الذي ستُنشئه الأداة، من دون اتصال أو تعديل:

~~~powershell
node functions/bootstrap-staging-admin.cjs --project YOUR_UNIQUE_STAGING_PROJECT_ID --email TEST_ADMIN_EMAIL
~~~

بعد التأكد من هوية الحساب، وتوفر صلاحيات Google Application Default Credentials للمشروع التجريبي، والحصول على موافقة المالك الصريحة، يمكن تنفيذ التعيين:

~~~powershell
node functions/bootstrap-staging-admin.cjs --project YOUR_UNIQUE_STAGING_PROJECT_ID --email TEST_ADMIN_EMAIL --execute --confirm "ADMIN:YOUR_UNIQUE_STAGING_PROJECT_ID:TEST_ADMIN_EMAIL"
~~~

عند التنفيذ تتحقق الأداة من أن البريد موجود في Firebase Auth وأن ملف Firestore يطابقه، وتسجل تغيير الدور في `bootstrapAudits` من خلال Admin SDK. وترفض أي تنفيذ على `souqna-sweida`. **لم تُنفذ الأداة على مشروع حقيقي.**

## بديل موثق لإنشاء المدير إذا رفض Google Identity Toolkit بيانات gcloud

قد يفشل استدعاء Firebase Admin Authentication من الكمبيوتر باستخدام بيانات دخول `gcloud auth application-default login` برسالة `Identity Toolkit API has not been used in project gen-lang-client-...`. هذه الرسالة **لا تعني أن Firebase للمشروع التجريبي غير فعال**، ولا تعالجها بتفعيل API في مشروع `gen-lang-client-...` الذي لا يخص سوقنا. تشير وثائق Firebase إلى قيود استخدام بيانات Google Cloud SDK للمستخدم النهائي مع Firebase Authentication.

إذا نجح اتصال Firestore سابقاً، يتيح السكربت مسار `--uid` إضافياً يُحدّث ملف Firestore بعد تحقق المالك **يدوياً** من هوية المستخدم في Firebase Console. هذه الطريقة لا تستطيع استعلام Firebase Authentication آلياً، لذا تحقق قبل التنفيذ من:

1. فتح **Firebase Console → SOUQNA Staging (souqna-staging) → Authentication → Users** ونسخ `User UID` من صف حساب المدير نفسه، مع مطابقة بريده.
2. فتح **Firestore → Data → users → UID نفسه** والتأكد من أن `email` يطابق البريد نفسه حرفياً وأن `role` تساوي `user`. لا تستخدم Auto-ID ولا ملف مستخدم آخر.
3. تجنب إرسال كلمة المرور أو الرموز أو ملف بيانات اعتماد Google.

من داخل `C:\Users\Administrator\souqna` في PowerShell (غيّر البريد وUID إلى القيم الفعلية لحساب الاختبار):

~~~powershell
$email = "YOUR_STAGING_ADMIN_EMAIL"
$uid = "EXACT_AUTH_USER_UID"
node functions/bootstrap-staging-admin.cjs --project souqna-staging --email $email --uid $uid
~~~

هذا الأمر **Dry Run فقط**. بعد التحقق يدوياً من كلتا الشاشتين، يأذن صاحب الحساب لتعيين الدور باستخدام رمز تأكيد يربط المشروع والبريد والـUID معاً:

~~~powershell
$confirmation = "ADMIN:souqna-staging:{0}:{1}" -f $email,$uid
node functions/bootstrap-staging-admin.cjs --project souqna-staging --email $email --uid $uid --verified-in-console --execute --confirm $confirmation
~~~

**هذا الأمر يعدل صلاحيات المدير في بيئة Staging فعلياً؛ لا تنفّذه إذا لم تتحقق من UID والبريد بنفسك.** يرفض السكربت أي مشروع بخلاف `souqna-staging` في هذا المسار، ويرفض غياب رمز التأكيد أو `--verified-in-console`، ويتحقق أن مستند `users/{uid}` يطابق البريد والدور المتوقع، ويكتب `bootstrapAudits` في معاملة واحدة. لا ينشر Hosting أو Cloud Functions ولا يعدل `souqna-sweida`.

إذا فشل، **لا تجرّب منح دور admin بحذف قواعد Firestore أو تفعيل وصول عام**. راجع رسالة الخطأ أولاً.

## بناء واختبار نسخة Staging (من دون نشر)

بعد إنشاء ملف الإعداد التجريبي:

~~~powershell
npm run test:release
npm run build:staging -- .\firebase.staging.json
npm run preflight:staging -- YOUR_UNIQUE_STAGING_PROJECT_ID
~~~

`test:release` يولّد حزمة Preview غير متصلة؛ لذلك يجب تنفيذ `build:staging` بعده لإنتاج حزمة التجربة الصحيحة. ملف `firebase.staging.json` و`dist/` مستثنيان من Git بواسطة `.gitignore`.

يجب أن تظهر عبارة **بيئة اختبار سوقنا** على نسخة Staging، وأن تحمل وسم `noindex`. لا يستخدم أيٌّ من هذه الأوامر اتصالاً بخادم Firebase لإنشاء الحساب أو رفع الموقع.

## النشر (خارج نطاق هذا التجهيز)

**لا تنفذ الأمر التالي دون موافقة مستقلة وتأكيد مشروع الاختبار وحالة Firestore/Functions**. يمكن بعد ذلك، عند توفر التصريح والبيئة المناسبة، مراجعة أمر الاستضافة المُقيّد:

~~~powershell
npx firebase deploy --project YOUR_UNIQUE_STAGING_PROJECT_ID --only hosting
~~~

`--project` ضروري دائماً، وأوامر `npm run preflight:staging` ليست بديلاً عن مراجعة هوية الحساب وصلاحياته. نشر Cloud Functions يحتاج Blaze، وقد ينتج عنه تكاليف حتى مع وجود حدود مجانية. التزم بمحاكيات Firebase للعمليات المالية إلى حين اعتماد الفوترة.

## بوابة الجاهزية

- [ ] تم إنشاء مشروع Firebase مستقل في الحساب الصحيح والتحقق من معرّفه.
- [ ] تم تسجيل تطبيق Web جديد وأُخذت بياناته الست الأصلية.
- [ ] تم إعداد Auth وFirestore لبيانات اختبار فقط.
- [ ] نجحت اختبارات CI والاختبارات المحلية.
- [ ] نجح `build:staging` و`preflight:staging` بمعرّف التجربة الحقيقي.
- [ ] تم الحصول على إذن منفصل لأي نشر أو تغيير فوترة.
- [ ] تم اختبار الموقع بعد النشر التجريبي قبل دمج PR في `main`.

## مصادر رسمية

- https://firebase.google.com/docs/cli
- https://firebase.google.com/docs/projects/learn-more
- https://firebase.google.com/docs/functions/faq-and-troubleshooting
