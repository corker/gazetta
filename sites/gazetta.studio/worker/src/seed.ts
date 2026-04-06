/**
 * Seed script: pre-renders the gazetta.studio site and uploads to R2.
 * Usage: npx tsx src/seed.ts
 *
 * Uses wrangler r2 object put to upload files to the R2 bucket.
 */

import { resolve, join } from 'node:path'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createFilesystemProvider, loadSite, resolvePage, renderComponent, resetScopeCounter } from 'gazetta'
import type { StorageProvider } from 'gazetta'

const siteDir = resolve(import.meta.dirname, '../..')
const tmpDir = resolve(import.meta.dirname, '../.seed-output')
const bucketName = 'gazetta-studio-site'

async function seed() {
  const storage = createFilesystemProvider()
  const site = await loadSite(siteDir, storage)

  // Clean tmp dir
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  console.log(`\n  Pre-rendering ${site.manifest.name}...`)
  console.log(`  Pages: ${[...site.pages.keys()].join(', ')}`)
  console.log(`  Fragments: ${[...site.fragments.keys()].join(', ')}\n`)

  const files: Array<{ key: string; content: string }> = []

  for (const [pageName, page] of site.pages) {
    console.log(`  Rendering page: ${pageName}`)
    resetScopeCounter()
    const resolved = await resolvePage(pageName, site)

    // Render each top-level child component
    const componentKeys: string[] = []
    for (let i = 0; i < resolved.children.length; i++) {
      const child = resolved.children[i]
      const childName = page.components![i]
      const key = childName.startsWith('@') ? childName : `${pageName}/${childName}`

      const rendered = await renderComponent(child)
      files.push({ key: `components/${key}.json`, content: JSON.stringify({
        html: rendered.html,
        css: rendered.css,
        js: rendered.js,
        head: rendered.head,
      }) })
      componentKeys.push(key)
      console.log(`    component: ${key}`)
    }

    // Page manifest
    files.push({ key: `pages/${pageName}.json`, content: JSON.stringify({
      route: page.route,
      metadata: page.metadata,
      components: componentKeys,
    }) })

    // Page layout (global CSS from page template)
    const childOutputs = await Promise.all(resolved.children.map(c => renderComponent(c)))
    const pageOutput = await resolved.template({ content: resolved.content, children: childOutputs })
    files.push({ key: `pages/${pageName}.layout.json`, content: JSON.stringify({
      css: pageOutput.css,
      head: pageOutput.head,
    }) })
  }

  // Site manifest
  files.push({ key: 'site.json', content: JSON.stringify({
    name: site.manifest.name,
    version: site.manifest.version,
  }) })

  console.log(`\n  ${files.length} files to upload\n`)

  // Write to tmp dir, then upload with wrangler
  for (const { key, content } of files) {
    const filePath = join(tmpDir, key)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content)

    console.log(`  uploading: ${key}`)
    execSync(`npx wrangler r2 object put "${bucketName}/${key}" --file "${filePath}" --remote`, {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'pipe',
    })
  }

  // Clean up
  rmSync(tmpDir, { recursive: true, force: true })

  console.log(`\n  Done! ${files.length} files uploaded to R2 bucket "${bucketName}"\n`)
}

seed().catch(err => {
  console.error(`\n  Error: ${err.message}\n`)
  process.exit(1)
})
