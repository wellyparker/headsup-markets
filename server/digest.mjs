// HeadsUp Markets — Telegram digest (day 3).
//
// formatDigest() turns the latest snapshot + the paper-bet ledger into a
// plain-text digest. sendDigest() delivers it via the Telegram Bot API —
// but ONLY when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in the
// environment. With no token configured it no-ops gracefully (logs
// "digest skipped: no token" and returns { sent: false }) so the server
// is fully usable without any Telegram setup.
//
// No token is ever committed or logged: the token lives only in the
// process environment (see server/README.md).

const TELEGRAM_TIMEOUT_MS = 15_000
// Telegram caps a message at 4096 chars; stay comfortably under it.
const MAX_DIGEST_CHARS = 3500

function fmtUsd(n) {
  if (!Number.isFinite(n)) return '--'
  if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US')
  if (n >= 10) return '$' + n.toFixed(2)
  return '$' + n.toFixed(3)
}

function fmtSigned(n) {
  if (!Number.isFinite(n)) return '--'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function fmtSignedUsd(n) {
  if (!Number.isFinite(n)) return '--'
  const sign = n >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(n).toFixed(2)}`
}

function trunc(s, len) {
  if (s.length <= len) return s
  return s.slice(0, len - 3) + '...'
}

function marketById(markets, id) {
  return (markets ?? []).find((m) => String(m.id) === String(id))
}

/**
 * Mark-to-market for a paper bet against the current odds.
 * value = stake * (currentSidePct / entryOddsPct); pnl = value - stake.
 * Returns null when the market is no longer in the snapshot.
 */
function markBet(bet, markets) {
  const m = marketById(markets, bet.marketId)
  if (!m) return null
  const currentPct = bet.side === 'YES' ? m.yesPct : m.noPct
  if (!Number.isFinite(currentPct) || !Number.isFinite(bet.oddsPct) || bet.oddsPct <= 0) {
    return null
  }
  const value = (bet.amountUsd * currentPct) / bet.oddsPct
  return { currentPct, pnl: value - bet.amountUsd }
}

/**
 * Build the digest text.
 *
 * @param {{ prices: Array, markets: Array }} snapshot - latest snapshot
 * @param {Array} bets - ledger bets (recent first is fine; only the last
 *   24h are shown)
 * @param {Date} [generatedAt] - stamp for the header (default: now)
 * @returns {string} plain-text digest, Telegram-ready
 */
export function formatDigest(snapshot, bets, generatedAt = new Date()) {
  const prices = snapshot?.prices ?? []
  const markets = snapshot?.markets ?? []
  const lines = []

  const stamp = generatedAt.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
  lines.push(`HeadsUp Markets — daily digest`)
  lines.push(`${stamp} WIB`)
  lines.push('')

  lines.push('Prices')
  if (prices.length === 0) {
    lines.push('  (no price data)')
  } else {
    for (const p of prices) {
      lines.push(`  ${p.symbol} ${fmtUsd(p.usd)} (${fmtSigned(p.change24hPct)})`)
    }
  }
  lines.push('')

  lines.push('Watched markets')
  if (markets.length === 0) {
    lines.push('  (no market data)')
  } else {
    for (const m of markets) {
      lines.push(`  - ${trunc(m.question, 72)} — YES ${m.yesPct}%`)
    }
  }
  lines.push('')

  lines.push('Paper bets (last 24h)')
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const recent = (bets ?? []).filter((b) => {
    const t = Date.parse(b.placedAt)
    return Number.isFinite(t) && t >= cutoff
  })
  if (recent.length === 0) {
    lines.push('  No paper bets yet — place one from your glasses.')
  } else {
    for (const bet of recent.slice(-10)) {
      const mark = markBet(bet, markets)
      const markStr = mark
        ? `now ${mark.currentPct}% (${fmtSignedUsd(mark.pnl)})`
        : 'odds n/a'
      lines.push(
        `  - $${bet.amountUsd.toLocaleString('en-US')} ${bet.side} @ ${bet.oddsPct}% — ${trunc(bet.question, 48)} → ${markStr}`,
      )
    }
    const totalPnl = recent.reduce((sum, b) => {
      const mark = markBet(b, markets)
      return sum + (mark ? mark.pnl : 0)
    }, 0)
    lines.push(`  Total P&L: ${fmtSignedUsd(totalPnl)} (paper)`)
  }

  const text = lines.join('\n')
  return text.length > MAX_DIGEST_CHARS
    ? text.slice(0, MAX_DIGEST_CHARS - 3) + '...'
    : text
}

/**
 * Send the digest via Telegram (or no-op when unconfigured).
 *
 * Reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from the environment.
 * Returns { sent: true } on success, { sent: false, reason } otherwise.
 * The token is never logged.
 */
export async function sendDigest({ snapshot, bets }) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.log('[headsup-digest] digest skipped: no token')
    return { sent: false, reason: 'no-token' }
  }
  const text = formatDigest(snapshot, bets)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[headsup-digest] telegram send failed:', res.status, body.slice(0, 200))
      return { sent: false, reason: `telegram-${res.status}` }
    }
    console.log('[headsup-digest] digest sent')
    return { sent: true }
  } catch (err) {
    console.error('[headsup-digest] telegram send error:', err.message)
    return { sent: false, reason: 'network-error' }
  }
}
