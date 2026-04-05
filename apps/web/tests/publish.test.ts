import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { createFilesystemProvider, createAzureBlobProvider } from '@gazetta/renderer'
import { publishItems, resolveDependencies } from '../src/server/publish.js'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')
const stagingDir = resolve(import.meta.dirname, '../../../dist/test-staging')

describe('publish service', () => {
  describe('filesystem to filesystem', () => {
    const source = createFilesystemProvider()
    const target = createFilesystemProvider(stagingDir)

    afterAll(async () => {
      await rm(stagingDir, { recursive: true, force: true })
    })

    it('publishes a page with dependencies', async () => {
      const allItems = await resolveDependencies(source, starterDir, ['pages/home'])
      expect(allItems).toContain('pages/home')
      expect(allItems).toContain('templates/page-default')
      expect(allItems).toContain('templates/hero')
      expect(allItems).toContain('fragments/header')
      expect(allItems).toContain('fragments/footer')

      const { copiedFiles } = await publishItems(source, starterDir, target, '', allItems)
      expect(copiedFiles).toBeGreaterThan(10)

      // Verify files exist on target
      expect(await target.exists('pages/home/page.yaml')).toBe(true)
      expect(await target.exists('templates/hero/index.ts')).toBe(true)
      expect(await target.exists('fragments/header/fragment.yaml')).toBe(true)
      expect(await target.exists('site.yaml')).toBe(true)
    })

    it('publishes a fragment', async () => {
      const allItems = await resolveDependencies(source, starterDir, ['fragments/header'])
      expect(allItems).toContain('fragments/header')
      expect(allItems).toContain('templates/header-layout')
      expect(allItems).toContain('templates/logo')
      expect(allItems).toContain('templates/nav')

      const { copiedFiles } = await publishItems(source, starterDir, target, '', allItems)
      expect(copiedFiles).toBeGreaterThan(5)
    })

    it('resolves nested component dependencies', async () => {
      const allItems = await resolveDependencies(source, starterDir, ['pages/home'])
      // Features grid has child components that reference feature-card template
      expect(allItems).toContain('templates/features-grid')
      expect(allItems).toContain('templates/feature-card')
    })
  })

  describe('filesystem to azure blob (Azurite)', () => {
    let container: StartedTestContainer
    const source = createFilesystemProvider()
    let blobProvider: ReturnType<typeof createAzureBlobProvider>

    beforeAll(async () => {
      container = await new GenericContainer('mcr.microsoft.com/azure-storage/azurite')
        .withExposedPorts({ container: 10000, host: 10000 })
        .withCommand(['azurite-blob', '--blobHost', '0.0.0.0', '--skipApiVersionCheck'])
        .start()

      blobProvider = createAzureBlobProvider({
        connectionString: 'UseDevelopmentStorage=true',
        container: 'gazetta-test',
      })
      await blobProvider.init()
    }, 60000)

    afterAll(async () => {
      if (container) await container.stop()
    })

    it('publishes a page to Azure Blob', async () => {
      const allItems = await resolveDependencies(source, starterDir, ['pages/home'])
      const { copiedFiles } = await publishItems(source, starterDir, blobProvider, '', allItems)
      expect(copiedFiles).toBeGreaterThan(10)

      // Verify files exist in blob storage
      expect(await blobProvider.exists('pages/home/page.yaml')).toBe(true)
      expect(await blobProvider.exists('templates/hero/index.ts')).toBe(true)
      expect(await blobProvider.exists('site.yaml')).toBe(true)
    })

    it('reads back published content from Azure Blob', async () => {
      const content = await blobProvider.readFile('pages/home/page.yaml')
      expect(content).toContain('route:')
      expect(content).toContain('template:')
    })

    it('lists published files in Azure Blob', async () => {
      const entries = await blobProvider.readDir('pages/home')
      const names = entries.map(e => e.name)
      expect(names).toContain('page.yaml')
      expect(names).toContain('hero')
    })
  })
})
