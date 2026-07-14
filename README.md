# URDRIP DZ — وصف المشروع الكامل

## نظرة عامة

متجر إلكتروني streetwear إلكتروني بالكامل باللغة العربية مع واجهة داكنة وتأثيرات زجاجية (glassmorphism). مبني بـ HTML/CSS/JS خالص بدون أي إطار عمل.

---

## البنية التحتية

### Supabase (قاعدة البيانات)
- **المشروع:** `vmsrldkihpxkfbgvswnf.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3JsZGtpaHB4a2ZiZ3Zzd25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjM5MDIsImV4cCI6MjA5OTA5OTkwMn0.byh2My9XzGjLJjfEZw-EyGqPeCDefYPgTgsQavC9ALE`
- **Service Role Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3JsZGtpaHB4a2ZiZ3Zzd25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzUyMzkwMiwiZXhwIjoyMDk5MDk5OTAyfQ.gqfcrzQ5H2m14CoiaNG2Gfmd6ZB6yzlS4X1oiFJFy_o`

### Cloudinary (رفع الصور)
- **Cloud Name:** `tqpt3tzb`
- **Upload Preset:** `urdrip` (unsigned)
- **URL:** `https://api.cloudinary.com/v1_1/tqpt3tzb/image/upload`
- مجاني 25GB + CDN سريع + تحويل تلقائي إلى WebP

### Supabase Schema (v8)
```sql
-- الجداول:
categories    -- التصنيفات (3 فقط: clothes, accessories, gang)
products      -- المنتجات (صور base64, أسعار integer, stock)
orders        -- الطلبات
settings      -- إعدادات المشرف (كلمة المرور)

-- الملفات:
SUPABASE_SCHEMA.sql  -- السكيما الكاملة (يجب تشغيلها واحد واحد)
MIGRATE_v7.sql       -- ترحيل آمن بدون حذف بيانات
FIX_SETTINGS.sql     -- إنشاء جدول settings فقط
```

---

## الملفات

| الملف | الوظيفة |
|-------|---------|
| `index.html` | الصفحة الرئيسية: hero + كروت التصنيفات + drop card + من نحن + الإحصائيات |
| `collection.html` | صفحة التجميع: شبكة المنتجات + فلتر + modal |
| `checkout.html` | صفحة الدفع: نموذج الزبون + ملخص السلة + إرسال الطلب |
| `admin.html` | لوحة التحكم: إدارة المنتجات + الطلبات + كلمة المرور |
| `admin.js` | منطق لوحة التحكم |
| `admin.css` | تصاميم لوحة التحكم |
| `SUPABASE_SCHEMA.sql` | سكيما قاعدة البيانات الكاملة |
| `MIGRATE_v7.sql` | ترحيل آمن من v6 إلى v8 |
| `FIX_SETTINGS.sql` | إنشاء جدول settings لكلمة المرور |
| `FIX_ORDERS.sql` | إصلاح جدول الطلبات |

---

## الصفحة الرئيسية (index.html)

### الأقسام
1. **Loader** — شاشة تحميل مع `loader-please-wait.png`
2. **Hero** — عنوان + وصف + زر شراء + زر استكشاف
3. **كروت التصنيفات** — 3 كروت (ستريت وير، إكسسوارات، سنيكرز) مع صور PNG
4. **Drop Card** — إشعار المنتج الجديد مع عداد تنازلي
5. **من نحن** — وصف البراند + إحصائيات
6. **Modal** — تفاصيل المنتج عند النقر
7. **Cart Toast** — إشعار عند الإضافة للسلة
8. **Footer** — معلومات التواصل + Instagram

### المميزات
- لا يوجد قسم منتجات (تم حذفه بناءً على طلب المستخدم)
- التصنيفات توجه إلى `collection.html?cat=clothes`
- Dark theme مع تأثيرات نارية (fire/red glassmorphism)
- متجاوب مع الجوال

---

## صفحة التجميع (collection.html)

### المميزات
- **شبكة منتجات** — عرض جميع المنتجات من Supabase
- **فلتر بالتصنيفات** — زر "الكل" + 3 أزرار تصنيفي
- **Modal المنتج** — صور متعددة + اختيار المقاس + إضافة للسلة
- **Loading Screen** — شاشة تحميل مع `loader-please-wait.png`
- **Cache** — تخزين المنتجات في `localStorage` لمدة ساعة
- **Smart Image Loading** — bulk query يجلب `image` فقط، `images` تُحمّل عند فتح Modal
- **Fire Theme** — خلفية نارية مرئية على الجوال

### Filtering
- يعرض فقط المنتجات التي تطابق `category` المحدد
- `display:none` toggle بدلاً من rebuild DOM (يمنع إعادة تحميل الصفحة)

---

## صفحة الدفع (checkout.html)

### نموذج الزبون
- الاسم الكامل
- رقم الهاتف
- الولاية (58 ولاية جزائرية)
- البلدية (اختياري)
- طريقة التوصيل (منزل +700 دج / مكتب +600 دج)
- ملاحظات (اختياري)

