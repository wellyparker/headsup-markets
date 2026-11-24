// Build-time env for the glasses app.
//
// VITE_BACKEND_URL — base URL of the HeadsUp backend proxy
// (server/index.mjs). Default when unset: http://localhost:3000.
// Set it at build time for a deployed backend, e.g.:
//   VITE_BACKEND_URL=https://headsup.example.com npm run build
//
// Declared here (not only in vite-env.d.ts) so the offline mock build
// (tsconfig.dev.json, which excludes vite-env.d.ts) type-checks too.
// The declarations merge with vite/client's own ImportMetaEnv.
interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
