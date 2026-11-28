import type { SaveFormat } from '../types'

// 형식별 우선순위: MP4(m4a)를 먼저 시도하고, 지원하지 않으면 WebM으로 대체
const CANDIDATES: Record<SaveFormat, { mime: string; ext: string }[]> = {
  audio: [
    { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
    { mime: 'audio/mp4', ext: 'm4a' },
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
  ],
  video: [
    { mime: 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ],
}

export function pickFormat(format: SaveFormat): { mime: string; ext: string } {
  for (const c of CANDIDATES[format]) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c
  }
  return { mime: '', ext: format === 'audio' ? 'webm' : 'webm' }
}

export interface RecordingResult {
  blob: Blob
  ext: string
  mime: string
  /** 일시정지 시간을 뺀 실제 녹음 시간(ms) */
  durationMs: number
}

/**
 * MediaRecorder 래퍼: 일시정지 시간을 제외한 녹음 시간을 함께 계산
 */
export class Recorder {
  private recorder: MediaRecorder
  private chunks: Blob[] = []
  private startedAt = 0
  private pausedAt = 0
  private pausedTotal = 0
  readonly ext: string
  readonly mime: string

  constructor(stream: MediaStream, format: SaveFormat) {
    const picked = pickFormat(format)
    this.ext = picked.ext
    const tracks = format === 'audio' ? stream.getAudioTracks() : stream.getTracks()
    const source = new MediaStream(tracks)
    const options: MediaRecorderOptions = {}
    if (picked.mime) options.mimeType = picked.mime
    if (format === 'video') options.videoBitsPerSecond = 2_000_000
    options.audioBitsPerSecond = 128_000
    this.recorder = new MediaRecorder(source, options)
    this.mime = this.recorder.mimeType || picked.mime
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
  }

  start() {
    this.chunks = []
    this.pausedTotal = 0
    this.startedAt = performance.now()
    this.recorder.start(1000)
  }

  pause() {
    if (this.recorder.state !== 'recording') return
    this.recorder.pause()
    this.pausedAt = performance.now()
  }

  resume() {
    if (this.recorder.state !== 'paused') return
    this.recorder.resume()
    this.pausedTotal += performance.now() - this.pausedAt
  }

  /** 지금 실제로 녹음 중인지 (일시정지 제외) */
  get isRecording(): boolean {
    return this.recorder.state === 'recording'
  }

  get state(): RecordingState {
    return this.recorder.state
  }

  elapsedMs(): number {
    if (!this.startedAt) return 0
    const now = this.recorder.state === 'paused' ? this.pausedAt : performance.now()
    return Math.max(0, now - this.startedAt - this.pausedTotal)
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve) => {
      if (this.recorder.state === 'inactive') {
        resolve({ blob: new Blob(this.chunks, { type: this.mime }), ext: this.ext, mime: this.mime, durationMs: 0 })
        return
      }
      const durationMs = this.elapsedMs()
      this.recorder.onstop = () => {
        resolve({
          blob: new Blob(this.chunks, { type: this.mime }),
          ext: this.ext,
          mime: this.mime,
          durationMs,
        })
      }
      this.recorder.stop()
    })
  }
}