### ملخص الطلب
- عرض المنتجات من السلة
- سعر المنتج + سعر التوصيل = المجموع الكلي
- **لا يرسل صور في الطلب** (يمنع Timeout)

### الإرسال
- يحفظ الطلب في Supabase
- يعرض رسالة نجاح
- يمسح السلة بعد النجاح

---

## لوحة التحكم (admin.html)

### كلمة المرور
- **الافتراضي:** `urdrip2026`
- **التخزين:** Supabase جدول `settings`
- **المزامنة:** تلقائي عبر الأجهزة
- **التغيير:** من صفحة الإعدادات في لوحة التحكم

### إدارة المنتجات
- إضافة منتج جديد (اسم، تصنيف، سعر، ألوان، صور Cloudinary، badge، وصف، stock)
- تعديل منتج موجود
- حذف منتج مع تأكيد
- الصور تُرفع على Cloudinary تلقائياً وتحفظ الرابط فقط

### إدارة الطلبات
- عرض جميع الطلبات
- تغيير الحالة (pending → confirmed → shipped → delivered / cancelled)
- حذف طلب

### إدارة التصنيفات
- إضافة/تعديل/حذف التصنيفات
- كل تصنيف له: name, description, sort_order, active

### الإعدادات
- تغيير كلمة المرور (تُحفظ في Supabase)

### إحصائيات الإيرادات
- مجموع مبيعات المنتجات فقط (بدون تكلفة التوصيل)

---

## التقنيات المستخدمة

| التقنية | الاستخدام |
|---------|-----------|
| HTML5 | بنية الصفحات |
| CSS3 | التصميم + التأثيرات |
| Vanilla JS | المنطق البرمجي |
| Supabase | قاعدة البيانات + API |
| Cloudinary | رفع الصور + CDN |
| localStorage | السلة + التخزين المؤقت |
| Gilroy ExtraBold | الخط الرئيسي |
| DM Serif Display | عناوين مائلة |
| Outfit | خط صفحة الدفع |

---

## التصميم

### الألوان
- **الخلفية:** `#050505` → `#111111` (تدرج داكن)
- **اللهب الرئيسي:** `#ff2d2d` (أحمر)
- **اللهب الثانوي:** `#ff6b35` (برتقالي)
- **النص:** `#ffffff` → `rgba(255,255,255,.7)` (أبيض شفاف)

### التأثيرات
- Glassmorphism: `backdrop-filter: blur()`
- تدرجات نارية على الأزرار والعناصر النشطة
- ظلال متوهجة (glow)
- نجوم متحركة على الخلفية (canvas)
- أشرطة ضوئية متحركة (aurora)
- كرات ضوء متحركة (orbs)

### الخطوط
- **Gilroy ExtraBold:** كل النصوص
- **DM Serif Display:** عناوين "من نحن" المائلة
- **Outfit:** صفحة الدفع

---

## النشر على Vercel

### الخطوات
1. ارفع الكود على GitHub
2. اربط GitHub بـ Vercel
3. اختر المجلد الجذر (`urdrip2`)
4. Build Command: `Leave empty` (ملف statik)
5. Output Directory: `.`
6. Deploy

### متطلبات ما بعد النشر
- تشغيل SQL schema على Supabase (واحد واحد)
- اختبار جميع الصفحات
- إضافة منتجات اختبارية من لوحة التحكم

---

## التحسينات المُنجزة

- ✅ حذف قسم المنتجات من الصفحة الرئيسية
- ✅ حذف "dz" و إيموجي اللهب من الشعار
- ✅ إضافة خط DM Serif Display لـ collection.html
- ✅ إضافة خط Outfit لـ checkout.html
- ✅ حماية zoom على جميع الصفحات
- ✅ شاشة تحميل على index.html و collection.html
- ✅ تحميل ذكي للصور (thumbnail في bulk، full في modal)
- ✅ فلتر display:none يمنع إعادة تحميل الصفحة
- ✅ كلمة مرور موحدة في Supabase (تتعرف عبر الأجهزة)
- ✅ timeout تمزيد من 2000ms إلى 8000ms
- ✅ RLS policies مع `WITH CHECK (true)` للإدراج
- ✅ Fire theme ظاهر على الجوال
- ✅ صور base64 → Cloudinary URLs (أسرع 50%+)

---

## ملاحظات مهمة

1. **لا تغير Anon Key أو Service Role Key** بدون تحديث جميع الملفات
2. **لا تغير Cloudinary Cloud Name أو Upload Preset** بدون تحديث admin.js
3. **SQL schema يجب تشغيله واحد واحد** في Supabase SQL Editor
4. **كلمة مرور افتراضي:** `urdrip2026`
5. **Instagram:** `@urdrip_dz`
6. **التصنيفات محدودة بـ 3 فقط:** clothes, accessories, gang
