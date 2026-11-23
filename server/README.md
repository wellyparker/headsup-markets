# HeadsUp backend proxy (DAY 2 — not built yet)

One small read-only proxy that the glasses app calls instead of hitting
public APIs directly:

- `GET /snapshot` → `{ prices: PriceTick[], markets: Market[] }`
  - Prices: CoinGecko `/simple/price` (BTC, ETH, SOL, XAUT; public, no key)
  - Markets: Polymarket Gamma `/markets` (top watched markets; public, no key)
- `POST /paper-bet` (day 3) → records a paper bet, returns a Telegram
  digest trigger. Paper bets are virtual ledger entries only.
- Telegram digest bot (day 3): daily market digest to the user's chat.

Hosting target (free tier): to be decided day 2 — Altare free tier is
available (used before for other projects); alternatives: Cloudflare
Workers free tier or Fly.io free tier. No paid services.

Security: no API keys in the glasses app (per Even Hub rules, keys live
server-side); the proxy only calls public no-key endpoints in v1.
