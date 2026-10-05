import { GoogleGenAI } from '@google/genai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { apiError } from './_lib/shared'
import { connectToDatabase } from './_lib/db'
import { GeneratedSiteModel, LeadConfigModel, ProspectModel, type GeneratedSiteContent } from './_lib/models'
import { requireAdmin } from './_lib/auth'

type Place = {
  id?: string
  displayName?: { text?: string }
  primaryTypeDisplayName?: { text?: string }
  nationalPhoneNumber?: string
  websiteUri?: string
  userRatingCount?: number
  formattedAddress?: string
}

const MAX_PER_RUN = 5
const GEMINI_MODEL = 'gemini-3.8-flash'
const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite'

class GeminiProviderError extends Error {}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  if (!requireAdmin(request, response)) return
  try {
    await connectToDatabase()
    const config = await LeadConfigModel.findOne({ key: 'current' }).lean()
    if (!config) return response.status(400).json({ error: 'Save your workspace settings before running the pipeline.' })
    if (!config.target_city || !config.business_niche) return response.status(400).json({ error: 'Set a target city and business niche before running discovery.' })
    const appUrl = process.env.APP_URL?.replace(/\/+$/, '')
    if (!appUrl) throw new Error('Set APP_URL to your public app URL before generating demo websites.')
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayCount = await ProspectModel.countDocuments({ created_at: { $gte: startOfDay } })
    const remaining = Math.max(0, config.max_leads_per_day - todayCount)
    const missingDiscoveryKeys = [
      !process.env.GOOGLE_PLACES_API_KEY && 'GOOGLE_PLACES_API_KEY',
      !process.env.GEMINI_API_KEY && 'GEMINI_API_KEY',
    ].filter((key): key is string => !!key)
    if (remaining && missingDiscoveryKeys.length) {
      throw new Error(`Set ${missingDiscoveryKeys.join(' and ')} to discover prospects and generate AI demo websites.`)
    }
    const placesKey = process.env.GOOGLE_PLACES_API_KEY?.trim()
    const geminiKey = process.env.GEMINI_API_KEY?.trim()
    let places: Place[] = []
    if (remaining) {
      if (!placesKey) throw new Error('Set GOOGLE_PLACES_API_KEY to run discovery.')
      places = await discoverPlaces(placesKey, `${config.business_niche} in ${config.target_city}, ${config.target_country}`)
    }
    const candidatePlaceIds = places.flatMap(place => place.id ? [place.id] : [])
    const candidateNames = places.flatMap(place => place.displayName?.text ? [place.displayName.text.trim()] : [])
    const existingProspects = candidateNames.length
      ? await ProspectModel.find({
        $or: [
          { business_name: { $in: candidateNames } },
          ...(candidatePlaceIds.length ? [{ place_id: { $in: candidatePlaceIds } }] : []),
        ],
      }).select('place_id business_name').lean()
      : []
    const knownPlaceIds = new Set(existingProspects.map(prospect => prospect.place_id).filter(Boolean))
    const existingNames = new Set(existingProspects.map(prospect => prospect.business_name.toLowerCase()))
    const freshPlaces = places.filter(place => {
      const name = place.displayName?.text?.trim() ?? ''
      return !!name && !place.websiteUri && !existingNames.has(name.toLowerCase()) && !(place.id && knownPlaceIds.has(place.id))
    })

    const pendingProspects = await ProspectModel.find({ status: 'new' })
      .sort({ created_at: 1 })
      .limit(1000)
      .lean()
    const pendingIds = pendingProspects.map(prospect => prospect._id)
    const existingSiteProspects = pendingIds.length
      ? await GeneratedSiteModel.find({ prospect_id: { $in: pendingIds } }).select('prospect_id').lean()
      : []
    const prospectsWithSites = new Set(existingSiteProspects.map(site => String(site.prospect_id)))
    const prospectsToRetry = pendingProspects
      .filter(prospect => !prospectsWithSites.has(String(prospect._id)))
      .slice(0, MAX_PER_RUN)

    if ((freshPlaces.length || prospectsToRetry.length) && !geminiKey) {
      throw new Error('Set GEMINI_API_KEY to score and generate demo websites.')
    }
    const model = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : undefined
    const placesToRank = prospectsToRetry.length < MAX_PER_RUN ? freshPlaces : []
    const scored = model && placesToRank.length ? await scoreProspects(model, placesToRank, config.business_niche) : new Map<string, number>()
    const rankedPlaces = [...placesToRank].sort((a, b) => (scored.get(b.id ?? '') ?? 50) - (scored.get(a.id ?? '') ?? 50))
    const selected = rankedPlaces.slice(0, Math.min(remaining, MAX_PER_RUN - prospectsToRetry.length))
    const failures: string[] = []
    let sitesCreated = 0

    const generationTargets = [
      ...prospectsToRetry.map(prospect => ({
        prospectId: String(prospect._id),
        businessName: prospect.business_name,
        category: prospect.category,
        city: prospect.city,
        phone: prospect.phone,
        review_count: prospect.review_count,
      })),
      ...selected.flatMap(place => {
        const businessName = place.displayName?.text?.trim()
        if (!businessName) return []
        return [{
          placeId: place.id ?? '',
          businessName,
          category: place.primaryTypeDisplayName?.text ?? config.business_niche,
          city: config.target_city,
          phone: place.nationalPhoneNumber ?? '',
          review_count: place.userRatingCount ?? 0,
          lead_score: scored.get(place.id ?? '') ?? 50,
        }]
      }),
    ]
    for (const target of generationTargets) {
      try {
        if (!model) throw new Error('Gemini is not configured for website generation.')
        const prospectDocument = 'prospectId' in target
          ? await ProspectModel.findById(target.prospectId)
          : await ProspectModel.findOneAndUpdate(
            target.placeId
              ? { place_id: target.placeId }
              : { business_name: target.businessName, city: target.city },
            {
              $setOnInsert: {
                place_id: target.placeId,
                business_name: target.businessName,
                category: target.category,
                city: target.city,
                phone: target.phone,
                email: '',
                website_url: '',
                has_website: false,
                lead_score: target.lead_score,
                review_count: target.review_count,
                status: 'new',
              },
            },
            { new: true, upsert: true, runValidators: true },
          )
        if (!prospectDocument) throw new Error('Could not load the prospect for demo generation.')
        if (await GeneratedSiteModel.exists({ prospect_id: prospectDocument._id })) continue
        const content = await generateSite(model, target)
        const site = new GeneratedSiteModel({
          prospect_id: prospectDocument._id,
          business_name: target.businessName,
          category: target.category,
          city: target.city,
          demo_url: '',
          preview_screenshot: '',
          generated_date: new Date(),
          content,
        })
        site.demo_url = `${appUrl}/demo/${site._id}`
        await site.save()
        sitesCreated += 1

      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown website generation error.'
        failures.push(`${target.businessName}: ${detail}`)
        console.error(`Pipeline failed for ${target.businessName}: ${detail}`)
      }
    }

    const summary = `Found ${selected.length} new business${selected.length === 1 ? '' : 'es'} without websites and built ${sitesCreated} demo${sitesCreated === 1 ? '' : 's'}.`
    return response.status(200).json({
      message: failures.length
        ? `${summary} ${failures.length} item(s) need attention.`
        : `${summary} Review each demo and send any pitch emails manually.`,
      discovered: selected.length,
      sites: sitesCreated,
      errors: failures,
    })
  } catch (error) {
    return apiError(response, error, error instanceof GeminiProviderError ? 503 : 500)
  }
}

