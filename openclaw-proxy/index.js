// OpenClaw Proxy Sidecar — Express :5557
// Bridges HTTP POST /dispatch → OpenClaw HTTP Hooks API (/hooks/agent)
// Auth: Bearer OPENCLAW_PROXY_SECRET on all POST requests

const express = require('express')

const PORT = parseInt(process.env.PORT || '5557', 10)
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://127.0.0.1:18789'
const OPENCLAW_HOOKS_TOKEN = process.env.OPENCLAW_HOOKS_TOKEN || ''
const SECRET = process.env.OPENCLAW_PROXY_SECRET || ''

const app = express()
app.use(express.json())

// --- Stats ---

const stats = {
  totalRequests: 0,
  recentRequests: [], // timestamps for RPM calculation
  errors: 0,
  queueDepth: 0,
}

// --- Auth middleware ---

function authMiddleware(req, res, next) {
  if (!SECRET) return res.status(503).json({ error: 'Proxy not configured: OPENCLAW_PROXY_SECRET not set' })
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// --- POST /dispatch ---

app.post('/dispatch', authMiddleware, async (req, res) => {
  const { agent, prompt } = req.body || {}
  if (!agent || !prompt) {
    return res.status(400).json({ error: 'Missing agent or prompt' })
  }

  if (!OPENCLAW_HOOKS_TOKEN) {
    return res.status(503).json({ error: 'OPENCLAW_HOOKS_TOKEN not configured' })
  }

  try {
    const response = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        name: agent,
        wakeMode: 'now',
        timeoutSeconds: 30,
      }),
      signal: AbortSignal.timeout(35_000),
    })

    const text = await response.text()
    if (!response.ok) {
      return res.status(response.status).json({ error: text.slice(0, 500) })
    }

    let result
    try { result = JSON.parse(text) } catch { result = text }
    stats.totalRequests++
    stats.recentRequests.push(Date.now())
    return res.json({ ok: true, result })
  } catch (err) {
    stats.errors++
    return res.status(500).json({ error: err.message })
  }
})

// --- GET /api/stats ---

app.get('/api/stats', async (req, res) => {
  const now = Date.now()
  stats.recentRequests = stats.recentRequests.filter(t => now - t < 60000)

  let openclawReachable = false
  try {
    const r = await fetch(`${OPENCLAW_URL}/`, { signal: AbortSignal.timeout(2000) })
    openclawReachable = r.ok || r.status < 500
  } catch {}

  res.json({
    primaryModel: 'claude-haiku-4-5',
    fallbackModel: '—',
    rpm: stats.recentRequests.length,
    rpmMax: 60,
    proxyConnected: openclawReachable,
    totalRequests: stats.totalRequests,
    errorRate: stats.totalRequests > 0 ? stats.errors / stats.totalRequests : 0,
    queueDepth: stats.queueDepth,
  })
})

// --- GET /health ---

app.get('/health', async (req, res) => {
  let openclawOk = false
  try {
    const r = await fetch(`${OPENCLAW_URL}/`, { signal: AbortSignal.timeout(2000) })
    openclawOk = r.ok || r.status < 500
  } catch {}
  res.json({ ok: true, openclaw: openclawOk ? 'reachable' : 'unreachable' })
})

app.listen(PORT, () => {
  console.log(`[openclaw-proxy] Listening on :${PORT}`)
  console.log(`[openclaw-proxy] Forwarding to ${OPENCLAW_URL}/hooks/agent`)
})
