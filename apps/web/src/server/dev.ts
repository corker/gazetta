import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import yaml from 'js-yaml'
import { serve } from '@hono/node-server'
import { createFilesystemProvider } from '@gazetta/renderer'
import type { SiteManifest } from '@gazetta/core'
import { createCmsApp } from './index.js'
import { createTargetRegistry } from '@gazetta/renderer'

const siteDir = resolve(process.argv[2] ?? '../../examples/starter')
const port = parseInt(process.env.API_PORT ?? '4000', 10)
const storage = createFilesystemProvider()

// Load targets from site.yaml
const siteYaml = yaml.load(await readFile(join(siteDir, 'site.yaml'), 'utf-8')) as SiteManifest
const targets = siteYaml.targets ? await createTargetRegistry(siteYaml.targets, siteDir) : new Map()

const app = createCmsApp(siteDir, storage, targets)

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n  Gazetta CMS API running at http://localhost:${port}`)
  console.log(`  Site: ${siteDir}`)
  if (targets.size > 0) {
    console.log(`  Targets: ${[...targets.keys()].join(', ')}`)
  } else {
    console.log(`  Targets: (none configured in site.yaml)`)
  }
  console.log()
})
