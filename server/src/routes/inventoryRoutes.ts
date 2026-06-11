import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { archiveItem, createCategory, createItem, createLocation, getInventory, moveItem } from '../inventoryRepository.js'

export const inventoryRoutes = Router()

inventoryRoutes.use(requireAuth)

inventoryRoutes.get('/inventory', async (request, response, next) => {
  try {
    response.json(await getInventory(request.user!.homeId))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/items', async (request, response, next) => {
  try {
    const input = z
      .object({
        name: z.string().min(1),
        locationId: z.string().min(1),
        category: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(request.body)

    response.status(201).json(await createItem(request.user!.homeId, { ...input, memberId: request.user!.membershipId }))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/items/:id/move', async (request, response, next) => {
  try {
    const input = z
      .object({
        toLocationId: z.string().min(1),
        note: z.string().optional(),
      })
      .parse(request.body)

    response.json(await moveItem(request.user!.homeId, request.params.id, { ...input, memberId: request.user!.membershipId }))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/items/:id/archive', async (request, response, next) => {
  try {
    response.json(await archiveItem(request.user!.homeId, request.params.id, request.user!.membershipId))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/locations', async (request, response, next) => {
  try {
    const input = z
      .object({
        areaId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        isCommon: z.boolean().default(false),
      })
      .parse(request.body)

    response.status(201).json(await createLocation(request.user!.homeId, input))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/categories', async (request, response, next) => {
  try {
    const input = z.object({ name: z.string().min(1) }).parse(request.body)

    response.status(201).json(await createCategory(request.user!.homeId, input))
  } catch (error) {
    next(error)
  }
})
