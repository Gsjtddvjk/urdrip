# URDRIP DZ — متجر إلكتروني (Streetwear · Algeria)

> ✅ **بنية جديدة (v10):** كل الاتصال بقاعدة البيانات يمر عبر **بروكسي على الخادم** (`/api/*`).
> لا يوجد أي مفتاح Supabase في كود الواجهة (frontend) — المفتاح موجود على السيرفر فقط.
> الثيم: **Glow iOS** — أبيض، شفاف (glassmorphism)، إضاءة ناعمة، بدون أي حركة في الخلفية.

---

## 1. البنية

```
الزائر ──► index.html / checkout.html / admin.html
                 │  fetch('/api/...')          ← بدون أي مفتاح
                 ▼
        Vercel Serverless (api/*.js)  ←  Supabase URL + KEY (متغيرات بيئة)
                 │  fetch Supabase REST/RPC
                 ▼
            Supabase (vmsrldkihpxkfbgvswnf)
```

| الملف | الوظيفة |
|-------|---------|
| `api/_lib.js` | أدوات مشتركة: قراءة الـ env، جلسات الأدمن الموقّعة، نداء Supabase |
| `api/_config.js` | **بيانات احتياطية على السيرفر فقط** (لا تُنشر كصفحة) |
| `api/products.js` | `GET /api/products` — قائمة المنتجات (+ `?id=` لمنتج واحد) |
| `api/categories.js` | `GET /api/categories` — التصنيفات |
| `api/order.js` | `POST /api/order` — إنشاء الطلب عبر `place_order()` RPC |
| `api/auth.js` | `POST /api/auth` — دخول الأدمن (Supabase Auth أو كلمة مرور على السيرفر) |
| `api/db.js` | `/api/db` — عمليات لوحة التحكم (RLS + allowlist `admin_users`) |
| `api/health.js` | `GET /api/health` — فحص الاتصال بقاعدة البيانات |
| `api-client.js` | عميل الـ API في المتصفح (بدون مفاتيح) |
| `server.js` | سيرفر تطوير محلي يشغّل نفس الـ API بدون Vercel |

---

## 2. التشغيل محلياً

```bash
npm install          # (اختياري — للأدوات فقط)
copy .env.example .env
npm run dev          # http://localhost:3000
```

> ⚠️ **لا تفتح `index.html` مباشرة من المجلد (نقر مزدوج).** المتصفح لن يجد `/api`.
> استخدم دائماً `npm run dev` أو `npx vercel dev`.

---

## 3. متغيّرات البيئة (إلزامية على Vercel)

Vercel → Project → Settings → Environment Variables:

| المتغيّر | مطلوب | الوصف |
|----------|-------|-------|
| `SUPABASE_URL` | نعم | `https://vmsrldkihpxkfbgvswnf.supabase.co` |
| `SUPABASE_ANON_KEY` | نعم | مفتاح anon (من Supabase → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | اختياري | مطلوب فقط للدخول بكلمة مرور (rotate القديم أولاً!) |
| `ADMIN_PASSWORD` | اختياري | كلمة مرور الأدمن (تُقارَن على السيرفر) |
| `SESSION_SECRET` | نعم | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> `api/_config.js` يحتوي على قيم احتياطية تعمل مباشرة، لكن **الأفضل** ضبطها في Vercel
> وتدوير مفتاح `service_role` القديم (كان منشوراً في الإصدار القديم).

---

## 4. الثيم — Glow iOS

- خلفية بيضاء متدرّجة مع **توهّجات ضوئية ثابتة** (أزرق/وردي/بنفسجي بشفافية عالية).
- أسطح **زجاجية** (`backdrop-filter: blur + saturate`) مع حدود بيضاء وحواف ناعمة.
- صور المنتجات بالأبيض والأسود (`grayscale`) وتتحوّل للون عند المرور.
- **بدون أي صورة متحركة أو أنيميشن متكرر** في الخلفية.
- خطوط: `Inter` فقط + خط النظام للمن monospace (طلب شبكة أقل = تحميل أسرع).
- دعم `prefers-reduced-motion` + تخطيط متجاوب للجوال.

---

## 5. الأداء

| التقنية | الأثر |
|---------|-------|
| تخزين محلي `localStorage` للمنتجات (24 ساعة) | فتح فوري عند العودة |
| `Cache-Control: s-maxage` على `/api/products` و `/api/categories` | رد من الـ edge بدون لمس القاعدة |
| Cloudinary `q_auto,f_auto,w_N` | صور أصغر/formats محسّنة تلقائياً |
| صورة Modal تظهر فوراً من بيانات القائمة | لا انتظار |
| طلب شبكة واحد للخطوط + `preconnect` | وقت رسم أول (FCP) أقصر |

---

## 6. الأمان

- ✅ لا مفتاح Supabase في أي ملف يُقدَّم للمتصفح (اختبار تلقائي في `tests/e2e.mjs`).
- ✅ الطلبات تُسجَّل عبر `place_order()` RPC — الأسعار تُحسب على السيرفر، والمتصفح لا يرسل أسعاراً.
- ✅ مفتاح idempotency يمنع تكرار الطلب عند إعادة المحاولة.
- ✅ RLS + `admin_users` — الطلبات والإعدادات غير مقروءة إلا للمشرف.
- ✅ `orders_guard` يمنع تعديل بيانات الزبون/المبلغ بعد الإنشاء ويقيّد انتقالات الحالة.
- ✅ حد 5 طلبات/ساعة/رقم هاتف (rate limit على السيرفر).
- ✅ CSP صارم + `X-Frame-Options: DENY` + `no-store` على صفحات الأدمن.

---

## 7. النشر على Vercel

1. ارفع المجلد إلى GitHub.
2. Vercel → Import → Framework: **Other** → Build Command: *(فارغ)* → Output: *(فارغ)*.
3. أضف متغيّرات البيئة (القسم 3).
4. Deploy — مجلد `api/` يُنشر تلقائياً كـ Serverless Functions.

---

## 8. الاختبارات

```bash
npm test             # 35 اختبار متصفح (Puppeteer) — Supabase مُحاكى
```

لقطات الشاشة تُحفظ في `%TEMP%/urdrip-shots` (خارج المشروع).

---

## 9. ملاحظات

- التصنيفات: `clothes` (ستريت وير) · `accessories` (إكسسوارات) · `gang` (سنيكرز).
- التوصيل: 69 ولاية — للباب 700 دج / المكتب 600 دج.
- Instagram: `@urdrip_dz`
- `supabase/migrations/` يوثّق مخطط القاعدة الحالي — لا تشغّله على قاعدة مُطبَّقة.
