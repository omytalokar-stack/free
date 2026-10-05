import { createHmac } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'
import mongoose from 'mongoose'
import { apiError } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { GeneratedSiteModel, LeadConfigModel, OutreachLogModel, ProspectModel } from './_lib/models'
import { requireAdmin } from './_lib/auth'

function unsubscribeToken(prospectId: string) {
  const secret = process.env.OUTREACH_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('OUTREACH_SECRET must be at least 32 characters.')
  return createHmac('sha256', secret).update(prospectId).digest('hex')
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  if (!requireAdmin(request, response)) return

  const prospectId = typeof request.body?.prospect_id === 'string' ? request.body.prospect_id.trim() : ''
  if (!mongoose.isValidObjectId(prospectId)) {
    return response.status(400).json({ error: 'A valid prospect ID is required.' })
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '')
  if (!resendKey || !from) {
    return response.status(503).json({ error: 'Configure RESEND_API_KEY and RESEND_FROM_EMAIL before sending email.' })
  }
  if (!appUrl) return response.status(503).json({ error: 'Set APP_URL to the public URL of your website before sending email.' })

  try {
    const demoUrlBase = new URL(appUrl)
    if (demoUrlBase.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(demoUrlBase.hostname)) {
      return response.status(400).json({ error: 'APP_URL must be a publicly reachable HTTPS URL before sending email.' })
    }

    await connectToDatabase()
    const config = await LeadConfigModel.findOne({ key: 'current' }).lean()
    if (!config?.sender_name || !config.sender_email || !config.physical_mailing_address) {
      return response.status(400).json({ error: 'Add your sender name, reply-to email, and physical mailing address in workspace settings.' })
    }
    const prospect = await ProspectModel.findById(prospectId).lean()
    if (!prospect) return response.status(404).json({ error: 'Prospect not found.' })
    if (prospect.status === 'opted-out') return response.status(409).json({ error: 'This business opted out and cannot be contacted.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email)) {
      return response.status(400).json({ error: 'Add and verify this business email before sending a pitch.' })
    }
    const site = await GeneratedSiteModel.findOne({ prospect_id: prospect._id }).sort({ generated_date: -1 }).lean()
    if (!site) return response.status(409).json({ error: 'Generate a demo site for this prospect before sending a pitch.' })

    const priorSent = await OutreachLogModel.exists({ prospect_id: prospect._id, status: 'sent' })
    if (priorSent || prospect.email_send_status === 'sent') {
      return response.status(409).json({ error: 'A pitch email has already been sent to this prospect.' })
    }
    const demoUrl = `${appUrl}/demo/${site._id}`
    const unsubscribeUrl = `${appUrl}/api/unsubscribe?id=${encodeURIComponent(prospectId)}&token=${unsubscribeToken(prospectId)}`
    const claimedProspect = await ProspectModel.findOneAndUpdate(
      {
        _id: prospect._id,
        status: { $nin: ['opted-out', 'contacted', 'replied', 'client'] },
        email_send_status: { $nin: ['sending', 'sent'] },
      },
      { $set: { email_send_status: 'sending' } },
      { new: true },
    ).lean()
    if (!claimedProspect) {
      return response.status(409).json({ error: 'This pitch is already being sent or this prospect is no longer eligible.' })
    }

    const subject = `A website idea for ${prospect.business_name}`
    const text = [
      `Hello ${prospect.business_name} team,`,
      '',
      `I came across your ${prospect.category.toLowerCase()} business in ${prospect.city} and couldn't find a website linked to it. I took the time to put together a website concept tailored specifically to your business.`,
      '',
      `There is one detail in the draft I think you will want to see: ${demoUrl}`,
      '',
      `It is only a concept, of course. If it feels like a good fit, reply to this email and we can talk about what comes next.`,
      '',
      `Best,`,
      config.sender_name,
      config.physical_mailing_address,
      '',
      `If you would prefer not to receive another message, unsubscribe here: ${unsubscribeUrl}`,
    ].join('\n')

    let outreachLogId: string | undefined
    let providerAccepted = false
    try {
      const [outreachLog] = await OutreachLogModel.create([{
        prospect_id: prospect._id,
        email_subject: subject,
        sent_date: new Date(),
        reply_received: false,
        reply_text: '',
        status: 'sending',
      }])
      outreachLogId = String(outreachLog._id)
      const result = await new Resend(resendKey).emails.send({
        from,
        to: prospect.email,
        replyTo: config.sender_email,
        subject,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })
      if (result.error) throw new Error(result.error.message)
      providerAccepted = true
      await OutreachLogModel.updateOne(
        { _id: outreachLogId },
        { $set: { status: 'sent', sent_date: new Date() } },
      )
      await ProspectModel.updateOne(
        { _id: prospect._id },
        { $set: { email_send_status: 'sent', status: 'contacted' } },
        { runValidators: true },
      )
      return response.status(200).json({ message: `Pitch email sent to ${prospect.email}.` })
    } catch (error) {
      if (!providerAccepted) {
        await Promise.all([
          outreachLogId
            ? OutreachLogModel.updateOne({ _id: outreachLogId }, { $set: { status: 'failed' } })
            : Promise.resolve(),
          ProspectModel.updateOne({ _id: prospect._id, email_send_status: 'sending' }, { $set: { email_send_status: 'idle' } }),
        ])
      }
      throw error
    }
  } catch (error) {
    return apiError(response, error)
  }
}
