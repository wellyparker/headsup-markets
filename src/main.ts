/**
 * HeadsUp Markets — entry point.
 *
 * Boot: wait for bridge -> loading page -> fetch snapshot -> home page.
 * Navigation is tap/ring-first (see state.ts): click = select, double-tap
 * = back (exit dialog on root), up/down = firmware list scrolling.
 *
 * Event-source quirks handled here (Even Hub docs + g2-sdk reference):
 * - CLICK_EVENT (0) is normalized to `undefined` by the SDK — treat both
 *   as a click.
 * - `currentSelectItemIndex` is missing for index 0 — selections resolve
 *   by item NAME, never by index.
 * - The simulator sends `sysEvent` for some clicks where hardware sends
 *   `textEvent`/`listEvent` — all three sources are routed.
 * - ~300 ms click cooldown to swallow duplicate deliveries.
 */
import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  RebuildPageContainer,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
  type PageContainerProps,
} from '@evenrealities/even_hub_sdk'
import { BackendProvider, MockProvider, type DataProvider } from './data.js'
import {
  alertsPage,
  BACK_ITEM,
  CANCEL_ITEM,
  CONFIRM_ITEM,
  confirmPage,
  detailPage,
  donePage,
  errorPage,
  HOME_ALERTS_ITEM,
  HOME_REFRESH_ITEM,
  homePage,
  loadingPage,
  marketListLabel,
} from './screens.js'
import { AppState } from './state.js'

const READY_MARKER = '[headsup] ready'
const CLICK_COOLDOWN_MS = 300
const REFRESH_INTERVAL_MS = 60_000
const BETS_STORAGE_KEY = 'headsup.bets.v1'

const state = new AppState()
// Day 2: live data via the backend proxy (server/index.mjs). The base URL
// is baked in at build time from VITE_BACKEND_URL; localhost:3000 is the
// local dev/simulator default. If the backend is unreachable the app
// degrades to offline fixtures (home header shows [MOCK] instead of
// [LIVE]) rather than going blank — see refresh().
const provider: DataProvider = new BackendProvider(
  // Optional chaining: the offline mock build (plain tsc, no Vite)
  // leaves import.meta.env undefined — Vite replaces import.meta.env
  // with the static env object at build time, so this is still a
  // compile-time constant in the real bundle.
  import.meta.env?.VITE_BACKEND_URL ?? 'http://localhost:3000',
)
const fallback: DataProvider = new MockProvider()

let bridge: EvenAppBridge
let started = false
let lastClickAt = 0
let showingError = false

function pageForScreen(): PageContainerProps {
  switch (state.screen) {
    case 'home':
      return homePage(state)
    case 'detail':
      return detailPage(state)
    case 'confirm':
      return confirmPage(state)
    case 'done':
      return donePage(state)
    case 'alerts':
      return alertsPage(state)
  }
}

async function render(): Promise<void> {
  showingError = false
  const page = pageForScreen()
  if (!started) {
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer(page),
    )
    if (result !== 0) {
      console.error('[headsup] createStartUpPageContainer failed:', result)
      return
    }
    started = true
    return
  }
  const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(page))
  if (!ok) console.error('[headsup] rebuildPageContainer failed')
}

async function showError(message: string): Promise<void> {
  showingError = true
  const page = errorPage(message)
  if (!started) {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer(page),
    )
    started = true
    return
  }
  await bridge.rebuildPageContainer(new RebuildPageContainer(page))
}

async function refresh(): Promise<boolean> {
  try {
    state.snapshot = await provider.fetchSnapshot()
  } catch (err) {
    // Offline degradation: fixtures keep the glasses usable when the
    // backend (or the link to it) is down. The home header flips to
    // [MOCK] so the user can see the data is not live.
    console.warn('[headsup] live snapshot failed, using offline data:', err)
    try {
      state.snapshot = await fallback.fetchSnapshot()
    } catch (err2) {
      console.error('[headsup] snapshot fetch failed:', err2)
      return false
    }
  }
  state.dataVersion += 1
  // Day 3: evaluate price alerts against the fresh snapshot. Firing is
  // in-app only (home header shows !ALERT, alerts screen marks !TRIG);
  // Telegram delivery arrives with the digest token.
  const fired = state.checkAlerts()
  for (const alert of fired) {
    console.log(
      `[headsup] alert fired: ${alert.symbol} ${alert.direction} ${alert.targetUsd}`,
    )
  }
  return true
}

async function persistBets(): Promise<void> {
  try {
    await bridge.setLocalStorage(BETS_STORAGE_KEY, JSON.stringify(state.bets))
  } catch {
    // Storage is best-effort (simulator / older firmware may not support
    // it the same way). Bets still live in memory for the session.
  }
}

async function loadBets(): Promise<void> {
  try {
    const raw = await bridge.getLocalStorage(BETS_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) state.bets = parsed as AppState['bets']
  } catch {
    // Corrupt or missing storage — start fresh.
  }
}

function goHome(): Promise<void> {
  state.screen = 'home'
  state.selectedMarket = null
  return render()
}

