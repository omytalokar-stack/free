import mongoose from 'mongoose'
import type { Types } from 'mongoose'

const { model, models, Schema } = mongoose

export type ProspectStatus = 'new' | 'contacted' | 'replied' | 'opted-out' | 'client'

export interface ProspectRecord {
  place_id: string
  business_name: string
  category: string
  city: string
  phone: string
  email: string
  website_url: string
  has_website: boolean
  lead_score: number
  review_count: number
  status: ProspectStatus
  email_send_status: 'idle' | 'sending' | 'sent'
  created_at: Date
  updated_at: Date
}

export interface LeadConfigRecord {
  key: string
  target_city: string
  target_country: string
  business_niche: string
  max_leads_per_day: number
  sender_name: string
  sender_email: string
  physical_mailing_address: string
}

export interface SiteService {
  name: string
  description: string
}

export interface SiteTestimonial {
  name: string
  quote: string
}

export interface GeneratedSiteContent {
  headline: string
  subheadline: string
  about: string
  services: SiteService[]
  testimonials: SiteTestimonial[]
  ctaText: string
  phone: string
  whatsappUrl: string
}

export interface GeneratedSiteRecord {
  prospect_id: Types.ObjectId
  business_name: string
  category: string
  city: string
  demo_url: string
  preview_screenshot: string
  generated_date: Date
  content: GeneratedSiteContent
}

export interface OutreachLogRecord {
  prospect_id: Types.ObjectId
  email_subject: string
  sent_date: Date
  reply_received: boolean
  reply_text: string
  reply_received_at?: Date
  status: string
}

const prospectSchema = new Schema<ProspectRecord>({
  place_id: { type: String, default: '', trim: true },
  business_name: { type: String, required: true, trim: true, maxlength: 200 },
  category: { type: String, required: true, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, default: '', trim: true, maxlength: 50 },
  email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
  website_url: { type: String, default: '', trim: true, maxlength: 2048 },
  has_website: { type: Boolean, default: false },
  lead_score: { type: Number, required: true, min: 1, max: 100 },
  review_count: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['new', 'contacted', 'replied', 'opted-out', 'client'],
    default: 'new',
    required: true,
  },
  email_send_status: {
    type: String,
    enum: ['idle', 'sending', 'sent'],
    default: 'idle',
    required: true,
  },
}, {
  collection: 'Prospect',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
prospectSchema.index({ place_id: 1 }, { unique: true, partialFilterExpression: { place_id: { $type: 'string', $gt: '' } } })
prospectSchema.index({ status: 1, email: 1 })
prospectSchema.index({ created_at: -1 })

const leadConfigSchema = new Schema<LeadConfigRecord>({
  key: { type: String, required: true, unique: true, default: 'current' },
  target_city: { type: String, default: '', trim: true, maxlength: 120 },
  target_country: { type: String, default: 'United States', trim: true, maxlength: 120 },
  business_niche: { type: String, default: '', trim: true, maxlength: 120 },
  max_leads_per_day: { type: Number, default: 25, min: 1, max: 100 },
  sender_name: { type: String, default: '', trim: true, maxlength: 120 },
  sender_email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
  physical_mailing_address: { type: String, default: '', trim: true, maxlength: 300 },
}, {
  collection: 'LeadConfig',
  versionKey: false,
})

const serviceSchema = new Schema<SiteService>({
  name: { type: String, required: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 1000 },
}, { _id: false })

const testimonialSchema = new Schema<SiteTestimonial>({
  name: { type: String, required: true, maxlength: 150 },
  quote: { type: String, required: true, maxlength: 1000 },
}, { _id: false })

const siteContentSchema = new Schema<GeneratedSiteContent>({
  headline: { type: String, required: true, maxlength: 300 },
  subheadline: { type: String, required: true, maxlength: 1000 },
  about: { type: String, required: true, maxlength: 3000 },
  services: { type: [serviceSchema], default: [] },
  testimonials: { type: [testimonialSchema], default: [] },
  ctaText: { type: String, required: true, maxlength: 120 },
  phone: { type: String, default: '' },
  whatsappUrl: { type: String, default: '' },
}, { _id: false })

const generatedSiteSchema = new Schema<GeneratedSiteRecord>({
  prospect_id: { type: Schema.Types.ObjectId, ref: 'Prospect', required: true, index: true },
  business_name: { type: String, required: true, trim: true, maxlength: 200 },
  category: { type: String, required: true, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, maxlength: 120 },
  demo_url: { type: String, required: true, trim: true, maxlength: 2048 },
  preview_screenshot: { type: String, default: '', maxlength: 2048 },
  generated_date: { type: Date, required: true, default: Date.now, index: true },
  content: { type: siteContentSchema, required: true },
}, {
  collection: 'GeneratedSite',
  versionKey: false,
})
generatedSiteSchema.index({ prospect_id: 1, generated_date: -1 })

const outreachLogSchema = new Schema<OutreachLogRecord>({
  prospect_id: { type: Schema.Types.ObjectId, ref: 'Prospect', required: true, index: true },
  email_subject: { type: String, required: true, trim: true, maxlength: 300 },
  sent_date: { type: Date, required: true, default: Date.now, index: true },
  reply_received: { type: Boolean, default: false },
  reply_text: { type: String, default: '', maxlength: 20_000 },
  reply_received_at: { type: Date },
  status: { type: String, required: true, default: 'sent', maxlength: 40 },
}, {
  collection: 'OutreachLog',
  versionKey: false,
})
outreachLogSchema.index({ prospect_id: 1, sent_date: -1 })

export const ProspectModel = models.Prospect ?? model<ProspectRecord>('Prospect', prospectSchema)
export const LeadConfigModel = models.LeadConfig ?? model<LeadConfigRecord>('LeadConfig', leadConfigSchema)
export const GeneratedSiteModel = models.GeneratedSite ?? model<GeneratedSiteRecord>('GeneratedSite', generatedSiteSchema)
export const OutreachLogModel = models.OutreachLog ?? model<OutreachLogRecord>('OutreachLog', outreachLogSchema)
