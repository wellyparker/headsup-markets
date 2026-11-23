import { defineConfig } from 'vite'

// HeadsUp Markets — Even Hub (G2) web app.
// Dev server port 5173 is what the simulator points at:
//   evenhub-simulator http://localhost:5173
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
})