function goBack(): Promise<void> {
  switch (state.screen) {
    case 'home':
      // Root page: system exit-confirmation dialog (mode 1). Silent exit
      // (mode 0) is rejected in QA.
      return bridge.shutDownPageContainer(1).then(() => undefined)
    case 'confirm':
      state.screen = 'detail'
      return render()
    default:
      return goHome()
  }
}

/** Resolve a clicked list item by NAME (index 0 is unreliable). */
async function onListSelect(itemName: string | undefined): Promise<void> {
  if (itemName === undefined) {
    console.warn('[headsup] list click without item name — ignored')
    return
  }
  const name = itemName.trim()

  if (state.screen === 'home') {
    if (name === HOME_ALERTS_ITEM) {
      state.screen = 'alerts'
      return render()
    }
    if (name === HOME_REFRESH_ITEM) {
      if (await refresh()) return render()
      return showError('Refresh failed. Check connection.')
    }
    const market = state.markets.find((m) => marketListLabel(m) === name)
    if (market) {
      state.selectedMarket = market
      state.screen = 'detail'
      return render()
    }
    return
  }

  if (state.screen === 'detail') {
    if (name === BACK_ITEM) return goHome()
    const betMatch = /^\$([\d,]+) (YES|NO)$/.exec(name)
    if (betMatch) {
      state.selectedBetSize = Number(betMatch[1].replace(/,/g, ''))
      state.selectedSide = betMatch[2] as 'YES' | 'NO'
      state.screen = 'confirm'
      return render()
    }
    return
  }

  if (state.screen === 'confirm') {
    if (name === CONFIRM_ITEM) {
      const bet = state.placeBet()
      if (bet) {
        await persistBets()
        // Day 3: also record the bet in the backend ledger so it shows
        // up in the Telegram digest. Best-effort and non-blocking: the
        // bet is already saved locally, so a failed submit never stops
        // the done screen.
        void provider
          .submitPaperBet?.(bet)
          .catch((err) =>
            console.warn('[headsup] paper-bet submit failed (local copy kept):', err),
          )
      }
      state.screen = 'done'
      return render()
    }
    if (name === CANCEL_ITEM) {
      state.screen = 'detail'
      return render()
    }
    return
  }

  if (state.screen === 'alerts') {
    if (name === BACK_ITEM) return goHome()
    const alert = state.alerts.find((a) => name.startsWith(`${a.symbol} `))
    if (alert) {
      alert.enabled = !alert.enabled
      return render()
    }
    return
  }
}

/** Text-container click (done / error screens). */
async function onTextClick(): Promise<void> {
  if (state.screen === 'done') return goHome()
  // Error screen: tap retries the fetch.
  if (showingError) {
    if (await refresh()) {
      state.screen = 'home'
      return render()
    }
    return showError('Still offline. Check connection.')
  }
}

function isClick(type: OsEventTypeList | undefined): boolean {
  return type === OsEventTypeList.CLICK_EVENT || type === undefined
}

function isDoubleClick(type: OsEventTypeList | undefined): boolean {
  return type === OsEventTypeList.DOUBLE_CLICK_EVENT
}

async function onEvent(event: EvenHubEvent): Promise<void> {
  const listEvent = event.listEvent
  const textEvent = event.textEvent
  const sysEvent = event.sysEvent

  // Double-tap anywhere = back (or exit dialog on root).
  const type = listEvent?.eventType ?? textEvent?.eventType ?? sysEvent?.eventType
  if (isDoubleClick(type)) {
    await goBack()
    return
  }
  if (!isClick(type)) return

  // Click cooldown: swallow duplicate deliveries.
  const now = Date.now()
  if (now - lastClickAt < CLICK_COOLDOWN_MS) return
  lastClickAt = now

  if (listEvent) {
    await onListSelect(listEvent.currentSelectItemName)
    return
  }
  if (textEvent || sysEvent) {
    // sysEvent clicks (simulator) carry no selection; on text screens
    // they mean the same as a text click. On list screens without a
    // listEvent we cannot resolve a selection, so ignore.
    if (state.screen === 'done' || showingError) {
      await onTextClick()
    }
    return
  }
}

async function boot(): Promise<void> {
  bridge = await waitForEvenAppBridge()
  console.log('[headsup] bridge ready')

  // Loading page first so the glasses are never blank.
  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer(loadingPage()),
  )
  if (created !== 0) {
    console.error('[headsup] startup page failed:', created)
    return
  }
  started = true
  bridge.onEvenHubEvent((event) => void onEvent(event))

  await loadBets()

  if (!(await refresh())) {
    await showError('Could not load markets.')
    console.log(READY_MARKER)
    return
  }
  state.screen = 'home'
  await render()
  console.log(READY_MARKER)

  // Background refresh (home screen only; never interrupts a flow).
  setInterval(() => {
    void (async () => {
      if (state.screen !== 'home') return
      if (await refresh()) await render()
    })()
  }, REFRESH_INTERVAL_MS)
}

boot().catch((err) => console.error('[headsup] fatal boot error:', err))
