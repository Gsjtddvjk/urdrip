# URDRIP DZ — Prompt شامل لإنشاء متجر إلكتروني

## النموذج (Template) — قابل للتكيف مع أي متجر

---

## 1. نظرة عامة على المشروع

متجر إلكتروني streetwear مبني بـ HTML/CSS/JS خالص مع:
- Supabase (قاعدة بيانات + API)
- Cloudinary (رفع الصور + CDN مجاني)
- Vercel (استضافة مجانية)
- تصميم dark theme مع glassmorphism وتأثيرات نارية

**قابل للتكيف مع:** ملابس، إلكترونيات، مأكولات، إكسسوارات، أي منتجات

---

## 2. البنية التحتية

### Supabase (قاعدة البيانات)
```
URL: https://[project-id].supabase.co
Anon Key: [public-key]
Service Role Key: [secret-key]
```

**الميزات:**
- REST API (بدون برمجة خادم)
- RLS (Row Level Security)
- مزامنة عبر الأجهزة
- مجاني حتى 500MB

### Cloudinary (رفع الصور)
```
Cloud Name: [your-cloud-name]
Upload Preset: [preset-name] (unsigned)
URL: https://api.cloudinary.com/v1_1/[cloud-name]/image/upload
```

**الميزات:**
- مجاني 25GB
- CDN سريع عالمياً
- تحويل تلقائي إلى WebP (أخف 50%)
- Thumbnails تلقائية

### Vercel (الاستضافة)
- مجاني
- HTTPS تلقائي
- سرعة عالية عالمياً
- نشر مباشر من GitHub

---

## 3. السكيما (Database Schema)

