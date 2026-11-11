// Vercel Function for Gullak's assistant: /api/agent. Configure it with the
// environment variables documented in .env.example (Project → Settings → Environment Variables).
import { createAgentRelay } from '../server/agentRelay.js'

const relay = createAgentRelay(process.env)

export const maxDuration = 60

export function GET(request) {
  return relay(request)
}

export function POST(request) {
  return relay(request)
}

export function OPTIONS(request) {
  return relay(request)
}
