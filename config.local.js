/* URDRIP — إعدادات محلية فقط (لا تُنشر أبداً).
 *
 * هذا الملف يجعل الموقع يعمل حتى عند فتح index.html مباشرة من المجلد
 * (file://) بدون سيرفر: عندها يتصل المتصفح بقاعدة البيانات مباشرة.
 *
 * ⚠️ الملف مُستثنى في .gitignore و .vercelignore — لا يُرفع إلى GitHub ولا Vercel.
 * ⚠️ المفتاح هنا anon فقط (مقيّد بـ RLS). لا تضع مفتاح service_role.
 */
window.URDRIP_LOCAL = {
  SUPABASE_URL: 'https://vmsrldkihpxkfbgvswnf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3JsZGtpaHB4a2ZiZ3Zzd25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjM5MDIsImV4cCI6MjA5OTA5OTkwMn0.byh2My9XzGjLJjfEZw-EyGqPeCDefYPgTgsQavC9ALE'
};
