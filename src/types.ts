export type ProspectStatus = 'new' | 'contacted' | 'replied' | 'opted-out' | 'client'

export interface Prospect {
  id: string
  business_name: string
  category: string
  city: string
  phone: string
  email: string
  website_url: string
  has_website: boolean
  lead_score: number
  status: ProspectStatus
  place_id?: string
  review_count: number
  created_at: string
  updated_at?: string
}

export interface LeadConfig {
  target_city: string
  target_country: string
  business_niche: string
  max_leads_per_day: number
  sender_name: string
  sender_email: string
  physical_mailing_address: string
}

export interface GeneratedSite {
  id: string
  prospect_id: string
  category: string
  city: string
  demo_url: string
  preview_screenshot: string
  generated_date: string
  business_name: string
}

export interface OutreachLog {
  id: string
  prospect_id: string
  email_subject: string
  sent_date: string
  reply_received: boolean
  reply_text: string
  reply_received_at?: string
  status: string
  business_name: string
  prospect_email?: string
}

export interface DashboardData {
  config: LeadConfig
  prospects: Prospect[]
  generatedSites: GeneratedSite[]
  outreachLogs: OutreachLog[]
}