### categories (التصنيفات)
```sql
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,                    -- اسم التصنيف
  description TEXT DEFAULT '',           -- وصف التصنيف
  sort_order SMALLINT DEFAULT 0,        -- ترتيب العرض
  active BOOLEAN DEFAULT TRUE,          --نشط/غير نشط
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### products (المنتجات)
```sql
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,                    -- اسم المنتج
  category TEXT NOT NULL,               -- تصنيف (clothes/accessories/gang)
  price INTEGER NOT NULL DEFAULT 0,     -- السعر بالدينار
  old_price INTEGER DEFAULT 0,          -- السعر القديم (للخصم)
  color TEXT,                           -- اللون
  sizes TEXT DEFAULT 'S,M,L,XL,XXL',   -- المقاسات
  image TEXT,                           -- رابط الصورة (Cloudinary URL)
  images JSONB DEFAULT '[]'::jsonb,     -- مصفوفة الصور
  badge TEXT,                           -- badge (new/hot/sale/best)
  description TEXT DEFAULT '',          -- وصف المنتج
  stock SMALLINT DEFAULT 5,            -- المخزون
  active BOOLEAN DEFAULT TRUE,         --نشط/غير نشط
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### orders (الطلبات)
```sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  customer TEXT NOT NULL,               -- اسم الزبون
  phone TEXT NOT NULL,                  -- رقم الهاتف
  wilaya TEXT NOT NULL,                 -- الولاية
  commune TEXT,                         -- البلدية
  delivery TEXT DEFAULT 'home',        -- طريقة التوصيل (home/office)
  note TEXT,                           -- ملاحظات
  items JSONB NOT NULL,                -- المنتجات (JSON)
  total INTEGER NOT NULL DEFAULT 0,    -- المجموع الكلي
  status TEXT DEFAULT 'pending',       -- الحالة
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### settings (الإعدادات)
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. الملفات والمكونات

### الملفات الأساسية
```
index.html          → الصفحة الرئيسية (hero + تصنيفات + من نحن)
collection.html     → صفحة التجميع (شبكة منتجات + فلتر + modal)
checkout.html       → صفحة الدفع (نموذج + ملخص + إرسال)
admin.html          → لوحة التحكم (إدارة كل شيء)
admin.js            → منطق لوحة التحكم
admin.css           → تصاميم لوحة التحكم
```

### ملفات Supabase
```
SUPABASE_SCHEMA.sql → السكيما الكاملة
MIGRATE_v7.sql      → ترحيل آمن
FIX_SETTINGS.sql    → إنشاء جدول الإعدادات
```

### ملفات الصور
```
loader-please-wait.png  → شاشة التحميل
cat-streetwear.png      → صورة تصنيف
cat-accessories.png     → صورة تصنيف
cat-sneakers.png        → صورة تصنيف
logo-white.png          → الشعار
mascot.png              → شخصية البراند
```

---

## 5. المكونات التفصيلية

### 5.1 الصفحة الرئيسية (index.html)

#### الأقسام:
1. **Loader** — شاشة تحميل مع صورة
2. **Navbar** — شعار + سلة + روابط
3. **Hero** — عنوان + وصف + أزرار CTA
4. **Categories** — كروت التصنيفات (3 تصنيفات)
5. **Drop Card** — إشعار منتج جديد + عداد تنازلي
6. **About** — وصف البراند + إحصائيات
7. **Modal** — تفاصيل المنتج
8. **Cart Toast** — إشعار الإضافة للسلة
9. **Footer** — معلومات التواصل

#### المميزات:
- لا يوجد قسم منتجات (يُعرض في collection.html)
- التصنيفات توجه إلى `collection.html?cat=[category]`
- Dark theme مع تأثيرات نارية
- متجاوب مع الجوال

### 5.2 صفحة التجميع (collection.html)

#### المكونات:
1. **Navbar** — شعار + سلة + روابط
2. **Filters** — أزرار الفلتر (الكل + تصنيفيات)
3. **Products Grid** — شبكة المنتجات
4. **Modal** — تفاصيل المنتج (صور + مقاس + إضافة)
5. **Cart** — السلة
6. **Loading Screen** — شاشة التحميل
7. **Footer** — معلومات التواصل

#### المميزات:
- **Smart Image Loading** — bulk query يجلب `image` فقط، `images` تُحمّل عند فتح Modal
- **Cache** — تخزين المنتجات في `localStorage` لمدة ساعة
- **Display Filter** — `display:none` بدلاً من rebuild DOM
- **Fire Theme** — خلفية نارية مرئية على الجوال

### 5.3 صفحة الدفع (checkout.html)

#### المكونات:
1. **Navbar** — شعار
2. **Customer Form** — نموذج الزبون
3. **Cart Summary** — ملخص السلة
4. **Order Total** — المجموع الكلي
5. **Submit Button** — زر إرسال الطلب
6. **Success Modal** — رسالة النجاح

#### نموذج الزبون:
- الاسم الكامل (مطلوب)
- رقم الهاتف (مطلوب)
- الولاية (مطلوب — 58 ولاية)
- البلدية (اختياري)
- طريقة التوصيل (منزل +700 دج / مكتب +600 دج)
- ملاحظات (اختياري)

### 5.4 لوحة التحكم (admin.html)

#### المكونات:
1. **Login** — كلمة المرور
2. **Dashboard** — إحصائيات عامة
3. **Products** — إدارة المنتجات
4. **Add Product** — إضافة منتج جديد
5. **Edit Product** — تعديل منتج
6. **Orders** — إدارة الطلبات
7. **Categories** — إدارة التصنيفات
8. **Settings** — الإعدادات

#### مميزات:
- **كلمة مرور** — مخزنة في Supabase (تتعرف عبر الأجهزة)
- **Cloudinary Upload** — صور تُرفع تلقائياً
- **Stock Management** — إدارة المخزون
- **Revenue Stats** — إحصائيات الإيرادات (بدون توصيل)

---

## 6. التصميم (Design System)

### الألوان
```css
--bg: #050505;           /* الخلفية الرئيسية */
--bg2: #111111;          /* الخلفية الثانوية */
--a: #ff2d2d;            /* اللون الرئيسي (أحمر) */
--b: #ff6b35;            /* اللون الثانوي (برتقالي) */
--text: #ffffff;         /* النص الأساسي */
--text-dim: rgba(255,255,255,.7); /* النص الثانوي */
```

### الخطوط
```css
font-family: 'Gilroy', sans-serif;           /* كل النصوص */
font-family: 'DM Serif Display', serif;      /* عناوين مائلة */
font-family: 'Outfit', sans-serif;           /* صفحة الدفع */
```

### التأثيرات
```css
/* Glassmorphism */
backdrop-filter: blur(20px);
background: rgba(255,255,255,.05);
border: 1px solid rgba(255,255,255,.1);

