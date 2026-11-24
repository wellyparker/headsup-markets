/**
 * App state + navigation model.
 *
 * Screens (tap/ring-first — no voice dependency):
 *   home    — list of watched markets + prices (root page)
 *   detail  — one market: odds bar, volume, paper-bet sizes (list)
 *   confirm — paper-bet confirmation (list: Confirm / Cancel)
 *   done    — result text ("Paper bet placed"), tap to go home
 *   alerts  — price alerts list (day 3: wired to live snapshot prices
 *             via checkAlerts(); firing is in-app only, Telegram
 *             delivery arrives with the digest token)
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
  /**
   * True while the live price sits inside the trigger zone. Managed by
   * checkAlerts(): set on firing, cleared when the price leaves the zone
   * (re-arming the alert). Day 3 — wired to live snapshot data.
   */
  triggered?: boolean
  /** ISO timestamp of the most recent firing. */
  firedAt?: string
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

  /** Alerts currently sitting inside their trigger zone (live data). */
  get triggeredAlerts(): PriceAlert[] {
    return this.alerts.filter((a) => a.enabled && a.triggered)
  }

  /**
   * Evaluate enabled alerts against the current snapshot (day 3 — live
   * data wiring). Returns the alerts that fired on THIS call: an alert
   * fires once per crossing into its trigger zone and re-arms only after
   * the price leaves the zone, so a 60 s refresh loop never re-fires the
   * same alert every minute. Call after every snapshot refresh (main.ts
   * does this in refresh()). Firing is in-app only for now: the home
   * header shows !ALERT and the alerts screen marks the alert
   * TRIGGERED; Telegram delivery arrives with the digest token.
   */
  checkAlerts(): PriceAlert[] {
    const fired: PriceAlert[] = []
    for (const alert of this.alerts) {
      if (!alert.enabled) {
        alert.triggered = false
        continue
      }
      const tick = this.priceOf(alert.symbol)
      if (!tick) continue
      const inZone =
        alert.direction === 'above'
          ? tick.usd >= alert.targetUsd
          : tick.usd <= alert.targetUsd
      if (inZone && !alert.triggered) {
        alert.triggered = true
        alert.firedAt = new Date().toISOString()
        fired.push(alert)
      } else if (!inZone) {
        alert.triggered = false
      }
    }
    return fired
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
