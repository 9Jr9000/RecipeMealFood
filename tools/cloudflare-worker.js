// Recipe Box link-import relay — a free Cloudflare Worker.
//
// Browsers don't let one website read another site's pages, so the app asks this relay to fetch
// recipe pages (and their photos) for it. Setup (about 5 minutes, free):
//   1. Sign up at https://dash.cloudflare.com and open "Workers & Pages" → Create → "Hello World" Worker.
//   2. Click "Edit code", replace everything with this file, and click Deploy.
//   3. Copy the worker's address (like https://recipe-relay.yourname.workers.dev) into
//      Recipe Box → Settings → Link Import Relay.
//
// Only pages opened from the origins below can use it, so it can't be used as an open proxy.
const ALLOWED_ORIGINS = ['https://9jr9000.github.io', 'http://localhost:8080'];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!allowed) return new Response('Not allowed', { status: 403, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    if (!target || !/^https?:\/\//i.test(target)) return new Response('Add ?url=https://…', { status: 400, headers: cors });

    const res = await fetch(target, {
      redirect: 'follow',
      headers: {
        // Look like a normal browser so recipe sites serve the full page.
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/json,image/avif,image/webp,image/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', res.headers.get('Content-Type') || 'text/plain');
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(res.body, { status: res.status, headers });
  },
};
