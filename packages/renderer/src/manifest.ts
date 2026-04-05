import { readFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import yaml from 'js-yaml'
import type { ComponentManifest, FragmentManifest, PageManifest, SiteManifest } from '@gazetta/shared'

async function readYaml(filePath: string): Promise<Record<string, unknown>> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`File not found: ${filePath}`)
    throw new Error(`Cannot read ${filePath}: ${(err as Error).message}`)
  }

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

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function parseSiteManifest(filePath: string): Promise<SiteManifest> {
  const raw = await readYaml(filePath)
  if (typeof raw.name !== 'string') {
    throw new Error(`Invalid site.yaml at ${filePath}: missing required "name" field`)
  }
  return { name: raw.name, version: raw.version as string | undefined }
}

export async function parsePageManifest(filePath: string): Promise<PageManifest> {
  const raw = await readYaml(filePath)
  const missing: string[] = []
  if (typeof raw.route !== 'string') missing.push('route')
  if (typeof raw.template !== 'string') missing.push('template')
  if (missing.length > 0) {
    throw new Error(`Invalid page.yaml at ${filePath}: missing required field(s): ${missing.join(', ')}`)
  }
  return {
    route: raw.route as string,
    template: raw.template as string,
    content: raw.content as Record<string, unknown> | undefined,
    components: raw.components as string[] | undefined,
    metadata: raw.metadata as Record<string, unknown> | undefined,
  }
}

export async function parseFragmentManifest(filePath: string): Promise<FragmentManifest> {
  const raw = await readYaml(filePath)
  if (typeof raw.template !== 'string') {
    throw new Error(`Invalid fragment.yaml at ${filePath}: missing required "template" field`)
  }
  return {
    template: raw.template,
    content: raw.content as Record<string, unknown> | undefined,
    components: raw.components as string[] | undefined,
  }
}

export async function parseComponentManifest(filePath: string): Promise<ComponentManifest> {
  const raw = await readYaml(filePath)
  if (typeof raw.template !== 'string') {
    throw new Error(`Invalid component.yaml at ${filePath}: missing required "template" field`)
  }
  return {
    template: raw.template,
    content: raw.content as Record<string, unknown> | undefined,
    components: raw.components as string[] | undefined,
  }
}
