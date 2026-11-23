/**
 * Mock EvenAppBridge for plain-browser development.
 *
 * The real SDK bridge only exists inside the Even App WebView (or the
 * simulator). This mock implements the same module surface so the app
 * can run in any browser: it renders SDK containers into a 576x288
 * green-on-black DOM canvas and simulates temple/ring input.
 *
 * Wiring (offline dev only — see devtools/mock-build.sh):
 *   1. tsc compiles src/ + mock/ to dist-dev/ as ES modules.
 *   2. devtools/mock-harness.html serves with an import map:
 *      "@evenrealities/even_hub_sdk" -> "./mock/even-mock.js"
 *   3. Serve dist-dev/ statically and open mock-harness.html.
 *
 * Input simulation: click the on-screen buttons in the harness, use the
 * keyboard (ArrowUp/ArrowDown/Enter, D = double-tap), or call
 *   window.__mockInput('up' | 'down' | 'click' | 'double_click')
 * from the console / Playwright.
 *
 * This file is DEV-ONLY. It is never imported by src/ and never ships
 * in the .ehpk (Vite bundles the real SDK for production).
 */

// ---------------------------------------------------------------------------
// SDK surface (mirrors src/types/even_hub_sdk.d.ts — keep in sync)
// ---------------------------------------------------------------------------

export enum OsEventTypeList {
  CLICK_EVENT = 0,
  SCROLL_TOP_EVENT = 1,
  SCROLL_BOTTOM_EVENT = 2,
  DOUBLE_CLICK_EVENT = 3,
  FOREGROUND_ENTER_EVENT = 4,
  FOREGROUND_EXIT_EVENT = 5,
  ABNORMAL_EXIT_EVENT = 6,
  LONG_PRESS_EVENT = 7,
  LONG_PRESS_RELEASE_EVENT = 8,
}

export interface TextEvent {
  containerID: number
  containerName: string
  eventType?: OsEventTypeList
}

export interface ListEvent {
  containerID: number
  containerName: string
  currentSelectItemName?: string
  currentSelectItemIndex?: number
  eventType?: OsEventTypeList
}

export interface SysEvent {
  eventType?: OsEventTypeList
}

export interface AudioEvent {
  audioPcm?: Uint8Array
}

export interface EvenHubEvent {
  textEvent?: TextEvent
  listEvent?: ListEvent
  sysEvent?: SysEvent
  audioEvent?: AudioEvent
  jsonData?: unknown
}

export class TextContainerProperty {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

export class TextContainerUpgrade {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

export class ListItemContainerProperty {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

export class ListContainerProperty {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

export class ImageContainerProperty {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

export class CreateStartUpPageContainer {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

export class RebuildPageContainer {
  props: Record<string, unknown>
  constructor(props: Record<string, unknown>) {
    this.props = props
  }
}

// ---------------------------------------------------------------------------
// Mock bridge
// ---------------------------------------------------------------------------

interface AnyProps {
  [key: string]: unknown
}

type AnyContainer = AnyProps

function unwrap(page: unknown): AnyProps {
  const p = page as { props?: AnyProps }
  return p.props ?? (page as AnyProps)
}

function unwrapContainer(c: unknown): AnyProps {
  const p = c as { props?: AnyProps }
  return p.props ?? (c as AnyProps)
}

const BRIGHTNESS = ['#1a3a20', '#2f6b35', '#4c9a4f', '#6fbf6a', '#8dff8a']

export class EvenAppBridge {
  private static instance: EvenAppBridge | null = null
  private handler: ((event: EvenHubEvent) => void) | null = null
  private containers: AnyContainer[] = []
  private capture: AnyContainer | null = null
  private focusIndex = 0
  private canvas: HTMLElement | null = null
  private logEl: HTMLElement | null = null

  static getInstance(): EvenAppBridge {
    if (!EvenAppBridge.instance) EvenAppBridge.instance = new EvenAppBridge()
    return EvenAppBridge.instance
  }

  private log(msg: string): void {
    console.log(`[mock-bridge] ${msg}`)
    if (this.logEl) {
      const line = document.createElement('div')
      line.textContent = msg
      this.logEl.appendChild(line)
      this.logEl.scrollTop = this.logEl.scrollHeight
    }
  }

