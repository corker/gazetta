/**
 * Seed script: pre-renders the gazetta.studio site and uploads to R2.
 * Usage: cd sites/gazetta.studio/worker && npx tsx src/seed.ts
 */

import { resolve, join } from 'node:path'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createFilesystemProvider, loadSite } from 'gazetta'
import { publishPageRendered, publishFragmentRendered, publishSiteManifest, publishFragmentIndex } from 'gazetta'

const siteDir = resolve(import.meta.dirname, '../..')
const tmpDir = resolve(import.meta.dirname, '../.seed-output')
const bucketName = 'gazetta-studio-site'

async function seed() {
  const storage = createFilesystemProvider()

  // Use a local filesystem provider as the target — we'll upload files to R2 after
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  const targetStorage = createFilesystemProvider(tmpDir)

  const site = await loadSite(siteDir, storage)

  console.log(`\n  Pre-rendering ${site.manifest.name}...`)
  console.log(`  Pages: ${[...site.pages.keys()].join(', ')}`)
  console.log(`  Fragments: ${[...site.fragments.keys()].join(', ')}\n`)

  // Publish all fragments
  for (const fragName of site.fragments.keys()) {
    const { files } = await publishFragmentRendered(fragName, storage, siteDir, targetStorage)
    console.log(`  fragment: ${fragName} (${files} files)`)
  }

  // Publish all pages
  for (const pageName of site.pages.keys()) {
    const { files } = await publishPageRendered(pageName, storage, siteDir, targetStorage)
    console.log(`  page: ${pageName} (${files} files)`)
  }

  // Publish site manifest + fragment index
  await publishSiteManifest(storage, siteDir, targetStorage)
  await publishFragmentIndex(storage, siteDir, targetStorage)
  console.log(`  site.json + fragment index`)

  // Upload all files to R2
  const files = collectFiles(tmpDir, '')
  console.log(`\n  ${files.length} files to upload\n`)

  for (const { key, localPath } of files) {
    console.log(`  uploading: ${key}`)
    execSync(`npx wrangler r2 object put "${bucketName}/${key}" --file "${localPath}" --remote`, {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'pipe',
    })
  }

  rmSync(tmpDir, { recursive: true, force: true })
  console.log(`\n  Done! ${files.length} files uploaded to R2 bucket "${bucketName}"\n`)
}

import { readdirSync, statSync } from 'node:fs'

function collectFiles(dir: string, prefix: string): Array<{ key: string; localPath: string }> {
  const files: Array<{ key: string; localPath: string }> = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const key = prefix ? `${prefix}/${entry}` : entry
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath, key))
    } else {
      files.push({ key, localPath: fullPath })
    }
  }
  return files
}

seed().catch(err => {
  console.error(`\n  Error: ${err.message}\n${err.stack}\n`)
  process.exit(1)
})
