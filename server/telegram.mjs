// HeadsUp Markets — Telegram Bot API helpers (zero dependencies).
//
// Shared by the digest sender (digest.mjs) and the /start reply
// handler (index.mjs). The Bot API base is overridable for tests:
//   TELEGRAM_API_BASE=http://127.0.0.1:PORT  (default https://api.telegram.org)
// The token is read from the environment only and never logged.

export function telegramApiBase() {
  return (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '')
}

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** Persist the getUpdates offset so a restart never re-replies to an old /start. */
function loadOffset(offsetFile) {
  if (!offsetFile) return 0
  try {
    const n = Number(JSON.parse(readFileSync(offsetFile, 'utf8')).offset)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function saveOffset(offsetFile, offset) {
  if (!offsetFile) return
  try {
    mkdirSync(dirname(offsetFile), { recursive: true })
    writeFileSync(offsetFile, JSON.stringify({ offset }))
  } catch (err) {
    console.error('[headsup-telegram] offset save failed:', err.message)
  }
}

/** POST one Bot API method. Returns the parsed JSON body. */
export async function callTelegram(token, method, body, timeoutMs = 30_000) {
  const res = await fetch(`${telegramApiBase()}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) {
    throw new Error(`telegram ${method} failed: ${res.status} ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json
}

/** Send a plain-text message. Returns true on success. */
export async function sendTelegramMessage(token, chatId, text, timeoutMs = 60_000) {
  await callTelegram(token, 'sendMessage', { chat_id: chatId, text }, timeoutMs)
  return true
}

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_S = 10 // long-poll window per getUpdates call

/**
 * Long-poll getUpdates and invoke onMessage for every new message.
 * Only /start messages are handed to onStart (chatId, firstName).
 * Returns a controller { stop(), state } — state tracks last poll,
 * replies sent and errors for /health. Never throws out of the loop:
 * a failed poll logs and retries after POLL_INTERVAL_MS.
 */
export function startTelegramPolling(token, { onStart, offsetFile }) {
  const state = {
    running: true,
    lastPollAt: null,
    lastError: null,
    repliesSent: 0,
    updatesSeen: 0,
  }
  let offset = loadOffset(offsetFile)
  const seen = new Set()
  let timer = null
  let stopped = false

  async function pollOnce() {
    if (stopped) return
    try {
      const json = await callTelegram(
        token,
        'getUpdates',
        { offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message'] },
        (POLL_TIMEOUT_S + 20) * 1000,
      )
      state.lastPollAt = new Date().toISOString()
      state.lastError = null
      let offsetChanged = false
      for (const update of json.result ?? []) {
        if (typeof update.update_id === 'number') {
          const next = update.update_id + 1
          if (next > offset) {
            offset = next
            offsetChanged = true
          }
        }
        if (seen.has(update.update_id)) continue
        seen.add(update.update_id)
        if (seen.size > 1000) {
          // Keep the set bounded; oldest entries drop first.
          for (const id of seen) {
            seen.delete(id)
            break
          }
        }
        state.updatesSeen += 1
        const msg = update.message
        const text = typeof msg?.text === 'string' ? msg.text.trim() : ''
        if (text.startsWith('/start') && msg?.chat?.id != null) {
          try {
            await onStart(msg.chat.id, msg.from?.first_name)
            state.repliesSent += 1
          } catch (err) {
            console.error('[headsup-telegram] /start reply failed:', err.message)
          }
        }
      }
      if (offsetChanged) saveOffset(offsetFile, offset)
    } catch (err) {
      // 409 = another getUpdates consumer is running (e.g. a second
      // instance). Log once per failure, keep retrying — the deployed
      // instance wins the race and this one stays quiet.
      state.lastError = err.message
      console.error('[headsup-telegram] poll failed:', err.message)
    }
    if (!stopped) timer = setTimeout(pollOnce, POLL_INTERVAL_MS)
  }

  pollOnce()
  return {
    state,
    stop() {
      stopped = true
      state.running = false
      if (timer) clearTimeout(timer)
    },
  }
}