async function discoverPlaces(apiKey: string, textQuery: string) {
  const places: Place[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 3; page += 1) {
    const result = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryTypeDisplayName,places.nationalPhoneNumber,places.websiteUri,places.userRatingCount,places.formattedAddress,nextPageToken',
      },
      body: JSON.stringify({ textQuery, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    })
    const payload = await result.json() as { places?: Place[]; nextPageToken?: string; error?: { message?: string } }
    if (!result.ok) throw new Error(`Google Places request failed (${result.status}): ${payload.error?.message ?? 'Check the API key and Places API access.'}`)
    places.push(...(payload.places ?? []))
    if (!payload.nextPageToken) break
    pageToken = payload.nextPageToken
  }
  return places
}

async function scoreProspects(model: GoogleGenAI, places: Place[], niche: string) {
  const compact = places.map(place => ({
    id: place.id,
    name: place.displayName?.text ?? '',
    category: place.primaryTypeDisplayName?.text ?? niche,
    reviewCount: place.userRatingCount ?? 0,
  }))
  const result = await generateGeminiJson(model, `Score each local business prospect from 1 to 100 for its potential need for a website. Consider review count, likely category demand, and the impact of having no listed website. Return only JSON in this exact shape: {"scores":[{"id":"place-id","score":72}]}. Include every input id exactly once. Do not infer facts not provided. Inputs: ${JSON.stringify(compact)}`)
  if (!result.text) throw new Error('Gemini returned empty content for lead scores.')
  const parsed = parseJson<{ scores: { id: string; score: number }[] }>(result.text, 'lead scores')
  if (!Array.isArray(parsed.scores)) throw new Error('Gemini returned an invalid lead score response.')
  const scores = new Map<string, number>()
  for (const row of parsed.scores) {
    if (typeof row.id === 'string' && typeof row.score === 'number' && Number.isFinite(row.score)) {
      scores.set(row.id, Math.max(1, Math.min(100, Math.round(row.score))))
    }
  }
  for (const place of places) {
    if (place.id && !scores.has(place.id)) throw new Error(`Gemini omitted a lead score for place ${place.id}.`)
  }
  return scores
}

