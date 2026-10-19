/* URDRIP — public client configuration.
 *
 * The Supabase URL and key are NOT here: every database call goes through the
 * server-side proxy in /api, which keeps the credentials on the server
 * (Vercel environment variables SUPABASE_URL / SUPABASE_ANON_KEY).
 *
 * The Cloudinary cloud name + unsigned upload preset ARE public by design:
 * an unsigned preset can only upload, and it is restricted in the Cloudinary
 * dashboard (formats, size, folder). */
window.URDRIP = Object.freeze({
  API_BASE: '/api',
  CLOUDINARY_CLOUD: 'qqftt7fm',
  CLOUDINARY_PRESET: 'gg-urdrip'
});
