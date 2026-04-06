import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import yaml from 'js-yaml'
import { serve } from '@hono/node-server'
import { createFilesystemProvider } from 'gazetta'
import type { SiteManifest } from 'gazetta'
import { createAdminApp } from './index.js'

const siteDir = resolve(process.argv[2] ?? '../../examples/starter')
const port = parseInt(process.env.API_PORT ?? '4000', 10)
const storage = createFilesystemProvider()

// Read target configs — targets are initialized lazily on first publish/fetch
const siteYaml = yaml.load(await readFile(join(siteDir, 'site.yaml'), 'utf-8')) as SiteManifest
const targetConfigs = siteYaml.targets

const app = createAdminApp({ siteDir, storage, targetConfigs })

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n  Gazetta Admin API running at http://localhost:${port}`)
  console.log(`  Site: ${siteDir}`)
  if (targetConfigs && Object.keys(targetConfigs).length > 0) {
    console.log(`  Targets: ${Object.keys(targetConfigs).join(', ')} (lazy init)`)
  } else {
    console.log(`  Targets: (none configured in site.yaml)`)
  }
  console.log()
})