  private ensureCanvas(): HTMLElement {
    if (this.canvas) return this.canvas
    let el = document.getElementById('glasses-canvas')
    if (!el) {
      el = document.createElement('div')
      el.id = 'glasses-canvas'
      document.body.appendChild(el)
    }
    this.canvas = el
    this.logEl = document.getElementById('mock-log')
    return el
  }

  private render(): void {
    const canvas = this.ensureCanvas()
    canvas.innerHTML = ''
    for (const c of this.containers) {
      const x = Number(c.xPosition ?? 0)
      const y = Number(c.yPosition ?? 0)
      const w = Number(c.width ?? 0)
      const h = Number(c.height ?? 0)
      const div = document.createElement('div')
      div.style.cssText = [
        'position:absolute',
        `left:${x}px`,
        `top:${y}px`,
        `width:${w}px`,
        `height:${h}px`,
        'overflow:hidden',
        'box-sizing:border-box',
        Number(c.borderWidth ?? 0) > 0
          ? `border:${c.borderWidth}px solid #4c9a4f`
          : '',
        `padding:${Number(c.paddingLength ?? 0)}px`,
      ].join(';')

      if (typeof c.content === 'string') {
        // Text container.
        const level = Math.max(
          0,
          Math.min(4, Number(c.textColor ?? 4)),
        )
        const pre = document.createElement('pre')
        pre.style.cssText = [
          'margin:0',
          'white-space:pre-wrap',
          'word-break:break-word',
          `color:${BRIGHTNESS[level]}`,
          'font-family:ui-monospace,Menlo,monospace',
          'font-size:15px',
          'line-height:1.35',
        ].join(';')
        pre.textContent = c.content
        div.appendChild(pre)
      } else if (c.itemContainer) {
        // List container.
        const items = unwrapContainer(c.itemContainer)
        const names = (items.itemName as string[]) ?? []
        const ul = document.createElement('div')
        ul.style.cssText =
          'font-family:ui-monospace,Menlo,monospace;font-size:15px;line-height:1.5;color:#8dff8a;height:100%;overflow-y:auto'
        const rows: HTMLElement[] = []
        names.forEach((name, i) => {
          const row = document.createElement('div')
          row.style.cssText = [
            'white-space:nowrap',
            'overflow:hidden',
            'text-overflow:ellipsis',
            i === this.focusIndex
              ? 'background:#8dff8a;color:#000'
              : '',
          ].join(';')
          row.textContent = `${i === this.focusIndex ? '> ' : '  '}${name}`
          rows.push(row)
          ul.appendChild(row)
        })
        div.appendChild(ul)
        // Firmware keeps the focused item visible; mirror that here.
        rows[this.focusIndex]?.scrollIntoView({ block: 'nearest' })
      }
      canvas.appendChild(div)
    }
  }

  private setPage(page: unknown): void {
    const p = unwrap(page)
    const text = ((p.textObject as unknown[]) ?? []).map(unwrapContainer)
    const list = ((p.listObject as unknown[]) ?? []).map(unwrapContainer)
    const image = ((p.imageObject as unknown[]) ?? []).map(unwrapContainer)
    this.containers = [...text, ...list, ...image]
    this.capture =
      this.containers.find((c) => Number(c.isEventCapture ?? 0) === 1) ?? null
    this.focusIndex = 0
    this.render()
  }

  async createStartUpPageContainer(page: unknown): Promise<number> {
    this.log('createStartUpPageContainer')
    this.setPage(page)
    return 0
  }

  async rebuildPageContainer(page: unknown): Promise<boolean> {
    this.log('rebuildPageContainer')
    this.setPage(page)
    return true
  }

  async textContainerUpgrade(upgrade: unknown): Promise<boolean> {
    const u = unwrap(upgrade)
    const target = this.containers.find(
      (c) => Number(c.containerID) === Number(u.containerID),
    )
    if (!target) {
      this.log(`textContainerUpgrade: container ${String(u.containerID)} not found`)
      return false
    }
    target.content = u.content
    if (u.textColor !== undefined) target.textColor = u.textColor
    this.log(`textContainerUpgrade container=${String(u.containerID)}`)
    this.render()
    return true
  }

  async updateImageRawData(): Promise<unknown> {
    this.log('updateImageRawData (mock: ignored)')
    return { success: true }
  }

