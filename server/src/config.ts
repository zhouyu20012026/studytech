import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://inventory:inventory@localhost:5432/inventory'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me'),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MAIL_HOST: z.string().default('smtp.qq.com'),
  MAIL_PORT: z.coerce.number().default(465),
  MAIL_USER: z.string().email().default('49703878@qq.com'),
  MAIL_PASS: z.string().min(1).default('replace-me'),
  MAIL_FROM: z.string().email().default('49703878@qq.com'),
  LOGIN_FAILURE_THRESHOLD: z.coerce.number().default(3),
  LOGIN_LOCK_MINUTES: z.coerce.number().default(15),
  RESET_TOKEN_MINUTES: z.coerce.number().default(15),
})

export const config = envSchema.parse(process.env)
