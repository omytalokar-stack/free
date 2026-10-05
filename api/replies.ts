import type { VercelRequest, VercelResponse } from '@vercel/node'
import mongoose from 'mongoose'
import { apiError } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { OutreachLogModel, ProspectModel } from './_lib/models'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  const secret = process.env.REPLY_WEBHOOK_SECRET
  if (!secret) return apiError(response, new Error('REPLY_WEBHOOK_SECRET is not configured.'))
  const authorization = request.headers.authorization
  if (authorization !== `Bearer ${secret}`) return response.status(401).json({ error: 'Unauthorized.' })
  const body = request.body as Record<string, unknown>
  const prospectId = typeof body?.prospect_id === 'string' ? body.prospect_id.trim() : ''
  const replyText = typeof body?.reply_text === 'string' ? body.reply_text.trim() : ''
  if (!mongoose.isValidObjectId(prospectId) || !replyText || replyText.length > 20_000) {
    return response.status(400).json({ error: 'prospect_id and reply_text are required.' })
  }
  try {
    await connectToDatabase()
    const prospect = await ProspectModel.findById(prospectId).select('_id').lean()
    if (!prospect) return response.status(404).json({ error: 'Prospect not found.' })
    const latestLog = await OutreachLogModel.findOne({ prospect_id: prospect._id }).sort({ sent_date: -1 }).select('_id').lean()
    await Promise.all([
      ProspectModel.updateOne({ _id: prospect._id }, { $set: { status: 'replied' } }, { runValidators: true }),
      latestLog ? OutreachLogModel.updateOne(
        { _id: latestLog._id },
        { $set: { reply_received: true, reply_text: replyText, reply_received_at: new Date() } },
      ) : Promise.resolve(),
    ])
    return response.status(200).json({ updated: true })
  } catch (error) {
    return apiError(response, error)
  }
}
