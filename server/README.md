# HeadsUp backend proxy (BUILT day 2, WRITE + digest day 3)

One small proxy that the glasses app calls instead of hitting public
APIs directly. Zero dependencies (plain `node:http` + global `fetch`),
Node >= 20.17. Day 3 added the virtual paper-bet ledger and the
Telegram digest plumbing.

## Run

```bash
cd server
npm start            # listens on 0.0.0.0:3000 (PORT/HOST env override)
```

On this dev VM the egress proxy is required for upstream calls; Node
reads it from the environment when `NODE_USE_ENV_PROXY=1` is set (it
already is in the dev shell). A deployed instance needs no proxy config.

## Endpoints

- `GET /snapshot` → `{ prices: PriceTick[], markets: Market[] ,
  fetchedAt: string, stale: boolean }`
  - Prices: CoinGecko `/simple/price` — BTC, ETH, SOL, XAUT + 24h change.
  - Markets: Polymarket Gamma `public-search`, one watched market per
    term — bitcoin, ethereum, solana, fed, gold price (most-traded
    binary Yes/No market of the first live event). Gaps are filled from
    top-volume binary markets so the list is never short.
  - 60 s in-memory cache, warmed at startup. On upstream failure the
    last good snapshot is served with `stale: true`; 502 only when
    there is no cached snapshot yet.
- `GET /health` → `{ ok, uptimeSec, cacheAgeMs, lastGoodAt, betsRecorded }`
- `POST /paper-bet` → `201 { bet }` — records a paper bet in the
  virtual ledger. Body: `{ marketId, question, side: 'YES'|'NO',
  amountUsd, oddsPct }` (validated; 400 on bad input). The ledger is
  kept in memory + persisted to `server/data/ledger.json` (gitignored
  — user activity data, never committed). Oldest bets drop off past
  1,000 entries.
- `GET /paper-bets` → `{ bets: Bet[] }`, most recent first.
- `GET /digest/preview` → `{ text }` — the daily digest text (prices,
  watched markets, last-24h paper bets with mark-to-market P&L), no
  token needed. 502 when no snapshot is cached yet.
- `POST /digest/send` → `{ sent: bool, reason? }` — delivers the
  digest via Telegram when `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
  are set in the environment; otherwise no-ops (`{ sent: false,
  reason: 'no-token' }`, log line "digest skipped: no token").

## Telegram digest

`digest.mjs` formats the digest and sends it via the Telegram Bot API.
Setup (when a bot exists — not yet created):

```bash
export TELEGRAM_BOT_TOKEN=...   # from @BotFather, never commit it
export TELEGRAM_CHAT_ID=...     # the chat/user to receive the digest
npm start
curl -X POST http://localhost:3000/digest/send
```

There is an automatic daily timer in the server (day 4): every day at
`DIGEST_TIME_WIB` (default `08:00` WIB) it refreshes the snapshot and
sends the digest. If the upstreams are down at that moment it logs
"daily digest skipped" and tries again the next day — `POST
/digest/send` stays available as a manual retry. The next run is
visible in `GET /health` (`digest.nextDigestAt`).

The server also long-polls Telegram `getUpdates` (day 4) and replies
to `/start` with a short welcome message — the bot stayed silent on
`/start` on 24 + 27 Nov. The poll offset is persisted to
`server/data/telegram-offset.json` (gitignored) so a restart never
re-replies to an old `/start`. Polling runs only when
`TELEGRAM_BOT_TOKEN` is set.

## Notes

- CORS is wide open (`Access-Control-Allow-Origin: *`) — the glasses
  WebView fetches this from a different origin.
- No API keys anywhere in the app (both upstreams are public, no key).
  The only secret in the whole system is the Telegram bot token, which
  lives in the environment only — never in the repo, never in logs.
- Upstream timeout is 60 s (Gamma measured 35 s through the dev VM's
  egress proxy on 24 Nov); the 60 s cache means a slow cold build is
  paid once.

## Hosting (to decide before submission)

Target: a free tier — Altare (already used for other projects),
Cloudflare Workers, or Fly.io. The server is a single file with no
build step: `node server/index.mjs` with `PORT` set is the whole
deploy. The glasses app reads its URL from `VITE_BACKEND_URL`
(default `http://localhost:3000` for local dev/simulator).
