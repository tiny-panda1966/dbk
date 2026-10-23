// Cloudflare Pages Function: POST /api/embroidery
// Uploads the 3D placement preview (+ customer logo) to the Wix Media Manager and saves the design to the Wix CMS.
// Runs server-side so the Wix API key is never exposed to the browser.
//
// Cloudflare Pages → Settings → Variables and secrets:
//   WIX_API_KEY        (secret)  Wix API key with "Wix Media" + "Wix Data" permissions
//   WIX_SITE_ID                  Site ID (from the dashboard URL: manage.wix.com/dashboard/<SITE_ID>/…)
//   WIX_COLLECTION               CMS collection ID (default: embroideryDesigns)
//   WIX_MEDIA_FOLDER  (optional) Media Manager folder ID for uploads

const WIX = 'https://www.wixapis.com';
const MAX = { preview: 2 * 1024 * 1024, logo: 10 * 1024 * 1024 };
const MIME_OK = /^image\/(png|jpe?g|svg\+xml|webp)$/;

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const str = (v, n = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const num = v => (Number.isFinite(+v) ? +v : 0);
const slugify = s => str(s, 200).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// short, readable file name that keeps its extension: "<cap>-<yyyymmdd-hhmm>-<label>.<ext>"
const fileName = (cap, label, ext) => `${slugify(cap).slice(0, 40) || 'cap'}-${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}-${slugify(label).slice(0, 24) || 'file'}.${ext}`;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
// CMS Image fields expect: wix:image://v1/<mediaId>/<fileName>#originWidth=<w>&originHeight=<h>
function wixImage(file) {
  const img = file?.media?.image?.image ?? file?.media?.image ?? file;
  if (typeof img === 'string' && img.startsWith('wix:image://')) return img;
  const o = typeof img === 'object' && img ? img : {};
  const id = o.id || file?.id || (/media\/([^/?#]+)/.exec(o.url || file?.url || '') || [])[1];
  if (!id) return o.url || file?.url || '';
  const name = encodeURIComponent(o.filename || file?.displayName || id);
  const w = o.width || file?.media?.image?.width, h = o.height || file?.media?.image?.height;
  return `wix:image://v1/${id}/${name}${w && h ? `#originWidth=${w}&originHeight=${h}` : ''}`;
}

function decodeDataUrl(d) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(d || '');
  if (!m) return null;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

async function upload(env, dataUrl, cap, label, limit) {
  const f = decodeDataUrl(dataUrl);
  if (!f) return null;
  if (!MIME_OK.test(f.mime)) throw new Error('Unsupported file type ' + f.mime);
  if (f.bytes.length > limit) throw new Error('File too large');
  const name = fileName(cap, label, EXT[f.mime] || 'png');
  const gen = await fetch(`${WIX}/site-media/v1/files/generate-upload-url`, {
    method: 'POST', headers: { Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' },
    body: JSON.stringify({ mimeType: f.mime, fileName: name, ...(env.WIX_MEDIA_FOLDER ? { parentFolderId: env.WIX_MEDIA_FOLDER } : {}) }),
  });
  if (!gen.ok) throw new Error('generate-upload-url ' + gen.status + ' ' + (await gen.text()).slice(0, 200));
  const { uploadUrl } = await gen.json();
  const put = await fetch(`${uploadUrl}?filename=${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'content-type': f.mime }, body: f.bytes });
  if (!put.ok) throw new Error('upload ' + put.status + ' ' + (await put.text()).slice(0, 200));
  const { file } = await put.json();
  return wixImage(file);
}

export async function onRequestPost({ request, env }) {
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'Bad JSON' }, 400); }
  if (!['text', 'upload'].includes(b.mode)) return json({ error: 'Bad mode' }, 400);
  try {
    const cap = b.capSlug || b.capName || 'cap';
    const preview = b.preview ? await upload(env, b.preview, cap, 'preview', MAX.preview) : '';
    const logo = b.mode === 'upload' && b.logo ? await upload(env, b.logo, cap, 'logo', MAX.logo) : '';
    const data = {
      title: str(b.title, 200), embroideryRef: str(b.embroideryRef, 12), capName: str(b.capName, 200), capSlug: str(b.capSlug, 200), quantity: num(b.quantity),
      mode: str(b.mode, 20), text: str(b.text, 40), font: str(b.font, 60), thread: str(b.thread, 40),
      size: num(b.size), rotation: num(b.rotation), placement: str(b.placement, 300), locked: !!b.locked,
      uploadName: str(b.uploadName, 120), status: 'New',
      ...(preview ? { preview } : {}), ...(logo ? { logo } : {}),
    };
    const ins = await fetch(`${WIX}/wix-data/v2/items`, {
      method: 'POST', headers: { Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ dataCollectionId: env.WIX_COLLECTION || 'embroideryDesigns', dataItem: { data } }),
    });
    if (!ins.ok) throw new Error('cms insert ' + ins.status + ' ' + (await ins.text()).slice(0, 300));
    const out = await ins.json();
    return json({ id: out.dataItem?.id || out.dataItem?._id || '', preview, logo });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

export const onRequestGet = ({ env }) => json({ ok: true, configured: !!(env.WIX_API_KEY && env.WIX_SITE_ID), collection: env.WIX_COLLECTION || 'embroideryDesigns' });
