import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createFilesystemProvider } from '@gazetta/renderer'
import { createCmsApp } from './index.js'

const siteDir = resolve(process.argv[2] ?? '../../examples/starter')
const port = parseInt(process.env.API_PORT ?? '4000', 10)
const storage = createFilesystemProvider()

const app = createCmsApp(siteDir, storage)

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n  Gazetta CMS API running at http://localhost:${port}`)
  console.log(`  Site: ${siteDir}\n`)
})
