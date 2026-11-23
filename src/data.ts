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
 * Live provider (DAY 2 — not wired yet).
 *
 * Endpoint contract (backend proxy, to be deployed day 2):
 *   GET {base}/snapshot -> { prices: PriceTick[], markets: Market[] }
 * Until the backend exists this provider is unused; main.ts uses
 * MockProvider. Flip the switch in main.ts once the backend is live.
 */
export class BackendProvider implements DataProvider {
  constructor(private baseUrl: string) {}

  async fetchSnapshot(): Promise<Snapshot> {
    const res = await fetch(`${this.baseUrl}/snapshot`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`backend ${res.status}`)
    const json = (await res.json()) as {
      prices: PriceTick[]
      markets: Market[]
    }
    return { ...json, fetchedAt: new Date(), live: true }
  }
}
