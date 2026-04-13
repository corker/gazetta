import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { createStorageProvider, createTargetRegistry } from '../src/targets.js'
import type { TargetConfig, StorageConfig } from '../src/types.js'
import { tempDir } from './_helpers/temp.js'

const testDir = tempDir('targets-test-' + Date.now())

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('createStorageProvider', () => {
  it('creates filesystem provider', async () => {
    await mkdir(testDir, { recursive: true })
    const config: StorageConfig = { type: 'filesystem', path: './output' }
    const provider = await createStorageProvider(config, testDir)
    expect(provider).toBeDefined()
    expect(typeof provider.readFile).toBe('function')
    expect(typeof provider.writeFile).toBe('function')
  })

  it('resolves filesystem path relative to siteDir', async () => {
    await mkdir(testDir, { recursive: true })
    const config: StorageConfig = { type: 'filesystem', path: './dist' }
    const provider = await createStorageProvider(config, testDir)

    await provider.mkdir('.')
    await provider.writeFile('test.txt', 'hello')
    const content = await provider.readFile('test.txt')
    expect(content).toBe('hello')
  })

  it('throws for filesystem without path', async () => {
    const config: StorageConfig = { type: 'filesystem' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('Filesystem storage requires "path"')
  })

  it('throws for azure-blob without connectionString', async () => {
    const config: StorageConfig = { type: 'azure-blob', container: 'test' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('Azure Blob storage requires "connectionString"')
  })

  it('throws for azure-blob without container', async () => {
    const config: StorageConfig = { type: 'azure-blob', connectionString: 'conn' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('Azure Blob storage requires "container"')
  })

  it('throws for s3 without endpoint', async () => {
    const config: StorageConfig = { type: 's3', bucket: 'test' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('S3 storage requires "endpoint"')
  })

  it('throws for s3 without bucket', async () => {
    const config: StorageConfig = { type: 's3', endpoint: 'http://localhost:9000' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('S3 storage requires "bucket"')
  })

  it('throws for unknown type', async () => {
    const config = { type: 'ftp' } as unknown as StorageConfig
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('Unknown storage type: ftp')
  })

  it('resolves env vars in connectionString', async () => {
    process.env.TEST_CONN = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'
    const config: StorageConfig = { type: 'azure-blob', connectionString: '${TEST_CONN}', container: 'test' }
    const provider = await createStorageProvider(config, testDir)
    expect(provider).toBeDefined()
    delete process.env.TEST_CONN
  })

  it('resolves env vars in s3 endpoint', async () => {
    process.env.TEST_ENDPOINT = 'http://localhost:9000'
    const config: StorageConfig = { type: 's3', endpoint: '${TEST_ENDPOINT}', bucket: 'test' }
    const provider = await createStorageProvider(config, testDir)
    expect(provider).toBeDefined()
    delete process.env.TEST_ENDPOINT
  })
})

describe('createTargetRegistry', () => {
  it('creates registry from multiple targets', async () => {
    await mkdir(testDir, { recursive: true })
    const targets: Record<string, TargetConfig> = {
      local: { storage: { type: 'filesystem', path: './output' } },
    }
    const registry = await createTargetRegistry(targets, testDir)
    expect(registry.size).toBe(1)
    expect(registry.has('local')).toBe(true)
  })

  it('returns empty registry for empty config', async () => {
    const registry = await createTargetRegistry({}, testDir)
    expect(registry.size).toBe(0)
  })

  it('skips targets that fail to initialize', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const targets: Record<string, TargetConfig> = {
      bad: { storage: { type: 's3', endpoint: 'http://nonexistent:9999', bucket: 'test' } },
      good: { storage: { type: 'filesystem', path: './output' } },
    }
    await mkdir(testDir, { recursive: true })
    const registry = await createTargetRegistry(targets, testDir)
    expect(registry.has('good')).toBe(true)
    spy.mockRestore()
  })
})