/* تدرج ناري */
background: linear-gradient(135deg, #ff2d2d, #ff6b35);

/* ظل متوهج */
box-shadow: 0 4px 30px rgba(255,45,45,.3);
```

### breakpoints (متجاوب)
```css
/* Mobile */
@media (max-width: 768px) { ... }

/* Desktop */
@media (min-width: 769px) { ... }
```

---

## 7. JavaScript — الدوال الأساسية

### Supabase CRUD
```javascript
// جلب البيانات
async function sbFetch(table, query) { ... }

// إدراج
async function sbInsert(table, data) { ... }

// تحديث
async function sbUpdate(table, id, data) { ... }

// حذف
async function sbDelete(table, id) { ... }
```

### Cloudinary Upload
```javascript
var CLOUDINARY_CLOUD = 'your-cloud-name';
var CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload';
var CLOUDINARY_PRESET = 'your-preset';

async function uploadToCloudinary(file) {
  var fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'your-folder');
  try {
    var r = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
    var d = await r.json();
    if (d.secure_url) return d.secure_url;
    return null;
  } catch (e) { return null; }
}
```

### Cart (سلة المشتريات)
```javascript
function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  var cart = getCart();
  var total = cart.reduce(function(s, it) { return s + (it.qty || 1); }, 0);
  // تحديث عداد السلة في الـ navbar
}
```

### Product Modal
```javascript
function openModal(productId) {
  var product = products.find(function(p) { return p.id === productId; });
  // عرض الصور
  // عرض التفاصيل
  // عرض المقاسات
  // فتح الـ modal
}

function closeModal() {
  // إغلاق الـ modal
}
```

### Filter
```javascript
var currentFilter = 'all';

function filterProducts(category) {
  currentFilter = category;
  // تحديث أزرار الفلتر
  // عرض المنتجات المفلترة
}
```

---

## 8. الأخطاء الشائعة والحلول

### 8.1 الصور تثقل الصفحة
**المشكلة:** صور base64 كبيرة الحجم تبطئ التحميل
**الحل:** استخدام Cloudinary URLs بدلاً من base64

### 8.2 الصفحة تعيد التحميل عند الفلتر
**المشكلة:** إعادة بناء DOM تسبب إعادة تحميل
**الحل:** استخدام `display:none` بدلاً من `innerHTML`

### 8.3 Timeout عند إرسال الطلب
**المشكلة:** صور base64 كبيرة فيطلب Timeout
**الحل:** عدم إرسال الصور في الطلب، حفظ الرابط فقط

### 8.4 كلمة المرور لا تتساوى عبر الأجهزة
**المشكلة:** كلمة مرور مخزنة في localStorage فقط
**الحل:** حفظها في Supabase جدول `settings`

### 8.5 الصور لا تظهر بعد النشر
**المشكلة:** base64 URLs لا تعمل على HTTPS
**الحل:** استخدام Cloudinary URLs

### 8.6 products[i] undefined عند فتح Modal
**المشكلة:** فهرس المصفوفة غير صحيح بعد الفلتر
**الحل:** استخدام `products[i]` بدلاً من `filtered[i]`

### 8.7 Admin لا يستطيع إدراج بيانات
**المشكلة:** RLS policies ناقصة
**الحل:** إضافة `WITH CHECK (true)` لكل policy

### 8.8 Supabase timeout عند الجلب
**المشكلة:** timeout قصير جداً (2000ms)
**الحل:** زيادة timeout إلى 8000ms

---

## 9. خطوات النشر

### 9.1 إعداد قاعدة البيانات
1. إنشاء مشروع Supabase جديد
2. تشغيل `SUPABASE_SCHEMA.sql` في SQL Editor (واحد واحد)
3. إنشاء upload preset على Cloudinary

### 9.2 رفع الكود
1. إنشاء مستودع GitHub جديد
2. رفع جميع الملفات
3. إنشاء `.gitignore` (لكن بدون config.js لأننا نستخدم Cloudinary مباشرة)

### 9.3 النشر على Vercel
1. ربط GitHub بـ Vercel
2. اختيار المستودع
3. Framework: Other
4. Root Directory: ./
5. Build Command: (فارغ)
6. Output Directory: (فارغ)
7. Deploy

### 9.4 ما بعد النشر
1. اختبار جميع الصفحات
2. إضافة منتجات اختبارية
3. اختبار الطلبات
4. اختبار على الجوال

---

## 10. تخصيص المتجر

### 10.1 تغيير التصنيفات
عدّل `SUPABASE_SCHEMA.sql`:
```sql
INSERT INTO categories (name, sort_order) VALUES
  ('التصنيف1', 1),
  ('التصنيف2', 2),
  ('التصنيف3', 3);
