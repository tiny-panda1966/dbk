# DBK Welding Caps – storefront

Static storefront for DBK – Welding Caps, hosted on Cloudflare Pages and connected to the **Tiny Panda Wix account** (which holds the DBK store) through **Wix Headless**. Products, prices, options, images, cart and checkout all come from Wix. There's no build step.

## Status – Phase 1 of 3
- [x] Homepage, colour filters, product grid, mega menu
- [x] Product page with every Wix Stores option (TEXT / SWATCH / FREE_TEXT modifiers), price incl. option surcharges
- [x] Cart (Wix eCommerce current cart) and Wix-hosted checkout redirect
- [x] Phase 2 – 3D cap builder + embroidery (text, Google Fonts, upload, drag placement, captured preview on the order)
- [ ] Phase 3 – Members (login, saved preferences, special instructions with DBK confirmation, order history, reorder, perks)

## Files
| Path | What |
| --- | --- |
| `index.html`, `product.html`, `thank-you.html` | Pages |
| `js/config.js` | Client ID and data mode – the only settings |
| `js/wix.js` | All Wix calls (Stores Catalog V3, current cart, checkout redirect) + fallback |
| `js/ui.js` | Header, mega menu, cart drawer, footer |
| `js/home.js`, `js/product.js` | Page logic |
| `js/builder.js`, `js/cap3d.js`, `vendor/three.module.min.js` | 3D cap builder and embroidery designer |
| `data/catalog.json` | Exported catalogue, used only if Wix can't be reached |
| `diagnostics.html` | Shows whether the site is LIVE or using the fallback |

## One-time Wix setup (Tiny Panda Wix dashboard)
1. **Enable Headless:** Wix dashboard → Settings → Headless Settings. The OAuth app with client ID `f7353b9c-…debaf` is already in `js/config.js`.
2. In that OAuth app, add these **allowed domains / redirect URLs**:
   - `https://dbk-brk.pages.dev`
   - `http://localhost:8788` (local testing)
3. Check Wix Stores products are **visible** and Wix payments are connected (checkout runs on Wix).
4. Open `https://dbk-brk.pages.dev/diagnostics.html` – it should say **LIVE**.

Until step 1 is done the site runs on `data/catalog.json` (same products, local cart, checkout disabled with a note). Set `dataMode: 'live'` in `js/config.js` once Wix is connected so failures show instead of falling back.

## Phase 2 setup – embroidery
**1. Embroidery product (charges the customer).** Current setup: **Custom Embroidery** (ID `db58675b-…`, set in `js/config.js`) with the product option **Embroidery options** (None $0 / Name | Word $10 / Logo | Image $20, one variant each) and the free-text modifier **Design Details** (500 chars). The site reads the variant prices and adds the matching variant to the cart. Alternative setup that also works: In Wix Stores create (or reuse) a product named e.g. **"Custom Embroidery"** with:
- a choice option with choices **"Name | Word"** and **"Logo | Image"** (price set on the product + each choice's added price)
- a free-text option, e.g. **"Embroidery details"**, max 500 characters

The site finds it by name (anything containing "Embroidery" that isn't a cap/fabric), or set `embroidery.productSlug` in `js/config.js`. Each embroidered cap adds this product as a second cart line, with the full spec in the free-text field: cap, text/font or logo file, thread, size, rotation, placement and design ref.
If no embroidery product exists, the spec is added to the cap's first notes field instead and no embroidery charge is made.

**2. CMS collection – `embroideryDesigns`** (stores what the customer saw). Permissions: *Add content – Admin*, *View – Admin*. Fields:
| Field | Type |
| --- | --- |
| title, capName, capSlug, mode, text, font, thread, placement, uploadName, status | Text |
| quantity, size, rotation | Number |
| locked | Boolean |
| preview | **Image** – the 3D cap with the embroidery in place |
| logo | **Image** – the customer's uploaded logo (PNG/JPG/SVG) |

**3. Upload function – `functions/api/embroidery.js`.** Cloudflare deploys this automatically as `/api/embroidery`. It uploads the preview and logo to the **Wix Media Manager**, then inserts the CMS item with real Image fields. It runs on the server because visitor logins can't upload media. Add these in Cloudflare Pages → Settings → Variables and secrets, then redeploy:
- `WIX_API_KEY` (encrypt): Wix account → API Keys → create a key for this site with **Wix Media** and **Wix Data** (CMS) permissions.
- `WIX_SITE_ID`: the ID in the dashboard URL `manage.wix.com/dashboard/<SITE_ID>/…`
- `WIX_COLLECTION`: `embroideryDesigns`
- `WIX_MEDIA_FOLDER` (optional): Media Manager folder ID, e.g. "Embroidery uploads".

The CMS item ID is written on the order line as "Design ref". If the function isn't configured, the site saves the text fields only (no images). That fallback needs *Add content – Anyone* on the collection.

`/diagnostics.html` shows whether the embroidery product and CMS module were found.

## Deploy
Commit the contents of this folder to the repo root. Cloudflare Pages: framework preset **None**, build command empty, output directory `/`. Every push to `main` redeploys.

Local preview: `npx wrangler pages dev .` (or any static server) from this folder.

## Moving to Kelly's Wix account (after testing)
The site runs on the Tiny Panda Wix account while it's being tested. To move it to Kelly's account:
1. In Kelly's Wix dashboard, enable Headless and create an OAuth app. Add the live domain (and `https://dbk-brk.pages.dev` if still used) as allowed domains / redirect URLs.
2. Replace `clientId` in `js/config.js` with the new Client ID, commit, and Cloudflare redeploys.
3. Check products and options match Kelly's store (same option names, e.g. "Cap Size", "Bill Size"), and her payments are connected.
4. Open `/diagnostics.html` – it should say LIVE – then place a test order.
5. Phase 3 only: recreate the CMS collections (member preferences, special instructions) in Kelly's site with the same names and permissions.

No other code changes are needed; everything account-specific is in `js/config.js`.

## Before launch
- Remove `<meta name="robots" content="noindex">` from the pages and the `robots.txt` / `_headers` blocks.
- Point the domain at Cloudflare Pages and add it to the Wix OAuth app's allowed domains.
