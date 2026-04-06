import { createMiddleware } from 'hono/factory'

export function authMiddleware() {
  const token = process.env.GAZETTA_TOKEN
  if (!token) return createMiddleware(async (_c, next) => next())

  return createMiddleware(async (c, next) => {
    const auth = c.req.header('Authorization')
    if (!auth || auth !== `Bearer ${token}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })
}
