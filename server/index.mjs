// HeadsUp Markets — backend proxy (zero dependencies, Node >= 20).
//
// The G2 glasses app fetches ONE small payload from this server instead of
// calling public APIs directly: it keeps the glasses payload tiny, hides
// upstream rate-limit handling server-side, and is where the Telegram
// digest (day 3) will live.
//
//   GET /snapshot -> { prices: PriceTick[], markets: Market[],
//                      fetchedAt: string, stale: boolean }
//   GET /health   -> { ok: true, uptimeSec, cacheAgeMs, lastGoodAt }
//
// Upstreams (both public, no API key):
//   - CoinGecko /simple/price (BTC, ETH, SOL, XAUT + 24h change)
//   - Polymarket Gamma public-search (one watched market per term:
//     bitcoin, ethereum, solana, fed interest rates, gold price),
//     filled from top-volume binary markets if a search comes up empty.
//
// Caching: 60 s in-memory cache; on upstream failure the last good
// snapshot is served with stale:true (the glasses never go blank because
// of one failed upstream call). If there is no cached snapshot yet and
// both upstreams fail, /snapshot returns 502.
//
// No secrets, no user data, no wallets: this server only aggregates
// public read-only market data. Paper bets stay a client-side ledger
// (POST /paper-bet arrives day 3 with the Telegram digest).
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const CACHE_TTL_MS = 60_000
// Generous: the VM egress proxy regime runs 2–17 s per upstream call.
// The 60 s cache means a slow cold build is paid once, then served in ms.
const UPSTREAM_TIMEOUT_MS = 30_000
const MARKET_COUNT = 5

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,solana,tether-gold' +
  '&vs_currencies=usd&include_24hr_change=true'
const GAMMA_URL =
  'https://gamma-api.polymarket.com/markets' +
  '?limit=30&active=true&closed=false&order=volumeNum&ascending=false'
const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search?q='

// One watched market per search term (top-volume binary market of the
// first live event). Top-by-volume across all of Polymarket is dominated
// by politics/celebrity novelty markets — a crypto watchlist is what a
// trader actually wants on their glasses.
const WATCHLIST = ['bitcoin', 'ethereum', 'solana', 'fed', 'gold price']

const COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'tether-gold', symbol: 'XAUT', name: 'Tether Gold' },
]

/** @type {{ payload: object, at: number } | null} */
let cache = null
const startedAt = Date.now()

function round2(n) {
  return Math.round(n * 100) / 100
}

async function fetchJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`upstream ${res.status} for ${url}`)
  return res.json()
}

async function fetchPrices() {
  const json = await fetchJson(COINGECKO_URL)
  const prices = []
  for (const coin of COINS) {
    const row = json[coin.id]
    if (!row || typeof row.usd !== 'number') continue
    prices.push({
      symbol: coin.symbol,
      name: coin.name,
      usd: round2(row.usd),
      change24hPct: round2(row.usd_24h_change ?? 0),
    })
  }
  if (prices.length === 0) throw new Error('coingecko returned no prices')
  return prices
}

/** "2026-11-30T..." -> "Nov 30" (adds the year when it is not this year). */
function fmtEndDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function parseMarket(m) {
  if (!m || typeof m.question !== 'string') return null
  let outcomes
  let prices
  try {
    outcomes = JSON.parse(m.outcomes ?? '[]')
    prices = JSON.parse(m.outcomePrices ?? '[]')
  } catch {
    return null
  }
  // Binary Yes/No only — multi-outcome markets don't fit the YES/NO UI.
  if (
    !Array.isArray(outcomes) ||
    outcomes.length !== 2 ||
    outcomes[0] !== 'Yes' ||
    outcomes[1] !== 'No'
  ) {
    return null
  }
  const yes = Number(prices[0])
  if (!Number.isFinite(yes) || yes < 0 || yes > 1) return null
  const yesPct = Math.round(yes * 100)
  return {
    id: String(m.id),
    question: m.question,
    yesPct,
    noPct: 100 - yesPct,
    volumeUsd: Math.round(Number(m.volumeNum ?? 0)),
    endDate: fmtEndDate(m.endDate),
  }
}

async function fetchMarkets() {
  // Primary: one market per watchlist term (parallel searches).
  const found = []
  const searched = await Promise.allSettled(
    WATCHLIST.map(async (term) => {
      const json = await fetchJson(GAMMA_SEARCH_URL + encodeURIComponent(term))
      const events = (json.events ?? []).filter((e) => e.active && !e.closed)
      for (const event of events) {
        const candidates = (event.markets ?? [])
          .filter((m) => m.active !== false && m.closed !== true)
          .map(parseMarket)
          .filter(Boolean)
        if (candidates.length > 0) {
          // Most-traded price level of the event.
          candidates.sort((a, b) => b.volumeUsd - a.volumeUsd)
          return candidates[0]
        }
      }
      return null
    }),
  )
  for (const r of searched) {
    if (r.status === 'fulfilled' && r.value) found.push(r.value)
  }

  // Fill any gaps with top-volume binary markets so the list is never short.
  if (found.length < MARKET_COUNT) {
    const json = await fetchJson(GAMMA_URL)
    if (Array.isArray(json)) {
      const seen = new Set(found.map((m) => m.id))
      for (const m of json) {
        const parsed = parseMarket(m)
        if (parsed && !seen.has(parsed.id)) {
          found.push(parsed)
          seen.add(parsed.id)
        }
        if (found.length >= MARKET_COUNT) break
      }
    }
  }

  if (found.length === 0) throw new Error('gamma returned no binary markets')
  return found.slice(0, MARKET_COUNT)
}

async function buildSnapshot() {
  // Both upstreams in parallel; either may fail independently.
  const [prices, markets] = await Promise.all([fetchPrices(), fetchMarkets()])
  return { prices, markets, fetchedAt: new Date().toISOString(), stale: false }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      cacheAgeMs: cache ? Date.now() - cache.at : null,
      lastGoodAt: cache ? cache.payload.fetchedAt : null,
    })
    return
  }

  if (url.pathname === '/snapshot' && req.method === 'GET') {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      sendJson(res, 200, cache.payload)
      return
    }
    try {
      const payload = await buildSnapshot()
      cache = { payload, at: Date.now() }
      sendJson(res, 200, payload)
    } catch (err) {
      console.error('[headsup-backend] snapshot build failed:', err.message)
      if (cache) {
        // Stale is better than blank on the glasses.
        sendJson(res, 200, { ...cache.payload, stale: true })
      } else {
        sendJson(res, 502, { error: 'upstreams unavailable, no cached snapshot yet' })
      }
    }
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`[headsup-backend] listening on http://${HOST}:${PORT} (GET /snapshot, GET /health)`)
  // Warm the cache at startup so the first glasses fetch is served in ms.
  buildSnapshot()
    .then((payload) => {
      cache = { payload, at: Date.now() }
      console.log('[headsup-backend] cache warmed')
    })
    .catch((err) => console.error('[headsup-backend] cache warm failed:', err.message))
})
