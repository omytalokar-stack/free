import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import mongoose from 'mongoose'
import { apiError } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { ProspectModel } from './_lib/models'

function tokenFor(id: string) {
  const secret = process.env.OUTREACH_SECRET
  if (!secret || secret.length < 32) throw new Error('OUTREACH_SECRET must be at least 32 characters.')
  return createHmac('sha256', secret).update(id).digest('hex')
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    return response.status(405).send('Method not allowed.')
  }
  const id = typeof request.query.id === 'string' ? request.query.id : ''
  const token = typeof request.query.token === 'string' ? request.query.token : ''
  if (!mongoose.isValidObjectId(id) || !/^[a-f0-9]{64}$/.test(token)) return response.status(400).send('Invalid unsubscribe link.')
  try {
    const expected = Buffer.from(tokenFor(id), 'hex')
    const received = Buffer.from(token, 'hex')
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return response.status(400).send('Invalid unsubscribe link.')
    }
    await connectToDatabase()
    const prospect = await ProspectModel.findByIdAndUpdate(
      id,
      { $set: { status: 'opted-out' } },
      { new: true, runValidators: true },
    ).select('_id').lean()
    if (!prospect) return response.status(404).send('This subscription could not be found.')
    return response.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribed</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:24px;color:#152039"><h1>You have been unsubscribed.</h1><p>You will not receive further outreach from this sender.</p></body></html>',
    )
  } catch (error) {
    return apiError(response, error)
  }
}
