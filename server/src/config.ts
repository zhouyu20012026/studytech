import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://inventory:inventory@localhost:5432/inventory'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me'),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
})

export const config = envSchema.parse(process.env)
