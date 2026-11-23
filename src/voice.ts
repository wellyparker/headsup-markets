/**
 * Voice capture scaffolding (hardware-only path, NOT the primary UX).
 *
 * Status day 1: coded, not wired into navigation. The Even Hub audio API
 * does not work in the simulator (documented caveat), so this path can
 * only be verified on real G2 hardware (or tomi's phone sideload).
 * Navigation stays tap/ring-first; voice is an optional accelerator.
 *
 * How it works on hardware:
 * - bridge.audioControl(true) opens the 4-mic array: 16 kHz PCM S16LE,
 *   mono, ~100 ms per audioEvent (3,200 bytes / 1,600 samples).
 * - Frames are buffered here until audioControl(false), then handed to
 *   a Transcriber. No audio is stored on disk.
 *
 * Transcription is deliberately pluggable and FREE-only: the default
 * transcriber is a stub (returns null). A real implementation would
 * stream the PCM to a free-tier STT endpoint via the backend proxy
 * (day 4+ decision — Whisper API is paid, so it is NOT the default).
 * Never commit an STT API key; the backend holds any key server-side.
 */
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk'

export interface Transcriber {
  /** Transcribe buffered 16 kHz PCM S16LE mono audio. Null = no speech. */
  transcribe(pcm: Uint8Array): Promise<string | null>
}

export const stubTranscriber: Transcriber = {
  async transcribe(): Promise<string | null> {
    return null
  },
}

const MAX_CAPTURE_MS = 10_000

export class VoiceCapture {
  private chunks: Uint8Array[] = []
  private capturing = false
  private startedAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private bridge: EvenAppBridge,
    private transcriber: Transcriber = stubTranscriber,
  ) {}

  /** Feed every EvenHubEvent here; audio frames are collected while on. */
  onEvent(event: EvenHubEvent): void {
    if (!this.capturing) return
    const pcm = event.audioEvent?.audioPcm
    if (pcm && pcm.length > 0) this.chunks.push(pcm)
  }

  get isCapturing(): boolean {
    return this.capturing
  }

  start(): void {
    if (this.capturing) return
    this.chunks = []
    this.capturing = true
    this.startedAt = Date.now()
    this.bridge.audioControl(true)
    // Auto-stop: a question should fit in 10 s.
    this.timer = setTimeout(() => void this.stop(), MAX_CAPTURE_MS)
  }

  /** Stop capture and transcribe. Resolves null when nothing was heard. */
  async stop(): Promise<string | null> {
    if (!this.capturing) return null
    this.capturing = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.bridge.audioControl(false)

    const total = this.chunks.reduce((n, c) => n + c.length, 0)
    if (total === 0) return null
    const merged = new Uint8Array(total)
    let offset = 0
    for (const c of this.chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    void this.startedAt
    return this.transcriber.transcribe(merged)
  }
}
