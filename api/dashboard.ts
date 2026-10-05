import type { VercelRequest, VercelResponse } from '@vercel/node'
import { apiError, validateConfig } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { GeneratedSiteModel, LeadConfigModel, OutreachLogModel, ProspectModel } from './_lib/models'
import { requireAdmin } from './_lib/auth'

const defaultConfig = {
  target_city: '',
  target_country: 'United States',
  business_niche: '',
  max_leads_per_day: 25,
  sender_name: '',
  sender_email: '',
  physical_mailing_address: '',
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    response.setHeader('Allow', 'GET, PUT')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  if (!requireAdmin(request, response)) return
  try {
    await connectToDatabase()
    if (request.method === 'PUT') {
      const config = validateConfig(request.body)
      await LeadConfigModel.findOneAndUpdate(
        { key: 'current' },
        { $set: config },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      )
      return response.status(200).json(config)
    }

    const [configDocument, prospects, sites, logs] = await Promise.all([
      LeadConfigModel.findOne({ key: 'current' }).lean(),
      ProspectModel.find().sort({ created_at: -1 }).limit(100).lean(),
      GeneratedSiteModel.find().sort({ generated_date: -1 }).limit(50).lean(),
      OutreachLogModel.find().sort({ sent_date: -1 }).limit(100).lean(),
    ])
    const prospectNames = new Map(prospects.map(prospect => [String(prospect._id), prospect.business_name]))
    const prospectEmails = new Map(prospects.map(prospect => [String(prospect._id), prospect.email]))
    const generatedSites = sites.map(site => ({
      id: String(site._id),
      prospect_id: String(site.prospect_id),
      demo_url: site.demo_url,
      preview_screenshot: site.preview_screenshot,
      generated_date: site.generated_date.toISOString(),
      business_name: site.business_name || prospectNames.get(String(site.prospect_id)) || '',
    }))
    const outreachLogs = logs.map(log => ({
      id: String(log._id),
      prospect_id: String(log.prospect_id),
      email_subject: log.email_subject,
      sent_date: log.sent_date.toISOString(),
      reply_received: log.reply_received,
      reply_text: log.reply_text,
      status: log.status,
      business_name: prospectNames.get(String(log.prospect_id)) ?? '',
      prospect_email: prospectEmails.get(String(log.prospect_id)) ?? '',
    }))
    return response.status(200).json({
      config: configDocument ? {
        target_city: configDocument.target_city,
        target_country: configDocument.target_country,
        business_niche: configDocument.business_niche,
        max_leads_per_day: configDocument.max_leads_per_day,
        sender_name: configDocument.sender_name,
        sender_email: configDocument.sender_email,
        physical_mailing_address: configDocument.physical_mailing_address,
      } : defaultConfig,
      prospects: prospects.map(prospect => ({
        id: String(prospect._id),
        business_name: prospect.business_name,
        category: prospect.category,
        city: prospect.city,
        phone: prospect.phone,
        email: prospect.email,
        website_url: prospect.website_url,
        has_website: prospect.has_website,
        lead_score: prospect.lead_score,
        review_count: prospect.review_count,
        status: prospect.status,
        created_at: prospect.created_at.toISOString(),
      })),
      generatedSites,
      outreachLogs,
    })
  } catch (error) {
    return apiError(response, error)
  }
}
