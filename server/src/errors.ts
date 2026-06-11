import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export function notFound(message = 'Resource not found') {
  return new ApiError('not_found', message, 404)
}

export function unauthorized(message = 'Authentication required') {
  return new ApiError('unauthorized', message, 401)
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }

  if (error instanceof ZodError) {
    response.status(400).json({ error: { code: 'validation_error', message: 'Invalid request body' } })
    return
  }

  console.error(error)
  response.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } })
}
