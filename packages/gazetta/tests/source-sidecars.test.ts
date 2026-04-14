import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createSourceSidecarWriter } from '../src/source-sidecars.js'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import type { TemplateInfo } from '../src/templates-scan.js'
import { tempDir } from './_helpers/temp.js'

const root = tempDir('source-sidecars-test-' + Date.now())
const siteDir = join(root, 'sites/main')

const storage = createFilesystemProvider()

async function reset() {
  await rm(root, { recursive: true, force: true })
  await mkdir(join(siteDir, 'pages/home'), { recursive: true })
  await writeFile(join(siteDir, 'pages/home/page.json'), JSON.stringify({
    template: 'page-default',
    content: { title: 'Hello' },
    components: ['@header', 'hero'],
  }))
  await mkdir(join(siteDir, 'fragments/header'), { recursive: true })
  await writeFile(join(siteDir, 'fragments/header/fragment.json'), JSON.stringify({
    template: 'header-layout',
    components: [],
  }))
}

beforeEach(reset)
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

const fakeScan = async (): Promise<TemplateInfo[]> => [
  { name: 'page-default', hash: 'aaaaaaaa', valid: true, errors: [], files: [] },
  { name: 'header-layout', hash: 'bbbbbbbb', valid: true, errors: [], files: [] },
]

describe('createSourceSidecarWriter', () => {
  it('writes all three sidecar kinds for a page', async () => {
    const writer = createSourceSidecarWriter({ storage, siteDir, scanTemplates: fakeScan })
    await writer.writeFor('page', 'home')

    const entries = await readdir(join(siteDir, 'pages/home'))
    const hashSidecar = entries.find(e => /^\.[0-9a-f]{8}\.hash$/.test(e))
    expect(hashSidecar).toBeDefined()
    expect(entries).toContain('.uses-header')
    expect(entries).toContain('.tpl-page-default')
  })

  it('writes sidecars for a fragment', async () => {
    const writer = createSourceSidecarWriter({ storage, siteDir, scanTemplates: fakeScan })
    await writer.writeFor('fragment', 'header')

    const entries = await readdir(join(siteDir, 'fragments/header'))
    expect(entries.some(e => /^\.[0-9a-f]{8}\.hash$/.test(e))).toBe(true)
    expect(entries).toContain('.tpl-header-layout')
  })

  it('silently skips when manifest is missing', async () => {
    const writer = createSourceSidecarWriter({ storage, siteDir, scanTemplates: fakeScan })
    await expect(writer.writeFor('page', 'does-not-exist')).resolves.toBeUndefined()
  })

  it('invalidate() forces a rescan on next write', async () => {
    let calls = 0
    const scan = async () => { calls++; return fakeScan() }
    const writer = createSourceSidecarWriter({ storage, siteDir, scanTemplates: scan })

    await writer.writeFor('page', 'home')
    await writer.writeFor('fragment', 'header')
    expect(calls).toBe(1) // cached

    writer.invalidate()
    await writer.writeFor('page', 'home')
    expect(calls).toBe(2)
  })
})
