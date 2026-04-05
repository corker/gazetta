import { resolve } from 'node:path'
import type { StorageProvider, TargetConfig } from '@gazetta/shared'
import { createFilesystemProvider, createAzureBlobProvider } from '@gazetta/renderer'

function resolveEnvVars(value: string | undefined): string | undefined {
  if (!value) return value
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
}

export function createTargetProvider(config: TargetConfig, siteDir: string): StorageProvider {
  switch (config.type) {
    case 'filesystem':
      if (!config.path) throw new Error('Filesystem target requires "path"')
      return createFilesystemProvider(resolve(siteDir, config.path))
    case 'azure-blob': {
      const connectionString = resolveEnvVars(config.connectionString)
      if (!connectionString) throw new Error('Azure Blob target requires "connectionString"')
      if (!config.container) throw new Error('Azure Blob target requires "container"')
      return createAzureBlobProvider({ connectionString, container: config.container })
    }
    default:
      throw new Error(`Unknown target type: ${config.type}`)
  }
}

export async function createTargetRegistry(targets: Record<string, TargetConfig>, siteDir: string): Promise<Map<string, StorageProvider>> {
  const registry = new Map<string, StorageProvider>()
  for (const [name, config] of Object.entries(targets)) {
    try {
      const provider = createTargetProvider(config, siteDir)
      // Initialize providers that need it (e.g., create Azure Blob containers)
      if ('init' in provider && typeof provider.init === 'function') {
        await (provider as StorageProvider & { init(): Promise<void> }).init()
      }
      registry.set(name, provider)
    } catch (err) {
      console.warn(`  Warning: target "${name}" failed to initialize: ${(err as Error).message}`)
    }
  }
  return registry
}
