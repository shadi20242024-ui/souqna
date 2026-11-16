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

## إعداد المنتجات على Spark إن أمكن

من Firebase Console لمشروع التجربة وحده:

1. فعّل Authentication لطريقة Email/Password، مع استخدام حسابات تجريبية غير حقيقية.
2. أنشئ Firestore Database في منطقة تناسب السوق وتكلفة المشروع، ولا تنقل بيانات العملاء أو أي إيصالات أو أرقام هواتف حقيقية إليه.
3. لا تنشئ أو ترفع دالة مالية فعلياً قبل الموافقة على خطة Blaze والفوترة. دالتا `souqnaFinance` و`souqnaMarketplace` ضروريتان لاعتماد النجوم/البنرات وإنشاء المتاجر والإعلانات مع حصص حقيقية؛ اختبارات Functions الحالية تعمل محلياً في المحاكيات.
4. استخدم بيانات بذور وهمية للاختبار فقط مع قواعد Firestore الآمنة. لا تفتح قواعد القاعدة بـ `allow read, write: if true`.
5. لا تعيّن دور `admin` من الواجهة العامة؛ تعيين الدور يجب أن يكون من مسار مسؤول موثوق، وبمستخدم تجريبي معلوم.

**قد تؤثر حدود Spark وتوافر المنتجات بحسب المنطقة على الخدمات المتاحة؛ راجع صفحة التسعير الرسمية قبل أي عملية تؤدي إلى فوترة.**

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
