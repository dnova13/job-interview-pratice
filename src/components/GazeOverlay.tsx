import { useEffect, useRef } from 'react'
import type { FaceSample, Point } from '../lib/analysis/types'

const GREEN = '#3ecf8e'
const ORANGE = '#f5b041'

interface Props {
  /** 겹쳐 그릴 영상 */
  video: HTMLVideoElement | null
  /** 'cover'(실시간 카메라) / 'contain'(녹화본 재생) — 영상의 object-fit과 같아야 함 */
  fit: 'cover' | 'contain'
  /** 좌우 반전 (실시간 카메라는 거울처럼 보여 줌) */
  mirrored: boolean
  /** 실시간: 새 측정값이 오면 그림 */
  subscribe?: (draw: (s: FaceSample | null) => void) => () => void
  /** 재생: 재생 위치에 맞는 측정값을 찾아 그림 */
  samples?: FaceSample[]
}

/** 영상 원본 기준 0~1 좌표 → 캔버스 좌표 */
function mapper(canvas: HTMLCanvasElement, video: HTMLVideoElement, fit: 'cover' | 'contain') {
  const w = canvas.width
  const h = canvas.height
  const vw = video.videoWidth || 16
  const vh = video.videoHeight || 9
  const scale = fit === 'cover' ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh)
  const dw = vw * scale
  const dh = vh * scale
  const ox = (w - dw) / 2
  const oy = (h - dh) / 2
  return (p: Point) => ({ x: ox + p.x * dw, y: oy + p.y * dh })
}

function draw(canvas: HTMLCanvasElement, video: HTMLVideoElement, fit: 'cover' | 'contain', s: FaceSample | null) {
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(canvas.clientWidth * dpr)
  const h = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  if (!s?.detected || !s.irisL || !s.irisR || !s.gaze) return
  const map = mapper(canvas, video, fit)
  const color = s.frontal ? GREEN : ORANGE
  const a = map(s.irisL)
  const b = map(s.irisR)
  const g = map(s.gaze)
  const between = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }

  ctx.fillStyle = color
  for (const p of [a, b]) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.5 * dpr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2 * dpr
  ctx.beginPath()
  ctx.moveTo(between.x, between.y)
  ctx.lineTo(g.x, g.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(g.x, g.y, 8 * dpr, 0, Math.PI * 2)
  ctx.stroke()
}

/** 재생 위치(ms)에 가장 가까운 앞쪽 측정값 */
export function sampleAt(samples: FaceSample[], tMs: number): FaceSample | null {
  let lo = 0
  let hi = samples.length - 1
  if (hi < 0 || tMs < samples[0].t) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (samples[mid].t <= tMs) lo = mid
    else hi = mid - 1
  }
  // 측정 간격보다 많이 떨어져 있으면 표시하지 않음
  return tMs - samples[lo].t < 500 ? samples[lo] : null
}

/** 카메라·재생 영상 위에 눈동자 점과 시선 점 표시 */
export function GazeOverlay({ video, fit, mirrored, subscribe, samples }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !video) return
    if (subscribe) return subscribe((s) => draw(canvas, video, fit, s))
    if (samples) {
      let id = 0
      const loop = () => {
        draw(canvas, video, fit, sampleAt(samples, video.currentTime * 1000))
        id = requestAnimationFrame(loop)
      }
      id = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(id)
    }
  }, [fit, samples, subscribe, video])

  return <canvas ref={canvasRef} className={`gaze-overlay ${mirrored ? 'mirrored' : ''}`} />
}
