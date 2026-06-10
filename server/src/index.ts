import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { errorHandler } from './errors.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use(errorHandler)

  return app
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(config.PORT, () => {
    console.log(`Home inventory API listening on ${config.PORT}`)
  })
}
