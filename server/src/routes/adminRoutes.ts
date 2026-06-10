import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { getAdminSummary } from '../inventoryRepository.js'
import { getRecentAuditLogs } from '../security/auditRepository.js'

export const adminRoutes = Router()

adminRoutes.use(requireAuth)

adminRoutes.get('/summary', async (request, response, next) => {
  try {
    response.json(await getAdminSummary(request.user!.homeId))
  } catch (error) {
    next(error)
  }
})

adminRoutes.get('/security/logs', async (_request, response, next) => {
  try {
    response.json(await getRecentAuditLogs())
  } catch (error) {
    next(error)
  }
})
