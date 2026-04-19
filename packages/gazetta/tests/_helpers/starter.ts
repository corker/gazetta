/**
 * Shared helper for tests that use the starter site.
 * Reads the project-level site.yaml manifest once —
 * targets don't have their own site.yaml.
 */

import { resolve } from 'node:path'
import { createFilesystemProvider } from '../../src/providers/filesystem.js'
import { parseSiteManifest } from '../../src/manifest.js'
import type { SiteManifest } from '../../src/types.js'

export const starterProjectRoot = resolve(import.meta.dirname, '../../../../examples/starter')
export const starterSiteDir = resolve(starterProjectRoot, 'sites/main')
export const starterTargetDir = resolve(starterSiteDir, 'targets/local')
export const starterTemplatesDir = resolve(starterProjectRoot, 'templates')

let cached: SiteManifest | null = null

/** Load the starter's project-level manifest (cached). */
export async function starterManifest(): Promise<SiteManifest> {
  if (cached) return cached
  const storage = createFilesystemProvider(starterSiteDir)
  cached = await parseSiteManifest(storage, 'site.yaml')
  return cached
}
