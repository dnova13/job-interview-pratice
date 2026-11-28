// MediaPipe Face Landmarker로 얼굴 방향·시선 측정
import { FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Baseline, FaceSample, Point } from './types'

/** 시선을 정면으로 보는 범위 (영상 기준 시선 값의 기준 대비 차이) */
export const GAZE_FRONTAL_X = 0.14
export const GAZE_FRONTAL_Y = 0.12
/** 시선 값 = 머리 방향 + 눈 방향 × 이 비율 */
const EYE_WEIGHT = 0.8

// 얼굴 점 번호 (MediaPipe Face Mesh 기준)
const LM = {
  noseTip: 1,
  cheekA: 234,
  cheekB: 454,
  forehead: 10,
  chin: 152,
  // 눈 A (영상 왼쪽에 보이는 눈)
  eyeAOuter: 33,
  eyeAInner: 133,
  eyeATop: 159,
  eyeABottom: 145,
  irisA: 468,
  // 눈 B
  eyeBInner: 362,
  eyeBOuter: 263,
  eyeBTop: 386,
  eyeBBottom: 374,
  irisB: 473,
}

export type Delegate = 'GPU' | 'CPU'

let loading: Promise<{ landmarker: FaceLandmarker; delegate: Delegate }> | null = null

/** 앱에 포함된 파일 경로 (개발 서버·패키지 앱 모두 index.html 기준 상대 경로) */
const asset = (p: string) => new URL(p, document.baseURI).href

async function create(delegate: Delegate, model: Uint8Array) {
  const landmarker = await FaceLandmarker.createFromOptions(
    {
      wasmLoaderPath: asset('mediapipe/wasm/vision_wasm_internal.js'),
      wasmBinaryPath: asset('mediapipe/wasm/vision_wasm_internal.wasm'),
    },
    {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    },
  )
  return { landmarker, delegate }
}

