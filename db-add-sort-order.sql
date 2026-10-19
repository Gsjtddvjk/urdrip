-- ============================================================================
-- URDRIP — إضافة عمود الترتيب اليدوي للمنتجات
-- ----------------------------------------------------------------------------
-- نفّذ هذا في Supabase → SQL Editor (مرة واحدة).
-- آمن: يضيف عموداً فقط ولا يحذف أو يعدّل أي صف.
-- بعد تنفيذه ستعمل لوحة التحكم على ترتيب المنتجات بالسحب والإفلات،
-- وستظهر المنتجات في المتجر بهذا الترتيب.
-- ============================================================================

alter table public.products add column if not exists sort_order integer not null default 0;

-- تهيئة أولية: الترتيب الحالي (الأحدث أولاً) يبقى كما هو
update public.products p
   set sort_order = s.n
  from (select id, row_number() over (order by created_at desc) as n from public.products) s
 where p.id = s.id and (p.sort_order is null or p.sort_order = 0);

create index if not exists products_sort_order_idx on public.products (sort_order) where active;

-- لا حاجة لمنح صلاحيات جديدة: عمود sort_order يتبع نفس سياسات RLS الموجودة
-- على جدول products (products_public_read / products_admin_all).
