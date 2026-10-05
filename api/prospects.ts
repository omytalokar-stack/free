import type { VercelRequest, VercelResponse } from '@vercel/node'
import { apiError } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { ProspectModel } from './_lib/models'
import { requireAdmin } from './_lib/auth'
import mongoose from 'mongoose'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'PATCH') {
    response.setHeader('Allow', 'PATCH')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  if (!requireAdmin(request, response)) return
  const id = typeof request.query.id === 'string' ? request.query.id : ''
  const email = typeof request.body?.email === 'string' ? request.body.email.trim() : ''
  if (!mongoose.isValidObjectId(id)) return response.status(400).json({ error: 'A valid prospect ID is required.' })
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid business email address.' })
  }
  try {
    await connectToDatabase()
    const prospect = await ProspectModel.findOneAndUpdate(
      { _id: id, status: { $ne: 'opted-out' } },
      { $set: { email } },
      { new: true, runValidators: true },
    ).select('_id email').lean()
    if (!prospect) {
      const exists = await ProspectModel.exists({ _id: id })
      if (!exists) return response.status(404).json({ error: 'Prospect not found.' })
      return response.status(409).json({ error: 'This business opted out and cannot be contacted.' })
    }
    return response.status(200).json({ id: String(prospect._id), email: prospect.email })
  } catch (error) {
    return apiError(response, error)
  }
}
