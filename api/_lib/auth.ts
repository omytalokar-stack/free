import './env'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const COOKIE_NAME = 'siteseller_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7

function normalizedSecret(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export function getAdminPassword() {
  return normalizedSecret(process.env.SITESELLER_ADMIN_PASSWORD)
}

function sessionSecret() {
  const secret = normalizedSecret(process.env.SITESELLER_SESSION_SECRET)
  if (secret.length < 32) throw new Error('SITESELLER_SESSION_SECRET must be at least 32 characters.')
  return secret
}

function sessionCookie(request: VercelRequest, response: VercelResponse, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' || request.headers['x-forwarded-proto'] === 'https'
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`)
}

export function issueAdminSession(request: VercelRequest, response: VercelResponse) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  const payload = String(expires)
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  sessionCookie(request, response, `${payload}.${signature}`, SESSION_DURATION_SECONDS)
}

export function clearAdminSession(request: VercelRequest, response: VercelResponse) {
  sessionCookie(request, response, '', 0)
}

export function isAdmin(request: VercelRequest) {
  const cookieHeader = request.headers.cookie ?? ''
  const cookie = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))
  const value = cookie?.slice(COOKIE_NAME.length + 1) ?? ''
  const [expires, signature, extra] = value.split('.')
  if (!expires || !signature || extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature)) return false
  const expiration = Number(expires)
  if (!Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000)) return false
  const expected = Buffer.from(createHmac('sha256', sessionSecret()).update(expires).digest('hex'), 'hex')
  const received = Buffer.from(signature, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function requireAdmin(request: VercelRequest, response: VercelResponse) {
  try {
    if (isAdmin(request)) return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin session is not configured.'
    console.error(message)
    response.status(500).json({ error: message })
    return false
  }
  response.status(401).json({ error: 'Sign in to access your workspace.' })
  return false
}