async function loadModel(): Promise<Uint8Array> {
  const res = await fetch(asset('mediapipe/face_landmarker.task'))
  if (!res.ok) throw new Error(`얼굴 모델을 읽을 수 없습니다 (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

/** 얼굴 분석기를 한 번만 만들어 재사용. GPU가 안 되면 CPU로 전환 */
export function getFaceLandmarker() {
  if (!loading) {
    loading = (async () => {
      // MediaPipe는 CPU 모드에서도 영상을 WebGL로 읽으므로 WebGL2가 없으면 쓸 수 없음
      if (!document.createElement('canvas').getContext('webgl2')) {
        throw new Error('이 컴퓨터에서는 얼굴 분석에 필요한 그래픽 기능(WebGL2)을 쓸 수 없습니다.')
      }
      const model = await loadModel()
      // 확인용: localStorage에 faceDelegate=CPU를 넣으면 CPU 모드로만 실행
      if (localStorage.getItem('faceDelegate') === 'CPU') return await create('CPU', model)
      try {
        return await create('GPU', model)
      } catch (err) {
        console.warn('GPU 얼굴 분석을 쓸 수 없어 CPU로 전환합니다.', err)
        return await create('CPU', model)
      }
    })()
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}

/** 4x4 변환 행렬(열 우선)에서 머리 각도(°) 추출 */
export function matrixToEuler(m: ArrayLike<number>) {
  const r = (row: number, col: number) => m[col * 4 + row]
  const deg = 180 / Math.PI
  return {
    pitch: Math.atan2(r(2, 1), r(2, 2)) * deg,
    yaw: Math.atan2(-r(2, 0), Math.hypot(r(0, 0), r(1, 0))) * deg,
    roll: Math.atan2(r(1, 0), r(0, 0)) * deg,
  }
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** 한 눈의 눈동자 위치를 눈 폭 대비 비율로 (가운데 0) */
function eyeOffset(pts: Point[], a: number, b: number, top: number, bottom: number, iris: number) {
  const corner = mid(pts[a], pts[b])
  const width = dist(pts[a], pts[b]) || 1e-6
  const lid = mid(pts[top], pts[bottom])
  return {
    x: (pts[iris].x - corner.x) / width,
    y: (pts[iris].y - lid.y) / width,
  }
}

/** 시선 값 (머리 방향 + 눈 방향) */
export const gazeOf = (s: Pick<FaceSample, 'headX' | 'headY' | 'eyeX' | 'eyeY'>) => ({
  x: s.headX + s.eyeX * EYE_WEIGHT,
  y: s.headY + s.eyeY * EYE_WEIGHT,
})

export const isFrontal = (gx: number, gy: number, base: Baseline) =>
  Math.abs(gx - base.gazeX) <= GAZE_FRONTAL_X && Math.abs(gy - base.gazeY) <= GAZE_FRONTAL_Y

const EMPTY: Omit<FaceSample, 't'> = {
  detected: false,
  yaw: 0,
  pitch: 0,
  roll: 0,
  headX: 0,
  headY: 0,
  eyeX: 0,
  eyeY: 0,
  frontal: false,
  irisL: null,
  irisR: null,
  gaze: null,
}

/** MediaPipe 결과 → 측정값 한 개 */
export function toFaceSample(result: FaceLandmarkerResult, t: number, base: Baseline): FaceSample {
  const pts = result.faceLandmarks[0]
  if (!pts || pts.length < 478) return { t, ...EMPTY }

  const matrix = result.facialTransformationMatrixes?.[0]?.data
  const { yaw, pitch, roll } = matrix ? matrixToEuler(matrix) : { yaw: 0, pitch: 0, roll: 0 }

  // 머리 방향: 양 볼 가운데 대비 코끝 위치 (얼굴 폭·높이로 나눔)
  const faceWidth = dist(pts[LM.cheekA], pts[LM.cheekB]) || 1e-6
  const faceHeight = dist(pts[LM.forehead], pts[LM.chin]) || 1e-6
  const center = mid(pts[LM.cheekA], pts[LM.cheekB])
  const headX = (pts[LM.noseTip].x - center.x) / faceWidth
  const headY = (pts[LM.noseTip].y - mid(pts[LM.forehead], pts[LM.chin]).y) / faceHeight

  const a = eyeOffset(pts, LM.eyeAOuter, LM.eyeAInner, LM.eyeATop, LM.eyeABottom, LM.irisA)
  const b = eyeOffset(pts, LM.eyeBInner, LM.eyeBOuter, LM.eyeBTop, LM.eyeBBottom, LM.irisB)
  const eyeX = (a.x + b.x) / 2
  const eyeY = (a.y + b.y) / 2

  const g = gazeOf({ headX, headY, eyeX, eyeY })
  const irisL = { x: pts[LM.irisA].x, y: pts[LM.irisA].y }
  const irisR = { x: pts[LM.irisB].x, y: pts[LM.irisB].y }
  const between = mid(irisL, irisR)
  // 시선 점: 두 눈 사이에서 기준 대비 시선 차이만큼 이동 (정면이면 두 눈 사이)
  const gaze = {
    x: between.x + (g.x - base.gazeX) * faceWidth * 2.5,
    y: between.y + (g.y - base.gazeY) * faceWidth * 2.5,
  }

  return {
    t,
    detected: true,
    yaw,
    pitch,
    roll,
    headX,
    headY,
    eyeX,
    eyeY,
    frontal: isFrontal(g.x, g.y, base),
    irisL,
    irisR,
    gaze,
  }
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number
  cancelVideoFrameCallback?: (id: number) => void
}

/**
 * 카메라 영상을 계속 분석. 초당 maxFps회까지만 처리하고,
 * 처리가 느리면 자동으로 간격을 늘림
 */
export class FaceTracker {
  private running = false
  private frameId = 0
  private lastRun = 0
  private interval: number
  private costAvg = 0
  baseline: Baseline
  /** 녹음 중일 때만 기록 (null이면 기록하지 않음) */
  clock: (() => number | null) | null = null
  samples: FaceSample[] = []
  latest: FaceSample | null = null
  onSample: ((s: FaceSample) => void) | null = null
  delegate: Delegate | null = null
  /** 실제 초당 측정 횟수 */
  fps = 0
  private lastSampleAt = 0
  /** 분석이 계속 실패해 멈췄을 때 */
  onFail: (() => void) | null = null
  private failures = 0

  constructor(
    private video: HTMLVideoElement,
    baseline: Baseline,
    maxFps = 15,
  ) {
    this.baseline = baseline
    this.interval = 1000 / maxFps
  }

  async start() {
    const { landmarker, delegate } = await getFaceLandmarker()
    this.delegate = delegate
    this.running = true
    const v = this.video as VideoWithRvfc
    const loop = () => {
      if (!this.running) return
      const now = performance.now()
      if (now - this.lastRun >= this.interval && v.readyState >= 2 && v.videoWidth > 0) {
        this.lastRun = now
        try {
          const result = landmarker.detectForVideo(v, now)
          this.failures = 0
          const cost = performance.now() - now
          this.costAvg = this.costAvg ? this.costAvg * 0.9 + cost * 0.1 : cost
          // 한 프레임 처리에 간격의 절반 이상 걸리면 간격을 늘림 (최대 초당 4회까지 낮춤)
          if (this.costAvg > this.interval / 2) this.interval = Math.min(250, this.interval * 1.25)
          this.handle(result)
        } catch (err) {
          // 계속 실패하면 분석을 멈춤 (녹음은 영향 없음)
          if (++this.failures >= 10) {
            console.warn('얼굴 분석을 계속 실패해 멈춥니다.', err)
            this.running = false
            this.onFail?.()
            return
          }
        }
      }
      this.schedule(loop)
    }
    this.schedule(loop)
  }

  private schedule(fn: () => void) {
    const v = this.video as VideoWithRvfc
    if (v.requestVideoFrameCallback) this.frameId = v.requestVideoFrameCallback(fn)
    else this.frameId = requestAnimationFrame(fn)
  }

  private handle(result: FaceLandmarkerResult) {
    const now = performance.now()
    if (this.lastSampleAt) {
      const inst = 1000 / Math.max(1, now - this.lastSampleAt)
      this.fps = this.fps ? this.fps * 0.8 + inst * 0.2 : inst
    }
    this.lastSampleAt = now
    const t = this.clock?.() ?? null
    const sample = toFaceSample(result, t ?? -1, this.baseline)
    this.latest = sample
    if (t !== null) this.samples.push(sample)
    if (this.calibration && sample.detected) this.calibration.push(sample)
    this.onSample?.(sample)
  }

  private calibration: FaceSample[] | null = null

  /** 기준 자세 측정 시작 (카운트다운 동안 렌즈를 보는 자세) */
  startCalibration() {
    this.calibration = []
  }

  /** 측정한 시선의 중앙값. 측정값이 적으면 null */
  finishCalibration(): { gazeX: number; gazeY: number } | null {
    const list = this.calibration ?? []
    this.calibration = null
    // 앞쪽 0.5초는 자세를 잡는 시간이라 제외
    const usable = list.slice(Math.min(6, Math.floor(list.length / 3)))
    if (usable.length < 5) return null
    const med = (xs: number[]) => {
      const a = [...xs].sort((p, q) => p - q)
      return a[Math.floor(a.length / 2)]
    }
    const gs = usable.map(gazeOf)
    return { gazeX: med(gs.map((g) => g.x)), gazeY: med(gs.map((g) => g.y)) }
  }

  /** 녹음 기록 비우기 */
  reset() {
    this.samples = []
  }

  stop() {
    this.running = false
    const v = this.video as VideoWithRvfc
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.frameId)
    else cancelAnimationFrame(this.frameId)
  }
}
