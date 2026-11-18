# شعار وأيقونات سوقنا المعتمدة — نسخة 3D

تم اعتماد نفس الصورتين اللتين أرسلهما مالك المشروع، دون توليد تصميم بديل.

- `logo.png` و`assets/souqna-approved-logo.jpg`: الشعار الذهبي المعتمد، مطابق للملف المرفوع.
- `assets/souqna-3d-mark.webp`: قصّ رمز الشعار للاستخدام في المساحات الصغيرة.
- `icon-192.png` و`icon-512.png`: أيقونات التطبيق مشتقة من رمز الشعار نفسه.
- `assets/category-photos/*.webp`: عشر بطاقات أقسام منفصلة، مقصوصة من الصورة المعتمدة، وتحتفظ بتسمية كل قسم المدمجة في الصورة.
- `assets/category-photos/*-scene.webp`: المشاهد المصغّرة المستخدمة عند عدم وجود صورة للإعلان.
- `assets/souqna-original-categories.png`: صورة الأقسام الأصلية غير المعدّلة.
- `brand-preview.html`: معاينة بصرية مستقلة يمكن فتحها محلياً دون Firebase.

## الدمج

تم تعديل `index.html` و`assets/responsive.css` و`scripts/build-hosting.mjs` و`sw.js` لتضمين الصور في الصفحات والبناء الآمن مع الحفاظ على Firebase وقواعده.

لفحص المصدر: `node scripts/check-souqna.mjs`
لبناء معاينة معزولة: `node scripts/build-hosting.mjs`
لنشر Staging الحقيقي يلزم حساب Firebase مخوّل وتشغيل إجراءات النشر الآمنة المعتمدة سابقاً.

ملاحظة: هذه الحزمة تحتوي ملفات التطبيق المعدّلة، لكنها ليست نشرًا على GitHub أو على Firebase. لا تلمس إنتاج `souqna-sweida` دون موافقة مستقلة.
