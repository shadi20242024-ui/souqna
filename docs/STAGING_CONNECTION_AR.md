# حالة ربط SOUQNA Staging — 16 نوفمبر 2026

هذا التحديث يكمل تقرير STAGING_VERIFICATION_2026-11-16_AR.md ويحدّث حالة وجود المشروع.

## المؤكد الآن
- مشروع souqna-staging موجود فعلياً؛ ظهر في Firebase Console باسم SOUQNA Staging على خطة Spark المجانية.
- تطبيق Web مسجل، وبيانات SDK المعروضة في Console تطابق بيانات المالك.
- حُفظت البيانات في firebase.staging.json المحلي المستثنى من Git. لم تُنسخ إلى main ولم يُغيّر تهيئة الإنتاج في index.html.
- نجح build-hosting.mjs staging firebase.staging.json.
- نجح preflight-staging.mjs souqna-staging.
- نجحت اختبارات staging-build وhosting-output الأربعة محلياً.
- جُلبت صور المستودع الأصلية واكتمل البناء المحلي. العائق السابق المتعلق بعدم وجود الصور محلياً قد انتهى.

## لم يتم بعد
- لم يُختبر تسجيل دخول سحابي أو قراءة/كتابة Firestore.
- لا يوجد تأكيد بأن Email/Password مفعّل أو أن قاعدة Firestore أُنشئت.
- تعذر الضغط على أزرار Console بسبب خطأ coordinate input geometry is unavailable؛ القراءة متاحة، والتحكم غير عامل.
- لم تُنشر قواعد أو إعدادات Auth أو Hosting أو Functions، ولم تُفعّل الفوترة.
- لا يوجد رابط نسخة Staging منشورة جديدة.

## الإجراء التالي
داخل مشروع souqna-staging فقط:
1. إكمال شاشة تطبيق Web بالضغط على Continue to console.
2. فتح Authentication ثم Get started ثم Sign-in method وتفعيل Email/Password الأساسي.
3. فتح Firestore Database والتحقق أولاً من وجود قاعدة. إن لم توجد، اختيار المنطقة والنسخة المناسبة وإنشاؤها في وضع Production المقيد؛ لا تفتح القراءة والكتابة للعامة.
4. مراجعة قواعد المستودع والتحقق منها قبل تطبيقها. مراجعة الأمان السابقة ما زالت تتضمن نواقص موثقة.
5. اختبار Auth/Firestore بحسابات وبيانات تجريبية بعد توفر التحكم/الصلاحيات.
6. موافقة مستقلة قبل نشر التطبيق أو القواعد أو إعدادات الخدمات عبر CLI. تظل Cloud Functions في المحاكيات ما دامت الفوترة غير معتمدة.

ملف firebase.staging.config.json إعداد Firebase CLI منفصل، وليس ملف Web SDK المحلي. لا تستخدم مشروع souqna-sweida في أي خطوة اختبار.
