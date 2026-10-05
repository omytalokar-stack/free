import type { VercelRequest, VercelResponse } from '@vercel/node'
import { apiError } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { GeneratedSiteModel } from './_lib/models'
import mongoose from 'mongoose'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  const id = typeof request.query.id === 'string' ? request.query.id : ''
  if (!mongoose.isValidObjectId(id)) return response.status(400).json({ error: 'A valid demo ID is required.' })
  try {
    await connectToDatabase()
    const site = await GeneratedSiteModel.findById(id).lean()
    if (!site) return response.status(404).json({ error: 'This demo does not exist.' })
    return response.status(200).json({
      businessName: site.business_name,
      category: site.category,
      city: site.city,
      content: site.content,
    })
  } catch (error) {
    return apiError(response, error)
  }
}
