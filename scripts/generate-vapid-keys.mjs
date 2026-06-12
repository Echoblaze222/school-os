#!/usr/bin/env node
// scripts/generate-vapid-keys.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Run once to generate your VAPID key pair. Add the output to .env.local
// and Vercel environment variables.
//
// Usage:
//   node scripts/generate-vapid-keys.mjs
//
// Requires web-push to be installed:
//   npm install web-push
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('\n✅ VAPID Keys Generated — add these to .env.local and Vercel:\n')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`VAPID_EMAIL=your-email@schoolos.app`)
console.log('\n⚠️  NEVER commit VAPID_PRIVATE_KEY to git.')
console.log('   NEXT_PUBLIC_VAPID_PUBLIC_KEY is safe to expose (it\'s a public key).\n')
