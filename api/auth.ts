import { createHash, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearAdminSession, getAdminPassword, isAdmin, issueAdminSession } from './_lib/auth'

function passwordsMatch(provided: unknown, expected: string) {
  if (typeof provided !== 'string' || provided.length > 512) return false
  const providedHash = createHash('sha256').update(provided).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === 'GET') {
    try {
      if (getAdminPassword().length < 16) {
        return response.status(500).json({ error: 'SITESELLER_ADMIN_PASSWORD must be at least 16 characters.' })
      }
      if (!process.env.SITESELLER_SESSION_SECRET || process.env.SITESELLER_SESSION_SECRET.length < 32) {
        return response.status(500).json({ error: 'SITESELLER_SESSION_SECRET must be at least 32 characters.' })
      }
      const authenticated = isAdmin(request)
      return response.status(authenticated ? 200 : 401).json({ authenticated })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication is not configured.'
      console.error(message)
      return response.status(500).json({ error: message })
    }
  }
  if (request.method === 'POST') {
    const expected = getAdminPassword()
    if (expected.length < 16) {
      return response.status(500).json({ error: 'SITESELLER_ADMIN_PASSWORD must be at least 16 characters.' })
    }
    if (!passwordsMatch(request.body?.password, expected)) {
      return response.status(401).json({ error: 'The password is incorrect.' })
    }
    try {
      issueAdminSession(request, response)
      return response.status(200).json({ authenticated: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication is not configured.'
      console.error(message)
      return response.status(500).json({ error: message })
    }
  }
  if (request.method === 'DELETE') {
    clearAdminSession(request, response)
    return response.status(200).json({ authenticated: false })
  }
  response.setHeader('Allow', 'GET, POST, DELETE')
  return response.status(405).json({ error: 'Method not allowed.' })
}
