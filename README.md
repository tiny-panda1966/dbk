# DBK Welding Caps – storefront

Static storefront for DBK – Welding Caps, hosted on Cloudflare Pages and connected to the **Tiny Panda Wix account** (which holds the DBK store) through **Wix Headless**. Products, prices, options, images, cart and checkout all come from Wix. There's no build step.

## Status – Phase 1 of 3
- [x] Homepage, colour filters, product grid, mega menu
- [x] Product page with every Wix Stores option (TEXT / SWATCH / FREE_TEXT modifiers), price incl. option surcharges
- [x] Cart (Wix eCommerce current cart) and Wix-hosted checkout redirect
- [x] Phase 2 – 3D cap builder + embroidery (text, Google Fonts, upload, drag placement, captured preview on the order)
- [x] Phase 3 – Members (Wix login, saved preferences, special instructions with DBK confirmation, order history + reorder, surplus caps)

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
| `account.html`, `js/account.js`, `login-callback.html` | Member account + Wix login return page |
| `functions/api/member.js` | Member data (preferences, orders, surplus) – verifies the member with Wix on every call |
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
| title, embroideryRef, capName, capSlug, mode, text, font, thread, placement, uploadName, status | Text |
| quantity, size, rotation | Number |
| locked | Boolean |
| preview | **Image** – the 3D cap with the embroidery in place |
| logo | **Image** – the customer's uploaded logo (PNG/JPG/SVG) |

**3. Upload function – `functions/api/embroidery.js`.** Cloudflare deploys this automatically as `/api/embroidery`. It uploads the preview and logo to the **Wix Media Manager**, then inserts the CMS item with real Image fields. It runs on the server because visitor logins can't upload media. Add these in Cloudflare Pages → Settings → Variables and secrets, then redeploy:
- `WIX_API_KEY` (encrypt): Wix account → API Keys → create a key for this site with **Wix Media** and **Wix Data** (CMS) permissions.
- `WIX_SITE_ID`: the ID in the dashboard URL `manage.wix.com/dashboard/<SITE_ID>/…`
- `WIX_COLLECTION`: `embroideryDesigns`
- `WIX_MEDIA_FOLDER` (optional): Media Manager folder ID, e.g. "Embroidery uploads".

The CMS item ID is written on the order line as "Design ref". Each embroidered cap also gets a short **Embroidery ref** (e.g. `K7F2QX`) in its notes field and on its embroidery line, so it's always a separate cart line and Kelly can match cap ⇄ embroidery ⇄ CMS item. If the function isn't configured, the site saves the text fields only (no images). That fallback needs *Add content – Anyone* on the collection.

`/diagnostics.html` shows whether the embroidery product and CMS module were found.

## Phase 3 setup – members
**1. Login.** Members app installed ✔. In the Headless OAuth app add the redirect URL **`https://dbk-brk.pages.dev/login-callback.html`** (and the live domain later). Login uses the Wix-hosted page; set sign-up to email + password in Members settings.

**2. Wix API key permissions.** The key in `WIX_API_KEY` also needs **Members (read)** and **eCommerce – Orders (read)**, on top of Wix Media + Wix Data.

**3. CMS collection `memberPreferences`.** Permissions: all **Admin** (only the server function reads/writes). One item per member:
| Field | Type | Notes |
| --- | --- | --- |
| memberId, email | Text | set by the site |
| capSize, linerColour, linerType, capLength, batting, billSize | Text | choice names, e.g. `7 1/4"`, `Black Liner` |
| font, thread | Text | embroidery font + thread colour |
| autoApply | Boolean | fill preferences in automatically |
| instructions | Text | customer's own words |
| instructionsConfirmed | Text | **Kelly writes this** – the clear wording used on every order |
| instructionsStatus | Text | `awaiting` (set by site when the customer changes their words) → Kelly sets `confirmed` |

