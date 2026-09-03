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
  server: {
    url: 'https://school-os-j4bn.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
