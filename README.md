# HeadsUp Markets

Live prediction-market odds and crypto prices on Even Realities G2 smart
glasses — glanceable, tap-first, paper-trading only.

Built for the **Heads Up: Even Realities Hackathon** (DoraHacks, 23–29 Nov
2026) — **Track 2: Crypto & DeFi**, with a Telegram digest layer (also
aiming for the Best Telegram Integration prize).

## What it does

- **READ** — live Polymarket odds for watched markets + CoinGecko prices
  (BTC/ETH/SOL/XAUT), glanceable on the 576×288 monochrome-green display.
- **WRITE** — one-tap **paper bet** confirmation (virtual ledger, no real
  money, no wallets, no exchange accounts) and price alerts.
- **TELEGRAM** — daily market digest via bot (coming in the build week).
- **VOICE (optional)** — ask about a market out loud on hardware; the app
  is fully usable tap/ring-first because audio does not work in the
  simulator.

## Money safety

- Read-only market data + paper trading only. The app never holds user
  funds, never connects a wallet, never places real trades, and gives no
  financial advice.
- No API keys in the app. Public no-key endpoints (Polymarket Gamma,
  CoinGecko) are called via a small backend proxy.

## Quick start

```bash
npm install
npm run dev            # Vite dev server on http://localhost:5173
evenhub-simulator http://localhost:5173
```

Backend proxy (the app reads live data through it; run it before the app
if you want live data instead of the offline fallback):

```bash
cd server && npm start   # GET /snapshot on http://localhost:3000
```

The app's backend URL is baked in at build time from `VITE_BACKEND_URL`
(default `http://localhost:3000`; see `.env.example`). Without a reachable
backend the app degrades to offline fixtures — the home header shows
`[MOCK]` instead of `[LIVE]`.

Headless simulator test (needs the simulator's automation port):

```bash
npm run dev
evenhub-simulator http://localhost:5173 --automation-port 9898
python3 devtools/sim-test.py
```

Offline mock (no Even tooling needed — runs the real app against a mock
bridge in a plain browser):

```bash
bash devtools/mock-build.sh
python3 -m http.server 5173 --directory dist-dev
# open http://localhost:5173/mock-harness.html
```

Package for sideload / beta:

```bash
npm run pack           # -> headsup-markets.ehpk
```

## Project layout

```
app.json              Even Hub manifest (package_id, permissions, network whitelist)
index.html            Vite entry
src/
  main.ts             Boot, event routing, navigation
  screens.ts          Page renderers (home / detail / confirm / done / alerts)
  state.ts            App state + navigation model
  data.ts             DataProvider interface (BackendProvider live, MockProvider fallback)
  fixtures.ts         Offline fixture data (fallback when the backend is unreachable)
  format.ts           Canvas text formatting helpers
  voice.ts            Voice capture scaffolding (hardware-only)
  env.d.ts            VITE_BACKEND_URL typing
  types/              Ambient SDK fallback types (inert once the real SDK installs)
mock/                 Mock EvenAppBridge for plain-browser dev (dev-only)
devtools/             Mock harness + headless simulator test
server/               Backend proxy: GET /snapshot (CoinGecko + Polymarket Gamma)
```

## Controls (glasses / simulator)

| Input | Action |
| --- | --- |
| Up / Down | Move through list items |
| Click (tap) | Select focused item |
| Double-click | Back (root page: system exit dialog) |

## Hackathon disclosure

Per the hackathon rules, what existed **before 23 Nov 2026** (kickoff):

- Research notes only (prize/track/schedule verification, SDK docs
  reading, concept sketch). **No code was written before kickoff.**
- All code in this repo was written during the build week (23–29 Nov
  2026), starting at kickoff on 23 Nov 15:00 WIB.

Third-party code: the official Even Hub SDK (`@evenrealities/even_hub_sdk`
0.0.14), CLI (0.2.0) and simulator (0.9.3), plus Vite + TypeScript
(open source, standard dependencies). No starter template code was
copied — the scaffold follows the official "Your First App" guide.

## License

MIT — see [LICENSE](LICENSE).