**4. Member surplus caps = Wix automatic discounts.** In the Wix dashboard go to Marketing → Discounts → Automatic discounts and create a rule per sale (e.g. `memberSale`): apply to **specific products**, set the % (or amount / fixed price), and limit **who it applies to** to members (labelled contacts / segment). Any **active** rule whose name contains `member` (change with Cloudflare variable `MEMBER_RULE_MATCH`) appears as surplus caps on the member account page and as a member price on those product pages. Wix applies the discount itself at checkout, so the site and checkout always match; guests pay full price. The Wix API key needs the **Manage eCommerce** permission to read discount rules. The old `memberSurplus` collection and `MEMBER_COUPON` variable are no longer used and can be deleted.

Check `/diagnostics.html` → "Member function" should show `configured: true`.

## Admin – `/admin.html`
Log in with an admin account (default **tiny.panda@tiny-panda.com**; set `ADMIN_EMAILS` in Cloudflare as a comma-separated list to change it). Admins also see an **Admin** button on their account page.
- **Special instructions** (opens first, with a count of how many are waiting): every member instruction from `memberPreferences`, filtered by Awaiting / Confirmed / All. Kelly reads what the customer wrote, types the clear wording (or "Use customer's words"), and clicks **Confirm**. That sets `instructionsConfirmed` + `instructionsStatus = confirmed`, and it goes on every order from that customer. "Mark as awaiting" reopens one. If the customer changes their words, it goes back to Awaiting automatically.
- **Member discounts** (read-only): lists the Wix automatic discount rules, which caps each covers, the member price and whether it's live. Edit them in the Wix dashboard.
- `functions/api/admin.js` checks the Wix login and admin email on every request, so non-admins get "No access".

## Contact, FAQs, policy, social
- **Contact (`contact.html`):** Name, Email, Phone, Message → **Wix Forms**. In Wix create a form with those 4 fields, then put its **form ID** and each field's **key** in `contact` in `js/config.js`. Submissions appear in Wix Forms/Inbox with Wix's normal email notification. If the form isn't set up or fails, the site opens the customer's email app addressed to Kelly instead.
- **FAQs (`faq.html`):** read from the CMS collection **`faqs`** (fields: `category`, `question`, `answer` – Text; `sortOrder` – Number; permission **Read: Anyone**). Import `faqs-import.csv` (14 questions, answers blank) and fill in the answers. Questions without an answer show "contact us". Until the collection exists, `data/faqs.json` is used.
- **Shipping & Returns:** pop-up from the footer (and FAQ page); also opens from any URL ending `#shipping-returns`.
- **Social:** set `social.facebook` / `social.instagram` in `js/config.js`; icons appear in the footer only once a URL is set.

## Categories, search and hidden products
- Category tabs on the homepage and links in the menu come from **Wix Stores categories**, shown in the order of `categories` in `js/config.js` (names matched loosely, so "Skull Caps" matches "Skulls Caps"). Categories with no visible products are skipped.
- Only products in `builderCategory` ("Welding Caps") get the 3D builder and embroidery. Other products get a normal product page with photos and options.
- Search: header button (or press `/`) for instant results; the homepage search filters the grid by name, SKU and colour.
- **Custom Embroidery** (`embroidery.productId`) and anything in `hiddenProductIds` never appears in lists, search or menus, and its product page shows "not found". It's still added to the cart behind the scenes.

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


## Popular prints (mega menu)
Admin → **Popular prints** picks the four welding caps shown under "Popular prints" in the Welding caps menu. Saved to the Wix CMS collection **`siteSettings`** (Text fields `key`, `value`; permission **Read: Anyone**), item key `popularPrints`. If nothing is saved, the built-in featured caps are shown. Optional Cloudflare variable `WIX_SETTINGS_COLLECTION` to rename the collection.

## Product info sections
Each product's Wix Stores **info sections** are shown on its product page as expandable sections. If Wix Headless returns none (e.g. on the test site, where info sections weren't imported), they come from **`data/info-sections.json`**, built from DBK's exported info sections and product list (9 sections, 2,230 products, matched by product name). On Kelly's own Wix account the live sections are used. The DBK returns summary is added only when the product has no info section about returns, refunds or exchanges.

## Stitch colours
Caps with **"Solid"** in the name show a Stitch colour picker using `stitchColours` in `js/config.js` (names must match the embroidery thread colours). The cap's own colour is left out. The chosen colour is added to the cap's order notes.
