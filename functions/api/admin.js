// Cloudflare Pages Function: /api/admin?action=…
// Admin-only tools. The caller's Wix member token is verified with Wix, then their login email must be in ADMIN_EMAILS.
//   ADMIN_EMAILS  comma-separated (default: tiny.panda@tiny-panda.com)
// Uses WIX_API_KEY / WIX_SITE_ID / WIX_SURPLUS_COLLECTION like the other functions.

const WIX = 'https://www.wixapis.com';
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const H = env => ({ Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' });
const SURPLUS = env => env.WIX_SURPLUS_COLLECTION || 'memberSurplus';
const PREFS = env => env.WIX_PREFS_COLLECTION || 'memberPreferences';
const admins = env => (env.ADMIN_EMAILS || 'tiny.panda@tiny-panda.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function wix(env, path, body, method = 'POST') {
  const r = await fetch(WIX + path, { method, headers: H(env), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}
async function verifyAdmin(request, env) {
  const tok = request.headers.get('x-member-token');
  if (!tok) return { status: 401 };
  const r = await fetch(`${WIX}/members/v1/members/my?fieldsets=FULL`, { headers: { Authorization: tok } });
  if (!r.ok) return { status: 401 };
  const m = (await r.json()).member;
  const email = (m?.loginEmail || '').toLowerCase();
  return admins(env).includes(email) ? { member: m, email } : { status: 403, email };
}

async function listSurplus(env) {
  const out = []; let offset = 0;
  for (;;) {
    const j = await wix(env, '/wix-data/v2/items/query', { dataCollectionId: SURPLUS(env), query: { sort: [{ fieldName: 'sortOrder', order: 'ASC' }], paging: { limit: 100, offset } } });
    const items = j.dataItems || [];
    out.push(...items.map(i => ({ id: i.id || i._id, product: i.data?.product || '', discountPercent: Number(i.data?.discountPercent) || 0, active: !!i.data?.active, sortOrder: Number(i.data?.sortOrder) || 0 })));
    if (items.length < 100) break; offset += 100;
  }
  return out;
}

async function saveSurplus(env, rows) {
  if (!Array.isArray(rows)) throw new Error('items must be an array');
  const current = await listSurplus(env);
  const keep = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const data = { product: String(r.product || '').slice(0, 200), discountPercent: Math.max(0, Math.min(90, Number(r.discountPercent) || 0)), active: !!r.active, sortOrder: i + 1 };
    if (!data.product) continue;
    if (r.id && current.some(c => c.id === r.id)) {
      keep.add(r.id);
      await wix(env, `/wix-data/v2/items/${r.id}`, { dataCollectionId: SURPLUS(env), dataItem: { id: r.id, data: { _id: r.id, ...data } } }, 'PUT');
    } else {
      const j = await wix(env, '/wix-data/v2/items', { dataCollectionId: SURPLUS(env), dataItem: { data } });
      keep.add(j.dataItem?.id || j.dataItem?._id);
    }
  }
  for (const c of current) if (!keep.has(c.id)) await wix(env, `/wix-data/v2/items/${c.id}?dataCollectionId=${encodeURIComponent(SURPLUS(env))}`, null, 'DELETE');
  return listSurplus(env);
}

async function listInstructions(env) {
  const out = []; let offset = 0;
  for (;;) {
    const j = await wix(env, '/wix-data/v2/items/query', { dataCollectionId: PREFS(env), query: { sort: [{ fieldName: '_updatedDate', order: 'DESC' }], paging: { limit: 100, offset } } });
    const items = j.dataItems || [];
    items.forEach(i => { const d = i.data || {}; if ((d.instructions || '').trim()) out.push({ id: i.id || i._id, email: d.email || '', memberId: d.memberId || '', instructions: d.instructions, instructionsConfirmed: d.instructionsConfirmed || '', status: d.instructionsStatus === 'confirmed' ? 'confirmed' : 'awaiting', updated: d._updatedDate || '' }); });
    if (items.length < 100) break; offset += 100;
  }
  return out;
}
async function confirmInstructions(env, { id, confirmed, status }) {
  if (!id) throw new Error('Missing id');
  const cur = await wix(env, `/wix-data/v2/items/${id}?dataCollectionId=${encodeURIComponent(PREFS(env))}`, null, 'GET');
  const data = { ...(cur.dataItem?.data || {}) };
  const text = String(confirmed ?? '').trim().slice(0, 500);
  if (status === 'awaiting') data.instructionsStatus = 'awaiting';
  else { if (!text) throw new Error('Enter the confirmed wording'); data.instructionsConfirmed = text; data.instructionsStatus = 'confirmed'; }
  await wix(env, `/wix-data/v2/items/${id}`, { dataCollectionId: PREFS(env), dataItem: { id, data } }, 'PUT');
  return { id, instructionsConfirmed: data.instructionsConfirmed || '', status: data.instructionsStatus };
}

export async function onRequest({ request, env }) {
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  const a = await verifyAdmin(request, env);
  if (!a.member) return json({ error: a.status === 403 ? 'This account doesn’t have admin access.' : 'Not logged in' }, a.status);
  const action = new URL(request.url).searchParams.get('action');
  try {
    if (action === 'whoami') return json({ admin: true, email: a.email });
    if (action === 'surplus') {
      if (request.method === 'POST') return json({ items: await saveSurplus(env, (await request.json()).items) });
      return json({ items: await listSurplus(env) });
    }
    if (action === 'instructions') {
      if (request.method === 'POST') return json(await confirmInstructions(env, await request.json()));
      return json({ items: await listInstructions(env) });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
