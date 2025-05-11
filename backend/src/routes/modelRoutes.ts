import { Hono } from 'hono'
import { modelService } from '../services/modelService'

const modelRoutes = new Hono()

/**
 * @swagger
 * /api/v1/models/generation:
 *   get:
 *     summary: Get available image generation AI models
 *     tags:
 *       - Models
 *     responses:
 *       200:
 *         description: A list of available AI models for image generation.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   value:
 *                     type: string
 *                     description: The unique identifier for the model.
 *                   label:
 *                     type: string
 *                     description: A user-friendly label for the model.
 *                   description:
 *                     type: string
 *                     description: A brief description of the model.
 *       500:
 *         description: Internal server error.
 */
modelRoutes.get('/generation', async (c) => {
  try {
    const models = await modelService.getGenerationModels()
    return c.json(models, 200)
  } catch (error) {
    // Log the error appropriately using your logger if available
    console.error('Error fetching generation models:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default modelRoutes
