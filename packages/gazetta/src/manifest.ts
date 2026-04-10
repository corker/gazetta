import yaml from 'js-yaml'
import type { ComponentManifest, FragmentManifest, PageManifest, SiteManifest, StorageProvider } from './types.js'

function parseYaml(content: string, filePath: string): Record<string, unknown> {
  try {
    const parsed = yaml.load(content)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Expected a YAML object in ${filePath}, got ${typeof parsed}`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      throw new Error(`YAML parse error in ${filePath}: ${err.message}`)
    }
    throw err
  }
}

export async function parseSiteManifest(storage: StorageProvider, filePath: string): Promise<SiteManifest> {
  const raw = parseYaml(await storage.readFile(filePath), filePath)
  if (typeof raw.name !== 'string') {
    throw new Error(`Invalid site.yaml at ${filePath}: missing required "name" field`)
  }
  return { name: raw.name, version: raw.version as string | undefined, systemPages: Array.isArray(raw.systemPages) ? raw.systemPages as string[] : undefined }
}

export async function parsePageManifest(storage: StorageProvider, filePath: string): Promise<PageManifest> {
  const raw = parseYaml(await storage.readFile(filePath), filePath)
  if (typeof raw.template !== 'string') {
    throw new Error(`Invalid page.yaml at ${filePath}: missing required "template" field`)
  }
  return {
    route: '', // derived from folder path by site-loader
    template: raw.template as string,
    content: raw.content as Record<string, unknown> | undefined,
    components: raw.components as string[] | undefined,
    cache: raw.cache as import('./types.js').CacheConfig | undefined,
  }
}

export async function parseFragmentManifest(storage: StorageProvider, filePath: string): Promise<FragmentManifest> {
  const raw = parseYaml(await storage.readFile(filePath), filePath)
  if (typeof raw.template !== 'string') {
    throw new Error(`Invalid fragment.yaml at ${filePath}: missing required "template" field`)
  }
  return {
    template: raw.template,
    content: raw.content as Record<string, unknown> | undefined,
    components: raw.components as string[] | undefined,
  }
}

export async function parseComponentManifest(storage: StorageProvider, filePath: string): Promise<ComponentManifest> {
  const raw = parseYaml(await storage.readFile(filePath), filePath)
  if (typeof raw.template !== 'string') {
    throw new Error(`Invalid component.yaml at ${filePath}: missing required "template" field`)
  }
  return {
    template: raw.template,
    content: raw.content as Record<string, unknown> | undefined,
    components: raw.components as string[] | undefined,
  }
}
