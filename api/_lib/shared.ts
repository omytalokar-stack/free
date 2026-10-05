export function apiError(response: { status: (code: number) => unknown; json: (body: unknown) => unknown }, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'An unexpected server error occurred.'
  console.error(message)
  response.status(status)
  return response.json({ error: message })
}

export function validateConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Settings must be a JSON object.')
  const input = value as Record<string, unknown>
  const config = {
    target_city: stringField(input.target_city, 'Target city', 120),
    target_country: stringField(input.target_country, 'Target country', 120),
    business_niche: stringField(input.business_niche, 'Business niche', 120),
    max_leads_per_day: Number(input.max_leads_per_day),
    sender_name: stringField(input.sender_name, 'Sender name', 120),
    sender_email: stringField(input.sender_email, 'Sender email', 254),
    physical_mailing_address: stringField(input.physical_mailing_address, 'Physical mailing address', 300),
  }
  if (!Number.isInteger(config.max_leads_per_day) || config.max_leads_per_day < 1 || config.max_leads_per_day > 100) {
    throw new Error('Daily lead limit must be a whole number between 1 and 100.')
  }
  if (config.sender_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.sender_email)) {
    throw new Error('Enter a valid sender reply-to email address.')
  }
  return config
}

function stringField(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`)
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  return normalized
}
