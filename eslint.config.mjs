// eslint.config.mjs
//
// Next.js 16 removed the `next lint` command entirely (and `next build`
// no longer lints as a side effect either) - this repo previously had
// no ESLint config file at all, so `next lint` was failing immediately
// on every run regardless of what changed. This is the direct
// replacement, following the current officially documented setup
// (nextjs.org/docs/app/api-reference/config/eslint): ESLint 9's flat
// config format, using eslint-config-next's core-web-vitals + the
// TypeScript-specific rule set (this is a TypeScript project).
//
// Run with: npm run lint (or npm run lint:fix to auto-fix what's fixable)

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    // eslint-config-next's own defaults
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Repo-specific: generated/vendored, not source we own
    'android/**',
    'node_modules/**',
    'public/**',
  ]),
])

export default eslintConfig
