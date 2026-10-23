# DBK Welding Caps – storefront

Static storefront for DBK – Welding Caps, hosted on Cloudflare Pages and connected to Kelly's Wix account through **Wix Headless**. Products, prices, options, images, cart and checkout all come from Wix. There's no build step.

## Status – Phase 1 of 3
- [x] Homepage, colour filters, product grid, mega menu
- [x] Product page with every Wix Stores option (TEXT / SWATCH / FREE_TEXT modifiers), price incl. option surcharges
- [x] Cart (Wix eCommerce current cart) and Wix-hosted checkout redirect
- [ ] Phase 2 – 3D cap builder + embroidery (text, Google Fonts, upload, drag placement, captured preview on the order)
- [ ] Phase 3 – Members (login, saved preferences, special instructions with DBK confirmation, order history, reorder, perks)

## Files
| Path | What |
| --- | --- |
| `index.html`, `product.html`, `thank-you.html` | Pages |
| `js/config.js` | Client ID and data mode – the only settings |
| `js/wix.js` | All Wix calls (Stores Catalog V3, current cart, checkout redirect) + fallback |
| `js/ui.js` | Header, mega menu, cart drawer, footer |
| `js/home.js`, `js/product.js` | Page logic |
| `data/catalog.json` | Exported catalogue, used only if Wix can't be reached |
| `diagnostics.html` | Shows whether the site is LIVE or using the fallback |

## One-time Wix setup (Kelly's dashboard)
1. **Enable Headless:** Wix dashboard → Settings → Headless Settings. The OAuth app with client ID `f7353b9c-…debaf` is already in `js/config.js`.
2. In that OAuth app, add these **allowed domains / redirect URLs**:
   - `https://kellycaps.pages.dev`
   - `http://localhost:8788` (local testing)
3. Check Wix Stores products are **visible** and Wix payments are connected (checkout runs on Wix).
4. Open `https://kellycaps.pages.dev/diagnostics.html` – it should say **LIVE**.

Until step 1 is done the site runs on `data/catalog.json` (same products, local cart, checkout disabled with a note). Set `dataMode: 'live'` in `js/config.js` once Wix is connected so failures show instead of falling back.

## Deploy
Commit the contents of this folder to the repo root. Cloudflare Pages: framework preset **None**, build command empty, output directory `/`. Every push to `main` redeploys.

Local preview: `npx wrangler pages dev .` (or any static server) from this folder.

## Before launch
- Remove `<meta name="robots" content="noindex">` from the pages and the `robots.txt` / `_headers` blocks.
- Point the domain at Cloudflare Pages and add it to the Wix OAuth app's allowed domains.
