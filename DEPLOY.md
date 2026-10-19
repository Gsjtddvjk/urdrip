# URDRIP — دليل النشر الآمن

> المشروع مسطّح: كل الملفات في مجلد واحد. `api.js` هو نقطة الدخول الوحيدة
> على الخادم، و`vercel.json` يربط المسارات `/api/*` به.

---

## 0. أولاً: المفتاح القديم مسرّب

النسخة السابقة نشرت مفتاح **service_role** داخل `admin.js` وملفات HTML، و كلمة المرور
كانت مقروءة للجميع. **اعتبرها مسرّبة** ودوّرها فوراً:

1. Supabase → Project Settings → API → **rotate the JWT secret**
2. انسخ المفتاح الجديد إلى متغيّرات البيئة (القسم 2).
3. راجع `orders` و `products` وسجلات Supabase بحثاً عن تغييرات غير متوقعة.

---

## 1. متغيّرات البيئة (Vercel)

Project → Settings → Environment Variables:

```
SUPABASE_URL=https://vmsrldkihpxkfbgvswnf.supabase.co
SUPABASE_ANON_KEY=<المفتاح الجديد>
SUPABASE_SERVICE_ROLE_KEY=<المفتاح الجديد — اختياري، لدخول كلمة المرور>
ADMIN_PASSWORD=<كلمة مرور قوية للوحة التحكم>
SESSION_SECRET=<32+ حرف عشوائي>
```

توليد `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `api.js` يحتوي على قيم احتياطية تعمل مباشرة، لكن **الأفضل** ضبطها في Vercel
> وتدوير مفتاح `service_role` القديم.

---

## 2. قاعدة البيانات

المشروع الحالي مُطبَّق عليه الترحيل الأمني (RPC `place_order` و `is_admin`
و `admin_dashboard_stats` موجودة).

**لتفعيل ترتيب المنتجات** نفّذ مرة واحدة:

```sql
-- محتوى الملف db-add-sort-order.sql
alter table public.products add column if not exists sort_order integer not null default 0;
update public.products p set sort_order = s.n
  from (select id, row_number() over (order by created_at desc) as n from public.products) s
 where p.id = s.id and (p.sort_order is null or p.sort_order = 0);
create index if not exists products_sort_order_idx on public.products (sort_order) where active;
```

**إنشاء حساب المشرف** (Supabase Auth):

1. Authentication → Users → **Add user** (بريدك + كلمة مرور قوية).
2. Authentication → Providers → Email → عطّل "Allow new users to sign up".
3. SQL Editor:
```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
```

---

## 3. طريقتان للدخول إلى لوحة التحكم

| الطريقة | المتطلبات |
|---------|----------|
| **Supabase Auth** (موصى به) | حساب في `auth.users` + سطر في `admin_users` |
| **كلمة مرور على السيرفر** | `ADMIN_PASSWORD` + `SUPABASE_SERVICE_ROLE_KEY` |

في الحالتين: `/admin.html` — أدخل البريد وكلمة المرور.

---

## 4. النشر

1. ادفع المجلد إلى GitHub.
2. Vercel → Import → Framework: **Other** → Build: *(فارغ)* → Output: *(فارغ)*.
3. أضف متغيّرات البيئة (القسم 1) لكل بيئة.
4. Deploy.

يوزّع `vercel.json` المسارات:

```
/api/*        -> api.js        (Serverless Function)
/api.js       -> 404.html      (محجوب عن الزوار)
/api.js الأصول -> 404
كل ما تبقّى   -> من الـ CDN
```

---

## 5. التحقق بعد النشر

```bash
curl https://YOUR-DOMAIN/api/health
# {"ok":true,"database":"up","products":22}
```

- [ ] `/api/health` يرجّع `ok: true`
- [ ] المنتجات تظهر في الصفحة الرئيسية
- [ ] `/api.js` يرجّع 404 (لا يُنشر مصدر الخادم)
- [ ] طلب تجريبي يصل إلى اللوحة بحالة `pending`
- [ ] تغيير الحالة من اللوحة يعمل
- [ ] `view-source` لا يحتوي `eyJhbGciOi` (أي مفتاح)

---

## 6. Cloudinary

الـ upload preset `gg-urdrip` غير موقّع. قيّده من Dashboard: الصيغ (jpg/png/webp)،
الحجم الأقصى، والمجلد `urdrip` الثابت.

---

## 7. الاسترجاع

`db-rollback.sql` يعيد السياسات المفتوحة (**يفتح الثغرات**) — طارئ فقط.
البيانات لا تُمسح أبداً.

---

## 8. الاختبارات

```bash
npm test              # 35 اختبار متصفح (Supabase مُحاكى)
node test-admin.mjs   # 6 اختبارات ترتيب المنتجات
npm run test:file     # يعمل بدون سيرفر
```