async function generateSite(model: GoogleGenAI, prospect: { businessName: string; category: string; city: string; phone: string; review_count: number }) {
  const business = {
    business_name: prospect.businessName,
    category: prospect.category,
    city: prospect.city,
    phone: prospect.phone,
    review_count: prospect.review_count,
  }
  const result = await generateGeminiJson(model, `Create polished, truthful concept website copy for this local business. Do not invent awards, testimonials, years in business, or verifiable claims. Return only a JSON object with these string fields: headline, subheadline, about, ctaText, phone, whatsappUrl; services (array of 3 objects with name and description); testimonials (empty array). Use this phone only if supplied. Business: ${JSON.stringify(business)}`)
  if (!result.text) throw new Error('Gemini returned empty website content.')
  const content = parseJson<GeneratedSiteContent>(result.text, 'generated website content')
  for (const field of ['headline', 'subheadline', 'about', 'ctaText'] as const) {
    if (typeof content[field] !== 'string' || !content[field].trim()) throw new Error(`Gemini omitted ${field} from the generated website.`)
  }
  if (!Array.isArray(content.services) || content.services.length < 1) throw new Error('Gemini returned no website services.')
  return {
    ...content,
    phone: prospect.phone,
    whatsappUrl: prospect.phone ? `https://wa.me/${prospect.phone.replace(/\D/g, '')}` : '',
  }
}

async function generateGeminiJson(model: GoogleGenAI, contents: string) {
  let lastError: unknown
  for (const modelName of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await model.models.generateContent({
          model: modelName,
          contents,
          config: { responseMimeType: 'application/json' },
        })
      } catch (error) {
        lastError = error
        if (!isGeminiUnavailable(error)) throw error
        if (attempt === 0 && isTransientGeminiError(error)) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        break
      }
    }
  }
  console.error('Gemini primary and fallback model requests failed:', lastError)
  if (geminiErrorStatus(lastError) === 404) {
    throw new GeminiProviderError('The configured Gemini models are unavailable to this API key. Check model access or update the model configuration.')
  }
  throw new GeminiProviderError('Gemini is temporarily unavailable. Please retry the pipeline in a few minutes.')
}

function isGeminiUnavailable(error: unknown) {
  const status = geminiErrorStatus(error)
  if (status === 404) return true
  return status === 429 || (status !== undefined && status >= 500)
}

function isTransientGeminiError(error: unknown) {
  const status = geminiErrorStatus(error)
  return status === 429 || (status !== undefined && status >= 500)
}

function geminiErrorStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  return undefined
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Gemini returned invalid JSON for ${label}.`)
  }
}
