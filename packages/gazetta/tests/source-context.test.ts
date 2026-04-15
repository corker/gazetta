import { describe, it, expect } from 'vitest'
import type { StorageProvider, TargetConfig } from '../src/types.js'
import { createTargetRegistryView, NoEditableTargetError, UnknownTargetError } from '../src/targets.js'
import {
  createSourceContext,
  createSourceContextFromRegistry,
} from '../src/admin-api/source-context.js'

function mockProvider(tag = 'mock'): StorageProvider {
  return {
    readFile: async () => tag,
    writeFile: async () => {},
    readDir: async () => [],
    exists: async () => false,
    mkdir: async () => {},
    rm: async () => {},
  }
}

describe('createSourceContext', () => {
  it('wraps storage + siteDir into a ContentRoot-backed context', () => {
    const storage = mockProvider()
    const source = createSourceContext({ storage, siteDir: '/abs/site' })
    expect(source.storage).toBe(storage)
    expect(source.siteDir).toBe('/abs/site')
    expect(source.contentRoot.storage).toBe(storage)
    expect(source.contentRoot.rootPath).toBe('/abs/site')
    expect(source.contentRoot.path('pages', 'home')).toBe('/abs/site/pages/home')
  })

  it('forwards the sidecar writer when provided', () => {
    const storage = mockProvider()
    const writer = { writeFor: async () => {}, invalidate: () => {} } as never
    const source = createSourceContext({ storage, siteDir: '', sidecarWriter: writer })
    expect(source.sidecarWriter).toBe(writer)
  })
})

describe('createSourceContextFromRegistry', () => {
  const configs: Record<string, TargetConfig> = {
    local: { storage: { type: 'filesystem' } },
    staging: { storage: { type: 'r2' }, environment: 'staging' },
    prod: { storage: { type: 'r2' }, environment: 'production' },
  }

  it('picks the default editable target when no name is given', () => {
    const localProvider = mockProvider('local-provider')
    const providers = new Map<string, StorageProvider>([
      ['local', localProvider],
      ['staging', mockProvider('staging')],
      ['prod', mockProvider('prod')],
    ])
    const registry = createTargetRegistryView(providers, configs)

    const source = createSourceContextFromRegistry({ registry, siteDir: '/abs/site' })
    expect(source.storage).toBe(localProvider)
    expect(source.siteDir).toBe('/abs/site')
  })

  it('honors an explicit targetName', () => {
    const stagingProvider = mockProvider('staging-provider')
    const providers = new Map<string, StorageProvider>([
      ['local', mockProvider('local')],
      ['staging', stagingProvider],
    ])
    const registry = createTargetRegistryView(providers, configs)

    const source = createSourceContextFromRegistry({ registry, targetName: 'staging', siteDir: '.' })
    expect(source.storage).toBe(stagingProvider)
  })

  it('throws NoEditableTargetError when no editable target exists and no name is given', () => {
    const readOnlyConfigs: Record<string, TargetConfig> = {
      staging: { storage: { type: 'r2' }, environment: 'staging' },
      prod: { storage: { type: 'r2' }, environment: 'production' },
    }
    const registry = createTargetRegistryView(new Map(), readOnlyConfigs)
    expect(() => createSourceContextFromRegistry({ registry, siteDir: '.' })).toThrow(NoEditableTargetError)
  })

  it('throws UnknownTargetError when an explicit targetName is not in the registry', () => {
    const registry = createTargetRegistryView(new Map(), configs)
    expect(() => createSourceContextFromRegistry({ registry, targetName: 'missing', siteDir: '.' })).toThrow(UnknownTargetError)
  })
})
