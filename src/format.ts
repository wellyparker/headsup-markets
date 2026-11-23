/**
 * Text formatting helpers for the 576x288 monochrome-green canvas.
 *
 * Constraints (Even Hub docs + firmware font):
 * - No font size / bold / alignment control. "Centering" = manual padding.
 * - A full-screen text container holds roughly 400-500 characters.
 * - List items: max 64 chars each, max 20 items per list.
 * - Unicode works only for glyphs in the firmware font set. We stick to
 *   plain ASCII + a small set of widely-supported block/box characters
 *   (verified in the design-guidelines glyph table; the simulator will
 *   confirm rendering, hardware is the final check).
 */

/** USD price with adaptive precision: $61,780 / $3,612.44 / $0.9821. */
export function fmtPrice(usd: number): string {
  if (!Number.isFinite(usd)) return '--'
  if (usd >= 1000) return '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (usd >= 10) return '$' + usd.toFixed(2)
  if (usd >= 1) return '$' + usd.toFixed(3)
  return '$' + usd.toFixed(4)
}

/** Signed percent, e.g. +4.54% / -2.91%. */
export function fmtPct(pct: number): string {
  if (!Number.isFinite(pct)) return '--'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

/** Compact USD volume, e.g. $1.2M / $842K. */
export function fmtVolume(usd: number): string {
  if (!Number.isFinite(usd)) return '--'
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`
  return `$${usd.toFixed(0)}`
}

/**
 * Horizontal probability bar using block characters.
 * bar(62, 20) -> "############........ 62%"
 * (Uses '#' / '.' — plain ASCII, guaranteed in the firmware font.)
 */
export function probBar(yesPct: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, yesPct))
  const filled = Math.round((clamped / 100) * width)
  return '#'.repeat(filled) + '.'.repeat(width - filled)
}

/** Pad/truncate a string to exactly `len` chars (for column layout). */
export function pad(s: string, len: number): string {
  if (s.length > len) return s.slice(0, len)
  return s + ' '.repeat(len - s.length)
}

/** Truncate with ellipsis to at most `len` chars. */
export function trunc(s: string, len: number): string {
  if (s.length <= len) return s
  if (len <= 3) return s.slice(0, len)
  return s.slice(0, len - 3) + '...'
}

/** Short clock stamp, e.g. "15:04". */
export function fmtTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
