import { createWorker } from 'gazetta/workers/cloudflare-r2'

const app = createWorker({
  middleware: app => {
    // www redirect
    app.use('*', async (c, next) => {
      const url = new URL(c.req.url)
      if (url.hostname === 'www.gazetta.studio') {
        return c.redirect(`https://gazetta.studio${url.pathname}`, 301)
      }
      return next()
    })
  },
})

export default app
