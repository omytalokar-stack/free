import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

if (process.env.NODE_ENV !== 'production') {
  const localEnvPath = resolve(process.cwd(), '.env.local')
  if (existsSync(localEnvPath)) {
    const result = config({ path: localEnvPath })
    if (result.error) throw result.error
  }
}