```

### 10.2 تغيير الألوان
عدّل المتغيرات في CSS:
```css
--a: #ff2d2d;    /* اللون الرئيسي */
--b: #ff6b35;    /* اللون الثانوي */
```

### 10.3 تغيير التوصيل
عدّل الأسعار في `checkout.html`:
```javascript
var deliveryPrices = {
  home: 700,    /* توصيل منزلي */
  office: 600   /* استلام من المكتب */
};
```

### 10.4 تغيير كلمة المرور
من لوحة التحكم → الإعدادات → تغيير كلمة المرور

### 10.5 تغيير الشعار
استبدل `logo-white.png` بشعارك

---

## 11. النسخة الاحتياطية

### تصدير قاعدة البيانات
```sql
-- تصدير جميع المنتجات
SELECT * FROM products;

-- تصدير جميع الطلبات
SELECT * FROM orders;

-- تصدير جميع التصنيفات
SELECT * FROM categories;
```

### استيراد قاعدة البيانات
```sql
-- استيراد منتج
INSERT INTO products (name, category, price, ...) VALUES (...);

-- استيراد طلب
INSERT INTO orders (customer, phone, wilaya, items, total) VALUES (...);
```

---

## 12. أمان المشروع

### 12.1 كلمة المرور
- مخزنة في Supabase (وليس في الكود)
- تتساوى عبر الأجهزة
- قابلة للتغيير من لوحة التحكم

### 12.2 Supabase Keys
- **Anon Key:** عامة (آمنة في الكود)
- **Service Role Key:** سرية (لا تشاركها)

### 12.3 Cloudinary
- **Unsigned Upload:** آمن (لا يكشف مفاتيح)

### 12.4 RLS Policies
```sql
-- كل جدول يحتاج policy
CREATE POLICY "policy_name" ON table_name
  FOR ALL USING (true) WITH CHECK (true);
```

---

## 13. الأداء

### 13.1 تحسين الصور
- استخدام Cloudinary URLs
- Thumbnails تلقائية
- تحويل إلى WebP
- lazy loading

### 13.2 تحسين قاعدة البيانات
- Bulk queries (جلب واحد)
- Cache في localStorage
- فلتر بالـ DB

### 13.3 تحسين الـ DOM
- `display:none` بدلاً من rebuild
- Minimal reflows
- Event delegation

---

## 14. التكامل مع أنظمة أخرى

### 14.1 الدفع
- Baridimob (ciberneta)
- CCP
- BaridiMob

### 14.2 الشحن
- Yalidine
- ZR Express
- My Express

### 14.3 الإشعارات
- SMS (Twilio)
- WhatsApp Business API

---

## 15. قائمة التحقق (Checklist)

### قبل النشر:
- [ ] السكيما مشغلة على Supabase
- [ ] Cloudinary preset جاهز
- [ ] جميع الملفات محدثة بالبيانات الصحيحة
- [ ] كلمة المرور الافتراضي محفوظة
- [ ] جميع الصفحات تعمل على localhost

### بعد النشر:
- [ ] الصفحة الرئيسية تعمل
- [ ] صفحة التجميع تعمل
- [ ] صفحة الدفع تعمل
- [ ] لوحة التحكم تعمل
- [ ] الصور تُرفع على Cloudinary
- [ ] الطلبات تُحفظ في Supabase
- [ ] يعمل على الجوال
- [ ] يعمل على HTTPS

---

## 16. أمثلة على تكييف المتجر

### 16.1 متجر ملابس
```javascript
// التصنيفات
var categories = [
  { name: 'رجالي', category: 'men' },
  { name: 'نسائي', category: 'women' },
  { name: 'أطفال', category: 'kids' }
];

