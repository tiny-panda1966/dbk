// Site configuration. TEST: Tiny Panda Wix account. At handover, swap clientId for Kelly's OAuth app (see README).
export const CONFIG = {
  // Wix dashboard → Settings → Headless Settings → OAuth app → Client ID
  clientId: 'f7353b9c-4474-4921-ae11-5ccd094debaf',
  // 'auto'     – use Wix Headless; if it can't be reached, use the exported catalogue (data/catalog.json)
  // 'live'     – Wix Headless only (show an error if it fails)
  // 'fallback' – exported catalogue only (no live cart / checkout)
  dataMode: 'auto',
  currency: 'USD',
  // Wix Stores app id, fixed by Wix for every Stores catalogue
  storesAppId: '215238eb-22a5-4c36-9e7b-e7c08025e04e',
  thankYouPath: '/thank-you.html',
  // Products shown per "Load more" on the homepage
  pageSize: 12,
  // Footer social icons – shown only when a URL is set
  social: { facebook: '', instagram: '' },
  contact: {
    phone: '979-922-5053', email: 'dbkweldingcaps@outlook.com',
    // Wix Forms: create a form in the dashboard (Name, Email, Phone, Message), then paste its form ID and field keys here
    formId: '46c6780c-460a-45c7-86e1-bc2b8d8a822c',
    fields: { name: 'first_name_8edf', email: 'email_03ba', phone: 'phone_2e27', message: 'message' },
  },
  // Wix CMS collection for FAQs (fields: category, question, answer, sortOrder; Read permission: Anyone)
  faqCollection: 'faqs',
  // Every visible Wix Stores category with products appears on the site automatically.
  // This list only sets the order of the main ones (others follow A–Z). Matched case/plural-insensitive.
  categories: ['Welding Caps', 'Fabric', 'Custom Items', 'Embroidery Designs', 'Beanies', 'Accessories', 'Skull Caps', 'PDF Patterns'],
  // Wix categories never shown on the site (Wix's built-in "All Products" plus any hidden helper categories)
  hiddenCategories: ['All Products', 'Surplus', 'Embroidery enabled', 'Vinyl enabled'],
  // Stitch colours offered on caps with "Solid" in the name – names must match the embroidery thread colours
  stitchColours: ['Black', 'Black (Charcoal)', 'Blue', 'Brown', 'Cream', 'Gray', 'Green', 'Green (Lime)', 'Orange', 'Pink', 'Purple', 'Red', 'White', 'Yellow'],
  // Wix CMS collection for admin settings (fields: key, value – Text; permission Read: Anyone). Holds "popularPrints".
  settingsCollection: 'siteSettings',
  // Products in this category get the 3D builder + embroidery
  builderCategory: 'Welding Caps',
  // Never listed, searched or linked on the site (still usable in the cart). The embroidery product is added automatically.
  hiddenProductIds: [],
  embroidery: {
    // Wix product that charges for embroidery, with a choice option (e.g. "Name | Word" / "Logo | Image")
    // and a free-text option that receives the design details. Leave '' to find it by name ("Embroidery …").
    productSlug: '',
    // Wix product ID of "Custom Embroidery" (takes priority over slug / name matching)
    productId: '88f673d4-97b0-49fb-820c-bbf2fa545215',
    // Wix CMS collection that stores each design + placement preview (see README)
    designsCollection: 'embroideryDesigns',
    // Cloudflare Pages Function that uploads images to the Wix Media Manager and saves the CMS item
    designsEndpoint: '/api/embroidery',
    // Shown when no embroidery product is found (preview / fallback mode)
    fallbackPrices: { text: 10, logo: 20 },
  },
};
