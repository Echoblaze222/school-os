import type { CapacitorConfig } from '@capacitor/cli'

// This app is not statically exported into the native shell — SchoolOS
// relies too heavily on Next.js server components, API routes, and
// middleware-based Supabase auth for that to be practical. Instead,
// `server.url` points the native WebView straight at the live deployment,
// so everything server-side keeps working exactly as it does on the web.
//
// If the production domain changes, this is the only line that needs to
// change — update it and run `npx cap sync android` again.
const config: CapacitorConfig = {
  appId: 'com.schoolos.app',
  appName: 'SchoolOS',
  webDir: 'www',
  // Colour of the WebView behind the page until the first paint. Matches the
  // app's dark theme (--bg-base) so launch doesn't flash white.
  backgroundColor: '#080C14',
  server: {
    url: 'https://school-os-j4bn.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    // Local page (www/offline.html, bundled in the APK) shown instead of
    // Android's raw "Webpage not available" screen when the site can't be
    // loaded. Keep APP_URL inside that file in sync with server.url above.
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
