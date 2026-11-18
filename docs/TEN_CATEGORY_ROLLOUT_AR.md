# سوقنا | استكمال الأقسام العشرة قبل الإطلاق

هذه الملاحظات تخص الفرع `fix/admin-login-diagnostics-2026-11-18` وبيئة Firebase **`souqna-staging` فقط**. لم يُنشر الموقع ولم تُعدّل قاعدة الإنتاج `souqna-sweida`.

## أقسام الهوية البصرية المعتمدة

| Firebase ID | اسم القسم المعتمد | الصورة الموجودة |
| --- | --- | --- |
| cars | السيارات | `assets/category-photos/cars.webp` |
| real_estate | العقارات | `assets/category-photos/real_estate.webp` |
| electronics | الإلكترونيات | `assets/category-photos/electronics.webp` |
| furniture | الأثاث | `assets/category-photos/furniture.webp` |
| jobs | الوظائف | `assets/category-photos/jobs.webp` |
| services | الخدمات | `assets/category-photos/services.webp` |
| misc | متنوعة | `assets/category-photos/misc.webp` |
| community | المجتمع | `assets/category-photos/community.webp` |
| fashion | أزياء | `assets/category-photos/fashion.webp` |
| lost_found | مفقودات | `assets/category-photos/lost_found.webp` |

* الصور الأصلية والشعار المصمم ثلاثي الأبعاد مدمجة في المشروع؛ لا تستبدلها برسومات مشتقة دون اعتماد.
* كان ملف البيانات التأسيسية `scripts/seed-staging.mjs` يضم **24 سجلاً** بينها **ثمانية أقسام**. لم يتم تعديل هذا الملف حفاظاً على العقد السابق.
* أضيفت أداة منفصلة للقسمين التاسع والعاشر، مع إمكانية تفعيل قسم قائم غير مفعل فقط، دون تغيير اسمه أو ترتيبه أو خصائصه الأخرى.

## الإجراءات الآمنة على جهاز Windows

من مجلد المشروع، يطبع هذا الأمر خطة الإضافة دون الاتصال بقاعدة البيانات:

```powershell
npm run upgrade:staging:categories
```

للتدقيق في سجلات **Staging فقط** بعد التحقق من توفر الصلاحيات الصحيحة:

```powershell
node scripts/upgrade-staging-categories.mjs --project souqna-staging --inspect
```

بوجود صلاحيات حقيقية للبيئة الاختبارية وحسب موافقة المالك على إدخال البيانات:

```powershell
node scripts/upgrade-staging-categories.mjs --project souqna-staging --execute --confirm ACTIVATE-CATEGORIES:souqna-staging
```

الأمر الأخير يكتب في `souqna-staging` فقط، ويستعمل `batch.create` عند غياب المستند أو `batch.update({active:true})` إذا كان موجوداً وغير مفعل؛ لا يعيد كتابة الأقسام الموجودة والمفعلة. **لم يتم تشغيل الأمر على حساب Firebase الحقيقي من ChatGPT.**

## اختبار الواجهة الجديدة

* الصفحة الرئيسية تعرض حتى 10 بطاقات مصوّرة قبل إظهار زر «المزيد».
* فلاتر صفحة الإعلانات تحتوي صور المشاهد الأصلية للفئات، مع الإبقاء على روابط `data-c` وعملية البحث.
* صفحة المتاجر تحتوي ترويسة وعرض متجر أوضح؛ صفحات إضافة الإعلان والمتجر تحتوي تسميات إرشادية للحقول.
* `scripts/visual-check.mjs` ينشئ الأقسام العشرة داخل **Firebase Emulator محلي فقط**، ويتحقق من تحميل صورها، ويلتقط صوراً لصفحات الكمبيوتر والهاتف والمتجر ونماذج النشر.
* يجب أن تنجح GitHub Actions بعد الدمج قبل اعتماد أي نشر.

## ما زال مطلوباً قبل الإطلاق

تدقيق وجود الأقسام العشرة بحالة `active:true` داخل **قاعدة Staging الفعلية**، ثم التحقق من حساب المدير والخدمات السحابية ورابط Hosting. نجاح المحاكي لا يعني نجاح تلك الفحوص الواقعية. لا تفعل الفوترة ولا تنشر Cloud Functions أو تغيّر الإنتاج في هذه المرحلة.
