#!/usr/bin/env tsx
/**
 * يرفع متغيّرات `.env.local` إلى مشروع Vercel — بلا طباعة أي قيمة سرّية.
 *
 * سبب وجود السكربت: `vercel env add` يقرأ القيمة من stdin، وتشغيله 23 مرة
 * يدويًا داخل Bash عرضة للأخطاء (ترتيب، ترميز، أسطر). هنا يُقرأ الملف مرة
 * واحدة، وتُمرَّر كل قيمة عبر stdin، ويُطبع اسم المفتاح فقط.
 *
 * ⚠️ لا يطبع القيم إطلاقًا — المخرج يحمل أسماء المتغيّرات ونتائجها فقط.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PROJECT = process.argv[2]
const ENVIRONMENTS = ['production', 'preview', 'development']
if (!PROJECT) {
  console.error('usage: node push-env.mjs <vercel-project>')
  process.exit(1)
}

/** المتغيّرات التي لا يجب رفعها: أدوات محلية بحتة. */
const SKIP = new Set(['VERCEL_OIDC_TOKEN', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL'])

const entries = readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .filter((line) => /^[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')]
  })
  .filter(([key]) => !SKIP.has(key))

console.log(`رفع ${entries.length} متغيّرًا إلى ${PROJECT}\n`)

let ok = 0
const failed = []

for (const [key, value] of entries) {
  let added = false
  for (const environment of ENVIRONMENTS) {
    // `--force` يحدّث إن كان موجودًا بدل أن يفشل.
    const result = spawnSync(
      'vercel',
      ['env', 'add', key, environment, '--force', '--project', PROJECT, '--yes'],
      { input: value + '\n', encoding: 'utf8', env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' } },
    )
    if (result.status !== 0) {
      failed.push(`${key} (${environment}): ${(result.stderr || result.stdout || '').trim().slice(0, 120)}`)
    } else {
      added = true
    }
  }
  // يُطبع اسم المفتاح وطوله فقط — لا القيمة.
  console.log(`${added ? 'OK ' : 'ERR'} ${key.padEnd(46)} (${String(value.length).padStart(3)} حرفًا)`)
  if (added) ok++
}

console.log(`\nنجح: ${ok}/${entries.length}`)
if (failed.length > 0) {
  console.log('\nإخفاقات:')
  for (const f of failed) console.log('  -', f)
  process.exit(1)
}
