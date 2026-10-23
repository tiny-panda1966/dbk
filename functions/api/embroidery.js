// Cloudflare Pages Function: POST /api/embroidery
// Uploads the 3D placement preview (+ customer logo) to the Wix Media Manager and saves the design to the Wix CMS.
// Runs server-side so the Wix API key is never exposed to the browser.
//
// Cloudflare Pages → Settings → Variables and secrets:
//   WIX_API_KEY        (secret)  Wix API key with "Wix Media" + "Wix Data" permissions
//   WIX_SITE_ID                  Site ID (from the dashboard URL: manage.wix.com/dashboard/<SITE_ID>/…)
//   WIX_COLLECTION               CMS collection ID (default: embroideryDesign)
//   WIX_MEDIA_FOLDER  (optional) Media Manager folder ID for uploads

const WIX = 'https://www.wixapis.com';
const MAX = { preview: 2 * 1024 * 1024, logo: 10 * 1024 * 1024 };
const MIME_OK = /^image\/(png|jpe?g|svg\+xml|webp)$/;

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const str = (v, n = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const num = v => (Number.isFinite(+v) ? +v : 0);
const safeName = s => str(s, 80).replace(/[^\w.\- ]+/g, '').trim() || 'file';

function decodeDataUrl(d) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(d || '');
  if (!m) return null;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

async function upload(env, dataUrl, fileName, limit) {
  const f = decodeDataUrl(dataUrl);
  if (!f) return null;
  if (!MIME_OK.test(f.mime)) throw new Error('Unsupported file type ' + f.mime);
  if (f.bytes.length > limit) throw new Error('File too large');
  const gen = await fetch(`${WIX}/site-media/v1/files/generate-upload-url`, {
    method: 'POST', headers: { Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' },
    body: JSON.stringify({ mimeType: f.mime, fileName, ...(env.WIX_MEDIA_FOLDER ? { parentFolderId: env.WIX_MEDIA_FOLDER } : {}) }),
  });
  if (!gen.ok) throw new Error('generate-upload-url ' + gen.status + ' ' + (await gen.text()).slice(0, 200));
  const { uploadUrl } = await gen.json();
  const put = await fetch(`${uploadUrl}?filename=${encodeURIComponent(fileName)}`, { method: 'PUT', headers: { 'content-type': f.mime }, body: f.bytes });
  if (!put.ok) throw new Error('upload ' + put.status + ' ' + (await put.text()).slice(0, 200));
  const { file } = await put.json();
  // CMS Image fields take a wix:image:// URI; fall back to the file URL.
  return file?.media?.image?.image || file?.url || '';
}

export async function onRequestPost({ request, env }) {
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'Bad JSON' }, 400); }
  if (!['text', 'upload'].includes(b.mode)) return json({ error: 'Bad mode' }, 400);
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const base = safeName(`${b.capSlug || 'cap'}-${stamp}`);
    const preview = b.preview ? await upload(env, b.preview, `${base}-preview.jpg`, MAX.preview) : '';
    const logo = b.mode === 'upload' && b.logo ? await upload(env, b.logo, `${base}-${safeName(b.uploadName || 'logo.png')}`, MAX.logo) : '';
    const data = {
      title: str(b.title, 200), capName: str(b.capName, 200), capSlug: str(b.capSlug, 200), quantity: num(b.quantity),
      mode: str(b.mode, 20), text: str(b.text, 40), font: str(b.font, 60), thread: str(b.thread, 40),
      size: num(b.size), rotation: num(b.rotation), placement: str(b.placement, 300), locked: !!b.locked,
      uploadName: str(b.uploadName, 120), status: 'New',
      ...(preview ? { preview } : {}), ...(logo ? { logo } : {}),
    };
    const ins = await fetch(`${WIX}/wix-data/v2/items`, {
      method: 'POST', headers: { Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ dataCollectionId: env.WIX_COLLECTION || 'embroideryDesign', dataItem: { data } }),
    });
    if (!ins.ok) throw new Error('cms insert ' + ins.status + ' ' + (await ins.text()).slice(0, 300));
    const out = await ins.json();
    return json({ id: out.dataItem?.id || out.dataItem?._id || '', preview, logo });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

export const onRequestGet = ({ env }) => json({ ok: true, configured: !!(env.WIX_API_KEY && env.WIX_SITE_ID), collection: env.WIX_COLLECTION || 'embroideryDesign' });
