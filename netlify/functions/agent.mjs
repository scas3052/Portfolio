// Netlify Function for Gullak's assistant: /api/agent. Configure it with the
// environment variables documented in .env.example (Site configuration → Environment variables).
import { createAgentRelay } from '../../server/agentRelay.js'

const relay = createAgentRelay(process.env)

export default (request) => relay(request)

export const config = { path: '/api/agent' }
