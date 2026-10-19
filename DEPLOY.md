# URDRIP — دليل النشر الآمن

> كل شيء في هذا المستودع جاهز للتجربة محلياً. الخطوات أدناه تخصّ النشر على
> Vercel + Supabase.

---

## 0. أولاً: regarded المفتاح القديم كمسرّب

النسخة السابقة نشرت مفتاح **service_role** داخل `admin.js` وملفات HTML، و كلمة المرور
كانت مقروءة للجميع. **اعتبرها مسرّبة** ودوّرها فوراً:

1. Supabase → Project Settings → API → **rotate the JWT secret**
   (يُبطل المفتاحين القديمين: anon + service_role).
2. انسخ **المفتاح الجديد** إلى متغيّرات البيئة (القسم 1 في README).
3. راجع `orders` و `products` وسجلات Supabase بحثاً عن تغييرات غير متوقعة.

---

## 1. متغيّرات البيئة (Vercel)

Project → Settings → Environment Variables → أضف:

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

---

## 2. قاعدة البيانات

المشروع الحالي **مُطبَّق عليه** الترحيل الأمني `20261018_001_security_hardening.sql`
(الـ RPC `place_order` و `is_admin` و `admin_dashboard_stats` موجودة).

إنشاء حساب المشرف (Supabase Auth):

1. Authentication → Users → **Add user** (بريدك + كلمة مرور قوية).
2. Authentication → Providers → Email → عطّل "Allow new users to sign up".
3. SQL Editor:
```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
```

> بعدها ادخل إلى `/admin.html` بالبريد وكلمة المرور.
> (لا تحتاج service_role إذا كان حسابك ضمن `admin_users`.)

---

## 3. طريقتان للدخول إلى لوحة التحكم

| الطريقة | المتطلبات | ملاحظات |
|---------|----------|--------|
| **Supabase Auth** (موصى به) | حساب في `auth.users` + سطر في `admin_users` | الجلسات عبر RLS — الأدق أماناً |
| **كلمة مرور على السيرفر** | `ADMIN_PASSWORD` + `SUPABASE_SERVICE_ROLE_KEY` | المقارنة تتم على السيرفر؛ المتصفح لا يرى كلمة المرور أبداً |

---

## 4. النشر

1. ادفع المجلد إلى GitHub.
2. Vercel → Import → Framework: **Other** → Build: *(فارغ)* → Output: *(فارغ)*.
3. أضف متغيّرات البيئة (القسم 1) لكل 환경 (Production + Preview).
4. Deploy.

---

## 5. التحقق بعد النشر

```bash
curl https://YOUR-DOMAIN/api/health
# {"ok":true,"database":"up","products":22}
```

- [ ] `/api/health` يرجّع `ok: true`
- [ ] المنتجات تظهر في الصفحة الرئيسية
- [ ] طلب تجريبي يصل إلى `/admin.html` بحالة `pending`
- [ ] تغيير الحالة من اللوحة يعمل
- [ ] `view-source` لا يحتوي أي `eyJhbGciOi` (مفتاح)

---

## 6. Cloudinary

الـ upload preset `gg-urdrip` غير موقّع (unsigned). قيّده من Cloudinary Dashboard:
الصيغ المسموحة (jpg/png/webp)، الحجم الأقصى، والمجلد `urdrip` الثابت.

---

## 7. الاسترجاع (Rollback)

`supabase/rollback/001_rollback.sql` يعيد السياسات المفتوحة (**يفتح الثغرات**).
استخدمه فقط في حالة الطوارئ. البيانات لا تُمسح أبداً.

---

## 8. الاختبارات

- المتصفح: `npm test` (Supabase مُحاكى، 35 اختباراً).
