import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { StorageProvider } from '@gazetta/shared'
import { authMiddleware } from './middleware/auth.js'
import { siteRoutes } from './routes/site.js'
import { pageRoutes } from './routes/pages.js'
import { fragmentRoutes } from './routes/fragments.js'
import { componentRoutes } from './routes/components.js'
import { templateRoutes } from './routes/templates.js'
import { previewRoutes } from './routes/preview.js'

export function createCmsApp(siteDir: string, storage: StorageProvider): Hono {
  const app = new Hono()

  app.use(logger())
  app.use('/api/*', authMiddleware())

  app.route('/', siteRoutes(siteDir, storage))
  app.route('/', pageRoutes(siteDir, storage))
  app.route('/', fragmentRoutes(siteDir, storage))
  app.route('/', componentRoutes(siteDir, storage))
  app.route('/', templateRoutes(siteDir, storage))
  app.route('/', previewRoutes(siteDir, storage))

  return app
}
