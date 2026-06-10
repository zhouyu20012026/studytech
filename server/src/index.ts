import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import express from 'express'
import { config } from './config.js'
import { errorHandler } from './errors.js'
import { adminRoutes } from './routes/adminRoutes.js'
import { authRoutes } from './routes/authRoutes.js'
import { inventoryRoutes } from './routes/inventoryRoutes.js'
import { passwordRoutes } from './routes/passwordRoutes.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
  app.use(cookieParser())
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/auth', passwordRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', inventoryRoutes)

  app.use(errorHandler)

  return app
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(config.PORT, () => {
    console.log(`Home inventory API listening on ${config.PORT}`)
  })
}
