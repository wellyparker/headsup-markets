/**
 * App state + navigation model.
 *
 * Screens (tap/ring-first — no voice dependency):
 *   home    — list of watched markets + prices (root page)
 *   detail  — one market: odds bar, volume, paper-bet sizes (list)
 *   confirm — paper-bet confirmation (list: Confirm / Cancel)
 *   done    — result text ("Paper bet placed"), tap to go home
 *   alerts  — price alerts list (mock day 1, real wiring day 3)
 *
 * Navigation rules (Even Hub QA):
 * - Double-tap = back. On the root page it opens the system
 *   exit-confirmation dialog (shutDownPageContainer(1)) — silent exit
 *   (mode 0) is rejected in QA.
 * - Click = select the focused list item (firmware tracks focus).
 * - Up/down = firmware list scrolling; the app only reads the selected
 *   index from listEvent. Index 0 arrives as `undefined` in some SDK
 *   versions — we resolve the selection by item NAME, never by index
 *   alone (see main.ts).
 */
import type { Market, PriceTick, Snapshot } from './data.js'

export type ScreenName = 'home' | 'detail' | 'confirm' | 'done' | 'alerts'

export interface PaperBet {
  marketId: string
  question: string
  side: 'YES' | 'NO'
  amountUsd: number
  oddsPct: number
  placedAt: string
}

export interface PriceAlert {
  symbol: string
  direction: 'above' | 'below'
  targetUsd: number
  enabled: boolean
}

export const BET_SIZES = [100, 500, 1000]

export class AppState {
  screen: ScreenName = 'home'
  snapshot: Snapshot | null = null
  selectedMarket: Market | null = null
  selectedBetSize = BET_SIZES[0]
  selectedSide: 'YES' | 'NO' = 'YES'
  lastBet: PaperBet | null = null
  bets: PaperBet[] = []
  alerts: PriceAlert[] = [
    { symbol: 'BTC', direction: 'above', targetUsd: 62000, enabled: true },
    { symbol: 'SOL', direction: 'above', targetUsd: 80, enabled: true },
  ]
  /** Incremented on every data refresh; used to re-render lists. */
  dataVersion = 0

  get prices(): PriceTick[] {
    return this.snapshot?.prices ?? []
  }

  get markets(): Market[] {
    return this.snapshot?.markets ?? []
  }

  priceOf(symbol: string): PriceTick | undefined {
    return this.prices.find((p) => p.symbol === symbol)
  }

  placeBet(): PaperBet | null {
    if (!this.selectedMarket) return null
    const bet: PaperBet = {
      marketId: this.selectedMarket.id,
      question: this.selectedMarket.question,
      side: this.selectedSide,
      amountUsd: this.selectedBetSize,
      oddsPct:
        this.selectedSide === 'YES'
          ? this.selectedMarket.yesPct
          : this.selectedMarket.noPct,
      placedAt: new Date().toISOString(),
    }
    this.bets.push(bet)
    this.lastBet = bet
    return bet
  }
}
