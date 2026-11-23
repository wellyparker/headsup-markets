/**
 * Mock market data for offline development and simulator demos.
 *
 * Day 1: the app runs entirely on these fixtures (no network) so the UI,
 * navigation and simulator flow can be built and verified without the
 * backend. Day 2 swaps the provider to live Polymarket Gamma +
 * CoinGecko data via the backend proxy (see data.ts).
 *
 * Prices are realistic snapshots (23 Nov 2026), NOT live quotes.
 */
import type { Market, PriceTick } from './data.js'

export const MOCK_PRICES: PriceTick[] = [
  { symbol: 'BTC', name: 'Bitcoin', usd: 61780.33, change24hPct: 4.54 },
  { symbol: 'ETH', name: 'Ethereum', usd: 1714.14, change24hPct: 2.31 },
  { symbol: 'SOL', name: 'Solana', usd: 71.99, change24hPct: 3.87 },
  { symbol: 'XAUT', name: 'Tether Gold', usd: 3622.16, change24hPct: -2.75 },
]

export const MOCK_MARKETS: Market[] = [
  {
    id: 'btc-62k-nov',
    question: 'Bitcoin above $62,000 by Nov 30?',
    yesPct: 62,
    noPct: 38,
    volumeUsd: 1_240_000,
    endDate: 'Nov 30',
  },
  {
    id: 'fed-cut-dec',
    question: 'Fed rate cut in December?',
    yesPct: 41,
    noPct: 59,
    volumeUsd: 842_000,
    endDate: 'Dec 17',
  },
  {
    id: 'eth-2k-dec',
    question: 'Ethereum above $2,000 by Dec 31?',
    yesPct: 28,
    noPct: 72,
    volumeUsd: 516_000,
    endDate: 'Dec 31',
  },
  {
    id: 'sol-80-dec',
    question: 'Solana above $80 by Dec 31?',
    yesPct: 55,
    noPct: 45,
    volumeUsd: 388_000,
    endDate: 'Dec 31',
  },
  {
    id: 'gta6-delay',
    question: 'GTA 6 delayed past May 2027?',
    yesPct: 33,
    noPct: 67,
    volumeUsd: 1_870_000,
    endDate: 'May 2027',
  },
]
