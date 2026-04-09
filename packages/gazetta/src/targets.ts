import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
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
    case 'r2': {
      if (!config.accountId) throw new Error('R2 storage requires "accountId"')
      if (!config.bucket) throw new Error('R2 storage requires "bucket"')
      const accessKeyId = resolveEnvVars(config.accessKeyId)
      const secretAccessKey = resolveEnvVars(config.secretAccessKey)
      // When S3 credentials are available, use S3 provider (fast, parallel — good for CI)
      if (accessKeyId && secretAccessKey) {
        try {
          const { createS3Provider } = await import('./providers/s3.js')
          return createS3Provider({
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            bucket: config.bucket,
            accessKeyId,
            secretAccessKey,
            region: config.region,
          })
        } catch {
          throw new Error('R2 with S3 credentials requires @aws-sdk/client-s3. Install it: npm install @aws-sdk/client-s3')
        }
      }
      // Fall back to Cloudflare REST API using wrangler auth
      let apiToken: string
      try {
        const output = execSync('npx wrangler auth token', { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
        // wrangler prints a banner before the token — extract the last non-empty line
        apiToken = output.split('\n').map(l => l.trim()).filter(l => l && !l.includes('wrangler') && !l.includes('───')).pop() ?? ''
      } catch {
        throw new Error(
          'R2 storage: no credentials found.\n' +
          '  Either set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables,\n' +
          '  or run "npx wrangler login" to authenticate with Cloudflare.'
        )
      }
      if (!apiToken) throw new Error('R2 storage: wrangler returned empty token. Run "npx wrangler login" to authenticate.')
      const { createR2RestProvider } = await import('./providers/r2.js')
      return createR2RestProvider({ accountId: config.accountId, bucket: config.bucket, apiToken })
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
