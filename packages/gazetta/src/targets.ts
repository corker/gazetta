import { resolve } from 'node:path'
import type { StorageProvider, TargetConfig, StorageConfig } from './types.js'
import { createFilesystemProvider } from './providers/filesystem.js'

function resolveEnvVars(value: string | undefined): string | undefined {
  if (!value) return value
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
}

export async function createStorageProvider(config: StorageConfig, siteDir: string): Promise<StorageProvider> {
  switch (config.type) {
    case 'filesystem':
      if (!config.path) throw new Error('Filesystem storage requires "path"')
      return createFilesystemProvider(resolve(siteDir, config.path))
    case 'azure-blob': {
      const connectionString = resolveEnvVars(config.connectionString)
      if (!connectionString) throw new Error('Azure Blob storage requires "connectionString"')
      if (!config.container) throw new Error('Azure Blob storage requires "container"')
      try {
        const { createAzureBlobProvider } = await import('./providers/azure-blob.js')
        return createAzureBlobProvider({ connectionString, container: config.container })
      } catch {
        throw new Error('Azure Blob storage requires @azure/storage-blob. Install it: npm install @azure/storage-blob')
      }
    }
    case 's3': {
      const endpoint = resolveEnvVars(config.endpoint)
      if (!endpoint) throw new Error('S3 storage requires "endpoint"')
      if (!config.bucket) throw new Error('S3 storage requires "bucket"')
      try {
        const { createS3Provider } = await import('./providers/s3.js')
        return createS3Provider({
          endpoint,
          bucket: config.bucket,
          accessKeyId: resolveEnvVars(config.accessKeyId) ?? 'minioadmin',
          secretAccessKey: resolveEnvVars(config.secretAccessKey) ?? 'minioadmin',
          region: config.region,
        })
      } catch {
        throw new Error('S3 storage requires @aws-sdk/client-s3. Install it: npm install @aws-sdk/client-s3')
      }
    }
    default:
      throw new Error(`Unknown storage type: ${(config as StorageConfig).type}`)
  }
}

/** @deprecated Use createStorageProvider */
export async function createTargetProvider(config: TargetConfig, siteDir: string): Promise<StorageProvider> {
  return createStorageProvider(config.storage, siteDir)
}

export async function createTargetRegistry(targets: Record<string, TargetConfig>, siteDir: string): Promise<Map<string, StorageProvider>> {
  const registry = new Map<string, StorageProvider>()
  for (const [name, config] of Object.entries(targets)) {
    try {
      const provider = await createStorageProvider(config.storage, siteDir)
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