  async shutDownPageContainer(mode: number): Promise<boolean> {
    this.log(
      mode === 1
        ? 'shutDownPageContainer(1) — exit dialog would show on hardware'
        : 'shutDownPageContainer(0)',
    )
    const canvas = this.ensureCanvas()
    canvas.innerHTML =
      '<div style="padding:16px;color:#8dff8a;font-family:monospace">Exit dialog (simulated).<br/>Reload the page to restart.</div>'
    return true
  }

  onEvenHubEvent(cb: (event: EvenHubEvent) => void): void {
    this.handler = cb
  }

  audioControl(on: boolean): void {
    this.log(`audioControl(${on}) — mic is hardware-only, no-op in mock`)
  }

  async getDeviceInfo(): Promise<{
    model: string
    sn: string
    status: { batteryLevel: number; isWearing: boolean; isCharging: boolean }
  }> {
    return {
      model: 'MockG2',
      sn: 'MOCK-0000',
      status: { batteryLevel: 100, isWearing: true, isCharging: false },
    }
  }

  async getUserInfo(): Promise<{ uid: string; name: string }> {
    return { uid: 'mock-user', name: 'Mock User' }
  }

  async setLocalStorage(key: string, value: string): Promise<boolean> {
    try {
      window.localStorage.setItem(`mock:${key}`, value)
      return true
    } catch {
      return false
    }
  }

  async getLocalStorage(key: string): Promise<string> {
    try {
      return window.localStorage.getItem(`mock:${key}`) ?? ''
    } catch {
      return ''
    }
  }

  onDeviceStatusChanged(): () => void {
    return () => undefined
  }

  // -- input simulation (driven by the harness) ---------------------------

  simulate(action: 'up' | 'down' | 'click' | 'double_click'): void {
    if (!this.handler) return
    const cap = this.capture
    if (!cap) {
      this.log(`input ${action} ignored (no event-capture container)`)
      return
    }
    const isList = Boolean(cap.itemContainer)
    if (action === 'up' || action === 'down') {
      if (!isList) return
      const items = unwrapContainer(cap.itemContainer)
      const count = ((items.itemName as string[]) ?? []).length
      if (count === 0) return
      if (action === 'down') this.focusIndex = (this.focusIndex + 1) % count
      else this.focusIndex = (this.focusIndex - 1 + count) % count
      this.render()
      return
    }
    if (action === 'click') {
      if (isList) {
        const items = unwrapContainer(cap.itemContainer)
        const names = (items.itemName as string[]) ?? []
        const name = names[this.focusIndex]
        this.log(`click -> list item "${name ?? ''}" (index ${this.focusIndex})`)
        this.handler({
          listEvent: {
            containerID: Number(cap.containerID),
            containerName: String(cap.containerName),
            currentSelectItemName: name,
            // Index 0 arrives as undefined on some SDK versions — the
            // mock reproduces that quirk on purpose.
            currentSelectItemIndex:
              this.focusIndex === 0 ? undefined : this.focusIndex,
            eventType: OsEventTypeList.CLICK_EVENT,
          },
        })
      } else {
        this.log('click -> text container')
        this.handler({
          textEvent: {
            containerID: Number(cap.containerID),
            containerName: String(cap.containerName),
            eventType: undefined, // SDK normalizes CLICK 0 -> undefined
          },
        })
      }
      return
    }
    // double_click
    this.log('double_click')
    if (isList) {
      this.handler({
        listEvent: {
          containerID: Number(cap.containerID),
          containerName: String(cap.containerName),
          eventType: OsEventTypeList.DOUBLE_CLICK_EVENT,
        },
      })
    } else {
      this.handler({
        textEvent: {
          containerID: Number(cap.containerID),
          containerName: String(cap.containerName),
          eventType: OsEventTypeList.DOUBLE_CLICK_EVENT,
        },
      })
    }
  }
}

export async function waitForEvenAppBridge(): Promise<EvenAppBridge> {
  // In the mock the bridge is ready as soon as the DOM is.
  if (document.readyState === 'loading') {
    await new Promise((resolve) =>
      document.addEventListener('DOMContentLoaded', resolve, { once: true }),
    )
  }
  return EvenAppBridge.getInstance()
}

// Harness hook: window.__mockInput('click') etc.
declare global {
  interface Window {
    __mockInput?: (action: 'up' | 'down' | 'click' | 'double_click') => void
  }
}

if (typeof window !== 'undefined') {
  window.__mockInput = (action) =>
    EvenAppBridge.getInstance().simulate(action)
}
