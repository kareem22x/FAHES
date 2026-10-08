import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'deepseek-harness/**',
    '.shots*/**',
    'next-env.d.ts',
    // The React Native app is a separate toolchain with its own lint config.
    // This config loads `eslint-config-next`, whose rules do not apply to it.
    'mobile/**',
  ]),
])
