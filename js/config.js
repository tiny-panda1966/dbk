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
  embroidery: {
    // Wix product that charges for embroidery, with a choice option (e.g. "Name | Word" / "Logo | Image")
    // and a free-text option that receives the design details. Leave '' to find it by name ("Embroidery …").
    productSlug: '',
    // Wix product ID of "Custom Embroidery" (takes priority over slug / name matching)
    productId: 'db58675b-969f-411b-b054-1e79c66c56a9',
    // Wix CMS collection that stores each design + placement preview (see README)
    designsCollection: 'embroideryDesigns',
    // Cloudflare Pages Function that uploads images to the Wix Media Manager and saves the CMS item
    designsEndpoint: '/api/embroidery',
    // Shown when no embroidery product is found (preview / fallback mode)
    fallbackPrices: { text: 10, logo: 20 },
  },
};
