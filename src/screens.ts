/**
 * Screen renderers — each returns the container set for one page.
 *
 * Layout language (576x288 canvas, max 8 non-image + 4 image containers,
 * exactly one isEventCapture per page):
 * - Home/detail/confirm/alerts: a text header + a native list container.
 *   The firmware handles list scrolling + selection highlight; the app
 *   reads the selected item NAME from listEvent (index 0 arrives as
 *   `undefined` in some SDK versions, so names are the source of truth).
 * - Done/loading/error: a single full-screen text container.
 *
 * Text limits: create/rebuild max 1,000 chars per container; we stay
 * under ~400 chars per screen for glanceability.
 */
import {
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerProperty,
  type PageContainerProps,
} from '@evenrealities/even_hub_sdk'
import { fmtPct, fmtPrice, fmtTime, fmtVolume, probBar, trunc } from './format.js'
import type { Market } from './data.js'
import { BET_SIZES, type AppState } from './state.js'

const W = 576
const H = 288

export const HOME_ALERTS_ITEM = 'Alerts'
export const HOME_REFRESH_ITEM = 'Refresh data'
export const BACK_ITEM = '< Back'
export const CONFIRM_ITEM = 'Confirm paper bet'
export const CANCEL_ITEM = 'Cancel'

/** Short label for a market in the home list (max 64 chars). */
export function marketListLabel(m: Market): string {
  return `${trunc(m.question, 44)} YES ${m.yesPct}%`
}

/** Bet-size list item on the detail screen, e.g. "$500 YES". */
export function betListLabel(amount: number, side: 'YES' | 'NO'): string {
  return `$${amount.toLocaleString('en-US')} ${side}`
}

/** Alert list item, e.g. "BTC above $62,000 [ON]". */
export function alertListLabel(
  symbol: string,
  direction: 'above' | 'below',
  targetUsd: number,
  enabled: boolean,
): string {
  return `${symbol} ${direction} ${fmtPrice(targetUsd)} [${enabled ? 'ON' : 'OFF'}]`
}

function headerText(
  id: number,
  name: string,
  content: string,
  height: number,
  textColor = 4,
): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: W,
    height,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: id,
    containerName: name,
    content,
    textColor,
    isEventCapture: 0,
  })
}

function listContainer(
  id: number,
  name: string,
  y: number,
  height: number,
  items: string[],
): ListContainerProperty {
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: y,
    width: W,
    height,
    borderWidth: 1,
    borderColor: 13,
    paddingLength: 5,
    containerID: id,
    containerName: name,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  })
}

function fullText(
  content: string,
  textColor = 4,
): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: W,
    height: H,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'main',
    content,
    textColor,
    isEventCapture: 1,
  })
}

export function loadingPage(): PageContainerProps {
  return {
    containerTotalNum: 1,
    textObject: [fullText('HeadsUp Markets\n\nLoading markets...')],
  }
}

export function errorPage(message: string): PageContainerProps {
  return {
    containerTotalNum: 1,
    textObject: [
      fullText(`HeadsUp Markets\n\n${message}\n\nTap: retry\nDouble-tap: exit`),
    ],
  }
}

export function homePage(state: AppState): PageContainerProps {
  const snap = state.snapshot
  const tag = snap?.live ? 'LIVE' : 'MOCK'
  const time = snap ? fmtTime(snap.fetchedAt) : '--:--'
  const btc = state.priceOf('BTC')
  const sol = state.priceOf('SOL')
  const priceLine = [
    btc ? `BTC ${fmtPrice(btc.usd)} ${fmtPct(btc.change24hPct)}` : '',
    sol ? `SOL ${fmtPrice(sol.usd)} ${fmtPct(sol.change24hPct)}` : '',
  ]
    .filter(Boolean)
    .join('  ')
  const header = `HEADSUP MARKETS [${tag}]  ${time}\n${priceLine}`

  const items = state.markets.map(marketListLabel)
  items.push(HOME_ALERTS_ITEM, HOME_REFRESH_ITEM)

  return {
    containerTotalNum: 2,
    textObject: [headerText(1, 'header', header, 56)],
    listObject: [listContainer(2, 'markets', 56, H - 56, items)],
  }
}

export function detailPage(state: AppState): PageContainerProps {
  const m = state.selectedMarket
  if (!m) return homePage(state)
  const header = [
    trunc(m.question, 90),
    `YES ${m.yesPct}% ${probBar(m.yesPct, 18)}`,
    `NO  ${m.noPct}%`,
    `Vol ${fmtVolume(m.volumeUsd)}  Ends ${m.endDate}`,
    'Pick a paper bet size:',
  ].join('\n')

  const items: string[] = []
  for (const side of ['YES', 'NO'] as const) {
    for (const size of BET_SIZES) items.push(betListLabel(size, side))
  }
  items.push(BACK_ITEM)

  return {
    containerTotalNum: 2,
    textObject: [headerText(1, 'detail', header, 132)],
    listObject: [listContainer(2, 'betsizes', 132, H - 132, items)],
  }
}

export function confirmPage(state: AppState): PageContainerProps {
  const m = state.selectedMarket
  if (!m) return homePage(state)
  const odds = state.selectedSide === 'YES' ? m.yesPct : m.noPct
  const payout = Math.round(state.selectedBetSize / (odds / 100))
  const header = [
    'PAPER BET - no real money',
    '',
    trunc(m.question, 90),
    `$${state.selectedBetSize.toLocaleString('en-US')} ${state.selectedSide} @ ${odds}%`,
    `Pays $${payout.toLocaleString('en-US')} if ${state.selectedSide} wins`,
  ].join('\n')

  return {
    containerTotalNum: 2,
    textObject: [headerText(1, 'confirm', header, 168)],
    listObject: [
      listContainer(2, 'confirm', 168, H - 168, [CONFIRM_ITEM, CANCEL_ITEM]),
    ],
  }
}

export function donePage(state: AppState): PageContainerProps {
  const bet = state.lastBet
  const body = bet
    ? [
        'Paper bet placed!',
        '',
        `$${bet.amountUsd.toLocaleString('en-US')} ${bet.side} @ ${bet.oddsPct}%`,
        trunc(bet.question, 90),
        '',
        'Tap: home   Double-tap: exit',
      ].join('\n')
    : 'Nothing placed.\n\nTap: home   Double-tap: exit'
  return {
    containerTotalNum: 1,
    textObject: [fullText(body)],
  }
}

export function alertsPage(state: AppState): PageContainerProps {
  const header = 'PRICE ALERTS\nTap an alert to toggle it on/off.'
  const items = state.alerts.map((a) =>
    alertListLabel(a.symbol, a.direction, a.targetUsd, a.enabled),
  )
  items.push(BACK_ITEM)
  return {
    containerTotalNum: 2,
    textObject: [headerText(1, 'alerts-hdr', header, 64)],
    listObject: [listContainer(2, 'alerts', 64, H - 64, items)],
  }
}