// المقاسات
var sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
```

### 16.2 متجر إلكترونيات
```javascript
// التصنيفات
var categories = [
  { name: 'هواتف', category: 'phones' },
  { name: 'لابتوب', category: 'laptops' },
  { name: 'سماعات', category: 'headphones' }
];

// لا تحتاج مقاسات
var sizes = null;
```

### 16.3 متجر مأكولات
```javascript
// التصنيفات
var categories = [
  { name: 'برجر', category: 'burgers' },
  { name: 'بيتزا', category: 'pizza' },
  { name: 'مشروبات', category: 'drinks' }
];

// لا تحتاج مقاسات
var sizes = null;

// التوصيل
var deliveryPrices = {
  home: 300,
  office: 200
};
```

---

## 17. أوامر مفيدة

### Supabase SQL
```sql
-- جلب جميع المنتجات
SELECT * FROM products;

-- جلب المنتجات النشطة
SELECT * FROM products WHERE active = true;

-- جلب الطلبات المعلقة
SELECT * FROM orders WHERE status = 'pending';

-- تحديث حالة الطلب
UPDATE orders SET status = 'confirmed' WHERE id = 1;

-- حذف منتج
DELETE FROM products WHERE id = 1;
```

### Git
```bash
# رفع التغييرات
git add .
git commit -m "description"
git push origin main
```

### Vercel CLI
```bash
# نشر يدوي
vercel --prod
```

---

## 18. المراجع

- [Supabase Docs](https://supabase.com/docs)
- [Cloudinary Docs](https://cloudinary.com/documentation)
- [Vercel Docs](https://vercel.com/docs)
- [MDN Web Docs](https://developer.mozilla.org)

---

## 19. النسخة الحالية

- **Version:** 2.0
- **Last Updated:** July 2026
- **Status:** Production Ready
- **Database:** Supabase (Schema v8)
- **Images:** Cloudinary (Free Tier)
- **Hosting:** Vercel (Free Tier)

---

## 20. ملاحظات النسخة

### تم تحسين:
- ✅ Cloudinary بدلاً من base64
- ✅ Smart Image Loading
- ✅ Cache في localStorage
- ✅ Display Filter (بدون rebuild)
- ✅ Admin Password Sync عبر Supabase
- ✅ Timeout محسّن (8000ms)
- ✅ RLS Policies مع WITH CHECK
- ✅ Fire Theme على الجوال
- ✅ Responsive Design
- ✅ Loading Screens

### الملفات الرئيسية:
1. `index.html` — الصفحة الرئيسية
2. `collection.html` — صفحة التجميع
3. `checkout.html` — صفحة الدفع
4. `admin.html` — لوحة التحكم
5. `admin.js` — منطق لوحة التحكم
6. `admin.css` — تصاميم لوحة التحكم
7. `SUPABASE_SCHEMA.sql` — السكيما
8. `README.md` — وصف المشروع

### للبدء:
1. أنشئ حساب Supabase
2. أنشئ حساب Cloudinary
3. شغّل السكيما
4. ارفع الكود
5. انشر على Vercel

---

**هذا البرومبت يمثل بنية مشروع كاملة لأي متجر إلكتروني.**
**يمكنك تكييفه مع أي نوع منتجات بتعديل التصنيفات والأسعار والتصميم.**
