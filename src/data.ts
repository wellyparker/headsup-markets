/**
 * Data layer — one interface, two providers.
 *
 * - MockProvider: fixtures (day 1, offline dev + simulator demo).
 * - BackendProvider: live data via the HeadsUp backend proxy (day 2).
 *   The proxy calls Polymarket Gamma (public, no key) and CoinGecko
 *   (public, no key) server-side and returns a single small JSON payload
 *   the glasses app can fetch in one call. Direct fetch from the WebView
 *   is possible (both APIs send CORS headers) but the proxy keeps the
 *   glasses payload tiny and lets us add the Telegram digest later.
 *
 * Everything here is READ-ONLY market data. Paper bets never touch real
 * money, real wallets, or real exchanges.
 */
import { MOCK_MARKETS, MOCK_PRICES } from './fixtures.js'

export interface PriceTick {
  symbol: string
  name: string
  usd: number
  change24hPct: number
}

export interface Market {
  id: string
  question: string
  yesPct: number
  noPct: number
  volumeUsd: number
  endDate: string
}

export interface Snapshot {
  prices: PriceTick[]
  markets: Market[]
  fetchedAt: Date
  live: boolean
}

export interface DataProvider {
  fetchSnapshot(): Promise<Snapshot>
}

export class MockProvider implements DataProvider {
  async fetchSnapshot(): Promise<Snapshot> {
    // Tiny artificial delay so the loading state is visible in the sim.
    await new Promise((r) => setTimeout(r, 150))
    return {
      prices: MOCK_PRICES,
      markets: MOCK_MARKETS,
      fetchedAt: new Date(),
      live: false,
    }
  }
}

/**
 * Live provider (DAY 2 — wired in main.ts).
 *
 * Endpoint contract (backend proxy, server/index.mjs):
 *   GET {base}/snapshot -> { prices: PriceTick[], markets: Market[],
 *                            fetchedAt: string, stale: boolean }
 * Extra fields from the backend (fetchedAt, stale) are ignored here;
 * fetchedAt is stamped locally so the UI clock always reflects the
 * moment the glasses got the data.
 */
export class BackendProvider implements DataProvider {
  constructor(private baseUrl: string) {}

  async fetchSnapshot(): Promise<Snapshot> {
    const res = await fetch(`${this.baseUrl}/snapshot`, {
      headers: { Accept: 'application/json' },
      // The backend serves a warm cache in ms; 30 s only guards a cold
      // build over a slow link. main.ts falls back to MockProvider on
      // any failure, so a timeout degrades to offline data, not a blank.
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`backend ${res.status}`)
    const json = (await res.json()) as {
      prices: PriceTick[]
      markets: Market[]
    }
    return { ...json, fetchedAt: new Date(), live: true }
  }
}
