# HeadsUp backend proxy (BUILT day 2)

One small read-only proxy that the glasses app calls instead of hitting
public APIs directly. Zero dependencies (plain `node:http` + global
`fetch`), Node >= 20.17.

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
- `GET /health` → `{ ok, uptimeSec, cacheAgeMs, lastGoodAt }`

## Notes

- CORS is wide open (`Access-Control-Allow-Origin: *`) — the glasses
  WebView fetches this from a different origin.
- No API keys anywhere (both upstreams are public, no key) and no user
  data: the proxy only aggregates public read-only market data.
- `POST /paper-bet` + Telegram digest arrive day 3.

## Hosting (to decide before submission)

Target: a free tier — Altare (already used for other projects),
Cloudflare Workers, or Fly.io. The server is a single file with no
build step: `node server/index.mjs` with `PORT` set is the whole
deploy. The glasses app reads its URL from `VITE_BACKEND_URL`
(default `http://localhost:3000` for local dev/simulator).
