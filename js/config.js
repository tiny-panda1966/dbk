// Site configuration. The only values Kelly's Wix account needs to supply.
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
};
