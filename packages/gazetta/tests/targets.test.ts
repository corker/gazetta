import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createStorageProvider,
  createTargetRegistry,
  createTargetRegistryView,
  listEditableTargets,
  UnknownTargetError,
  NoEditableTargetError,
} from '../src/targets.js'
import type { StorageProvider, TargetConfig, StorageConfig } from '../src/types.js'
import { tempDir } from './_helpers/temp.js'

function mockProvider(): StorageProvider {
  return {
    readFile: async () => {
      throw new Error('not impl')
    },
    writeFile: async () => {},
    readDir: async () => [],
    exists: async () => false,
    mkdir: async () => {},
    rm: async () => {},
  }
}

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

  it('throws for filesystem without path or target name', async () => {
    const config: StorageConfig = { type: 'filesystem' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow('Filesystem storage requires "path"')
  })

  it('derives default path from target name when path is omitted', async () => {
    await mkdir(testDir, { recursive: true })
    const config: StorageConfig = { type: 'filesystem' }
    const provider = await createStorageProvider(config, testDir, 'my-target')

    await provider.mkdir('.')
    await provider.writeFile('test.txt', 'hello')

    // Default path is <siteDir>/targets/<name>
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(resolve(testDir, 'targets/my-target/test.txt'), 'utf-8')
    expect(content).toBe('hello')
  })

  it('explicit path overrides the target-name default', async () => {
    await mkdir(testDir, { recursive: true })
    const config: StorageConfig = { type: 'filesystem', path: './custom-location' }
    const provider = await createStorageProvider(config, testDir, 'my-target')

    await provider.mkdir('.')
    await provider.writeFile('test.txt', 'explicit')

    // Explicit path wins over default
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(resolve(testDir, 'custom-location/test.txt'), 'utf-8')
    expect(content).toBe('explicit')
  })

  it('throws for azure-blob without connectionString', async () => {
    const config: StorageConfig = { type: 'azure-blob', container: 'test' }
    await expect(createStorageProvider(config, testDir)).rejects.toThrow(
      'Azure Blob storage requires "connectionString"',
    )
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
    process.env.TEST_CONN =
      'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'
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

describe('createTargetRegistryView', () => {
  it('resolves known target names to their providers', () => {
    const localP = mockProvider(),
      prodP = mockProvider()
    const providers = new Map<string, StorageProvider>([
      ['local', localP],
      ['prod', prodP],
    ])
    const configs: Record<string, TargetConfig> = {
      local: { storage: { type: 'filesystem', path: '.' } },
      prod: { storage: { type: 'r2' }, environment: 'production' },
    }
    const registry = createTargetRegistryView(providers, configs)
    expect(registry.get('local')).toBe(localP)
    expect(registry.get('prod')).toBe(prodP)
  })

  it('throws UnknownTargetError for unknown names', () => {
    const registry = createTargetRegistryView(new Map(), {})
    expect(() => registry.get('missing')).toThrow(UnknownTargetError)
    expect(() => registry.get('missing')).toThrow(/missing/)
  })

  it('getConfig returns the config or undefined', () => {
    const configs: Record<string, TargetConfig> = {
      local: { storage: { type: 'filesystem', path: '.' } },
    }
    const registry = createTargetRegistryView(new Map([['local', mockProvider()]]), configs)
    expect(registry.getConfig('local')).toBe(configs.local)
    expect(registry.getConfig('nope')).toBeUndefined()
  })

  it('list() returns target names in declaration order', () => {
    const configs: Record<string, TargetConfig> = {
      local: { storage: { type: 'filesystem', path: '.' } },
      staging: { storage: { type: 'r2' }, environment: 'staging' },
      prod: { storage: { type: 'r2' }, environment: 'production' },
    }
    const registry = createTargetRegistryView(new Map(), configs)
    expect(registry.list()).toEqual(['local', 'staging', 'prod'])
  })

  describe('defaultEditable', () => {
    it('returns the first editable target in declaration order', () => {
      const configs: Record<string, TargetConfig> = {
        prod: { storage: { type: 'r2' }, environment: 'production' },
        dev: { storage: { type: 'filesystem', path: '.' } },
        staging: { storage: { type: 'r2' }, environment: 'staging', editable: true },
      }
      const registry = createTargetRegistryView(new Map(), configs)
      expect(registry.defaultEditable()).toBe('dev')
    })

    it('respects explicit editable: true on non-local environments', () => {
      const configs: Record<string, TargetConfig> = {
        prod: { storage: { type: 'r2' }, environment: 'production', editable: true },
      }
      const registry = createTargetRegistryView(new Map(), configs)
      expect(registry.defaultEditable()).toBe('prod')
    })

    it('throws NoEditableTargetError when no target is editable', () => {
      const configs: Record<string, TargetConfig> = {
        staging: { storage: { type: 'r2' }, environment: 'staging' },
        prod: { storage: { type: 'r2' }, environment: 'production' },
      }
      const registry = createTargetRegistryView(new Map(), configs)
      expect(() => registry.defaultEditable()).toThrow(NoEditableTargetError)
    })

    it('throws when no targets at all', () => {
      const registry = createTargetRegistryView(new Map(), {})
      expect(() => registry.defaultEditable()).toThrow(NoEditableTargetError)
    })
  })
})

describe('listEditableTargets', () => {
  it('filters to editable targets in declaration order', () => {
    const configs: Record<string, TargetConfig> = {
      local: { storage: { type: 'filesystem', path: '.' } },
      staging: { storage: { type: 'r2' }, environment: 'staging' },
      prod: { storage: { type: 'r2' }, environment: 'production', editable: true },
      secondLocal: { storage: { type: 'filesystem', path: './b' } },
    }
    expect(listEditableTargets(configs)).toEqual(['local', 'prod', 'secondLocal'])
  })

  it('returns empty when none editable', () => {
    expect(listEditableTargets({})).toEqual([])
    expect(
      listEditableTargets({
        staging: { storage: { type: 'r2' }, environment: 'staging' },
      }),
    ).toEqual([])
  })
})
