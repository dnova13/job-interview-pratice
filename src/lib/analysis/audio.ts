// 마이크 스트림에서 음량·음 높이 측정 (Web Audio + pitchy)
import { PitchDetector } from 'pitchy'
import type { AudioSample } from './types'

const FRAME = 2048
const INTERVAL_MS = 50
/** 사람 목소리로 볼 음 높이 범위(Hz)와 최소 신뢰도 */
const F0_MIN = 75
const F0_MAX = 400
const MIN_CLARITY = 0.9

export class AudioAnalyzer {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private source: MediaStreamAudioSourceNode
  private buf = new Float32Array(FRAME)
  private detector = PitchDetector.forFloat32Array(FRAME)
  private timer = 0
  private calibration: number[] | null = null
  /** 녹음 중일 때만 기록 (null이면 기록하지 않음) */
  clock: (() => number | null) | null = null
  samples: AudioSample[] = []
  /** 가장 최근 음량(dB) */
  latestDb = -100

  constructor(stream: MediaStream) {
    this.ctx = new AudioContext()
    this.source = this.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FRAME
    this.source.connect(this.analyser)
    // 출력 장치로는 연결하지 않음 (내 목소리가 스피커로 나오지 않도록)
  }

  start() {
    void this.ctx.resume()
    this.timer = window.setInterval(() => this.tick(), INTERVAL_MS)
  }

  private tick() {
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
    const rms = Math.sqrt(sum / this.buf.length)
    const db = rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
    this.latestDb = db
    if (this.calibration) this.calibration.push(db)

    const t = this.clock?.() ?? null
    if (t === null) return
    let f0: number | null = null
    // 너무 작은 소리에서는 음 높이를 재지 않음
    if (db > -55) {
      const [pitch, clarity] = this.detector.findPitch(this.buf, this.ctx.sampleRate)
      if (clarity >= MIN_CLARITY && pitch >= F0_MIN && pitch <= F0_MAX) f0 = pitch
    }
    this.samples.push({ t, db, f0 })
  }

  /** 배경 소음 측정 시작 (카운트다운 동안) */
  startCalibration() {
    this.calibration = []
  }

  /** 배경 소음(dB): 측정값의 하위 30% 지점. 측정값이 적으면 null */
  finishCalibration(): number | null {
    const list = this.calibration ?? []
    this.calibration = null
    if (list.length < 5) return null
    const sorted = [...list].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.3)]
  }

  reset() {
    this.samples = []
  }

  stop() {
    window.clearInterval(this.timer)
    this.source.disconnect()
    void this.ctx.close()
  }
}
