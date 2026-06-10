import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { getAdminSummary } from '../inventoryRepository.js'

export const adminRoutes = Router()

adminRoutes.use(requireAuth)

adminRoutes.get('/summary', async (request, response, next) => {
  try {
    response.json(await getAdminSummary(request.user!.homeId))
  } catch (error) {
    next(error)
  }
})
