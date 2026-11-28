// 측정 시계열 → 지표 계산 (순수 함수, 단위 테스트 대상)
import type { AudioSample, Baseline, FaceSample, Metrics } from './types'

/** 계산에 쓰는 상수 */
export const METRIC_PARAMS = {
  /** 배경 소음보다 이만큼 크면 말하는 중으로 판단(dB) */
  voiceAboveNoiseDb: 10,
  /** 말하는 구간 사이의 이 시간(ms) 미만 공백은 이어서 말한 것으로 봄 */
  voiceGapFillMs: 300,
  /** 이 시간(ms) 미만의 짧은 소리는 말로 보지 않음 */
  voiceMinMs: 100,
  /** 이 시간(초) 이상 말이 없으면 침묵 1회 */
  longSilenceSec: 3,
  /** 이 시간(초) 이하로 시선을 돌린 것은 정면으로 계산 */
  glanceForgiveSec: 1.5,
  /** 고개 움직임 1회로 볼 최소 각도(°). 말하면서 하는 끄덕임은 작아서 4°로 잡음 */
  headSwingDeg: 4,
  /** 고개를 내렸다 올리는(또는 돌렸다 돌아오는) 움직임의 길이 범위(초, 움직임 폭의 절반 높이에서 잰 시간) */
  headSwingMinSec: 0.1,
  headSwingMaxSec: 1.0,
  /** 얼굴 지표를 계산할 최소 측정 수 */
  minFaceSamples: 10,
  /** 음 높이 지표를 계산할 최소 측정 수 */
  minPitchSamples: 20,
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const median = (xs: number[]) => {
  const a = [...xs].sort((p, q) => p - q)
  return a[Math.floor(a.length / 2)]
}

/** 일정 간격 측정값의 대표 간격(ms) */
function stepOf(ts: number[], fallback: number) {
  if (ts.length < 2) return fallback
  const diffs = ts.slice(1).map((t, i) => t - ts[i])
  return median(diffs) || fallback
}

/** true/false 배열의 연속 구간 목록 */
export function runs(flags: boolean[]): { value: boolean; start: number; end: number }[] {
  const out: { value: boolean; start: number; end: number }[] = []
  flags.forEach((v, i) => {
    const last = out[out.length - 1]
    if (last && last.value === v) last.end = i
    else out.push({ value: v, start: i, end: i })
  })
  return out
}

/** 말하는 구간 판정: 짧은 공백은 메우고 아주 짧은 소리는 지움 */
export function voicedFlags(audio: AudioSample[], noiseDb: number, p = METRIC_PARAMS): boolean[] {
  const step = stepOf(
    audio.map((a) => a.t),
    50,
  )
  const flags = audio.map((a) => a.db > noiseDb + p.voiceAboveNoiseDb)
  const gapMax = Math.round(p.voiceGapFillMs / step)
  const minLen = Math.max(1, Math.round(p.voiceMinMs / step))
  // 말 사이의 짧은 공백 메우기 (앞뒤가 모두 말인 경우만)
  for (const r of runs(flags)) {
    if (!r.value && r.start > 0 && r.end < flags.length - 1 && r.end - r.start + 1 < gapMax) {
      for (let i = r.start; i <= r.end; i++) flags[i] = true
    }
  }
  for (const r of runs(flags)) {
    if (r.value && r.end - r.start + 1 < minLen) {
      for (let i = r.start; i <= r.end; i++) flags[i] = false
    }
  }
  return flags
}

/** 고개를 한 방향으로 움직였다 돌아온 횟수 */
export function countSwings(
  series: { t: number; v: number }[],
  thresholdDeg: number,
  minSec: number,
  maxSec: number,
): number {
  return findSwings(series, thresholdDeg, minSec, maxSec).length
}

/**
 * 고개를 한 방향으로 움직였다 돌아온 시점(ms) 목록.
 * 각도 변화의 꼭짓점을 찾아(zigzag) 갔다-오는 두 변이 모두 기준 각도 이상이고
 * 시간 범위 안이면 1회로 셈
 */
export function findSwings(
  series: { t: number; v: number }[],
  thresholdDeg: number,
  minSec: number,
  maxSec: number,
): number[] {
  if (series.length < 3) return []
  // 평활화는 하지 않음: 0.3초짜리 빠른 끄덕임은 측정값이 3~5개뿐이라 평활화하면 폭이 깎임.
  // 작은 떨림은 "기준 각도 이상 되돌아와야 꼭짓점으로 인정"하는 조건에서 걸러짐
  const smooth = series.map((s, i) => ({ t: s.t, v: s.v, i }))
  // 꼭짓점 찾기: 반대 방향으로 기준 각도 이상 움직이면 직전 극값을 확정
  const extrema: { t: number; v: number; i: number }[] = []
  let hi = smooth[0]
  let lo = smooth[0]
  let cand = smooth[0]
  let dir = 0 // 0: 아직 방향 없음, 1: 올라가는 중, -1: 내려가는 중
  for (const s of smooth.slice(1)) {
    if (dir === 0) {
      // 같은 값이 이어지면 마지막 시점을 꼭짓점으로 (움직이기 직전 시점)
      if (s.v >= hi.v) hi = s
      if (s.v <= lo.v) lo = s
      if (s.v - lo.v >= thresholdDeg) {
        extrema.push(lo)
        dir = 1
        cand = s
      } else if (hi.v - s.v >= thresholdDeg) {
        extrema.push(hi)
        dir = -1
        cand = s
      }
    } else if (dir === 1) {
      if (s.v >= cand.v) cand = s
      else if (cand.v - s.v >= thresholdDeg) {
        extrema.push(cand)
        dir = -1
        cand = s
      }
    } else {
      if (s.v <= cand.v) cand = s
      else if (s.v - cand.v >= thresholdDeg) {
        extrema.push(cand)
        dir = 1
        cand = s
      }
    }
  }
  if (dir !== 0) extrema.push(cand)

  const found: number[] = []
  for (let i = 1; i < extrema.length - 1; i++) {
    const a = extrema[i - 1]
    const b = extrema[i]
    const c = extrema[i + 1]
    const legs = Math.abs(b.v - a.v) >= thresholdDeg && Math.abs(c.v - b.v) >= thresholdDeg
    // 움직임 폭의 절반 높이를 지나는 두 시점 사이 시간 (앞뒤로 멈춰 있던 시간은 빠짐)
    const half1 = (a.v + b.v) / 2
    const half2 = (b.v + c.v) / 2
    const beyond = (v: number, half: number, toward: number) => (toward < half ? v <= half : v >= half)
    let i1 = a.i
    while (i1 < b.i && !beyond(smooth[i1].v, half1, b.v)) i1++
    let i2 = b.i
    while (i2 < c.i && beyond(smooth[i2].v, half2, b.v)) i2++
    const sec = (smooth[i2].t - smooth[i1].t) / 1000
    if (legs && sec >= minSec && sec <= maxSec) {
      found.push(b.t)
      i += 1 // 이어지는 끄덕임이 겹쳐 세어지지 않도록 건너뜀
    }
  }
  return found
}

/** 답변 중 3초 이상 말이 없던 구간 (타임라인 표시용) */
export function silenceSpans(audio: AudioSample[], noiseDb: number, p = METRIC_PARAMS) {
  const flags = voicedFlags(audio, noiseDb, p)
  const first = flags.indexOf(true)
  const last = flags.lastIndexOf(true)
  if (first < 0) return []
  return runs(flags)
    .filter((r) => !r.value && r.start > first && r.end < last)
    .map((r) => ({ start: audio[r.start].t, end: audio[r.end].t }))
    .filter((r) => (r.end - r.start) / 1000 >= p.longSilenceSec)
}

export function computeMetrics(
  audio: AudioSample[],
  face: FaceSample[],
  baseline: Baseline,
  durationMs: number,
  p = METRIC_PARAMS,
): Metrics {
  const durationSec = durationMs / 1000
  const perMin = (n: number) => (durationSec > 0 ? (n / durationSec) * 60 : 0)

  // ---------- 목소리 ----------
  const aStep = stepOf(
    audio.map((a) => a.t),
    50,
  )
  const flags = voicedFlags(audio, baseline.noiseDb, p)
  const voiced = audio.filter((_, i) => flags[i])
  const firstIdx = flags.indexOf(true)
  const lastIdx = flags.lastIndexOf(true)

  let meanDb: number | null = null
  let dbStd: number | null = null
  let tailDrop: number | null = null
  if (voiced.length >= 5) {
    const dbs = voiced.map((v) => v.db)
    meanDb = mean(dbs)
    dbStd = std(dbs)
    const span0 = audio[firstIdx].t
    const span1 = audio[lastIdx].t
    const tailStart = span1 - (span1 - span0) * 0.2
    const tail = voiced.filter((v) => v.t >= tailStart).map((v) => v.db)
    if (voiced.length >= 20 && tail.length >= 3) tailDrop = mean(tail) - meanDb
  }

  const f0s = voiced.map((v) => v.f0).filter((f): f is number => f !== null)
  let pitchStdSemitone: number | null = null
  let medianF0: number | null = null
  if (f0s.length >= p.minPitchSamples) {
    medianF0 = median(f0s)
    pitchStdSemitone = std(f0s.map((f) => 12 * Math.log2(f / medianF0!)))
  }

  // ---------- 말의 흐름 ----------
  let longSilences = 0
  if (firstIdx >= 0) {
    for (const r of runs(flags.slice(firstIdx, lastIdx + 1))) {
      if (!r.value && ((r.end - r.start + 1) * aStep) / 1000 >= p.longSilenceSec) longSilences++
    }
  }
  const speechRatio = durationMs > 0 ? Math.min(1, (voiced.length * aStep) / durationMs) : 0
  const startDelaySec = firstIdx >= 0 ? audio[firstIdx].t / 1000 : null

  // ---------- 시선 ----------
  const detected = face.filter((f) => f.detected)
  const faceDetectedRatio = face.length > 0 ? detected.length / face.length : 0
  const enoughFace = detected.length >= p.minFaceSamples
  const fStep = stepOf(
    detected.map((f) => f.t),
    80,
  )
  let frontalRatio: number | null = null
  let lookAways = 0
  if (enoughFace) {
    let frontalTime = 0
    for (const r of runs(detected.map((f) => f.frontal))) {
      const sec = (detected[r.end].t - detected[r.start].t + fStep) / 1000
      if (r.value || sec <= p.glanceForgiveSec) frontalTime += sec
      else lookAways++
    }
    const total = detected.length * (fStep / 1000)
    frontalRatio = total > 0 ? Math.min(1, frontalTime / total) : null
  }

  // ---------- 자세 ----------
  const nods = enoughFace
    ? countSwings(
        detected.map((f) => ({ t: f.t, v: f.pitch })),
        p.headSwingDeg,
        p.headSwingMinSec,
        p.headSwingMaxSec,
      )
    : 0
  const shakes = enoughFace
    ? countSwings(
        detected.map((f) => ({ t: f.t, v: f.yaw })),
        p.headSwingDeg,
        p.headSwingMinSec,
        p.headSwingMaxSec,
      )
    : 0
  const meanTilt = enoughFace ? mean(detected.map((f) => Math.abs(f.roll))) : null

  return {
    durationSec,
    meanDb,
    loudnessAboveNoise: meanDb === null ? null : meanDb - baseline.noiseDb,
    dbStd,
    tailDrop,
    pitchStdSemitone,
    medianF0,
    longSilences,
    longSilencesPerMin: perMin(longSilences),
    speechRatio,
    startDelaySec,
    faceDetectedRatio,
    frontalRatio,
    lookAways,
    lookAwaysPerMin: enoughFace ? perMin(lookAways) : null,
    nods,
    nodsPerMin: enoughFace ? perMin(nods) : null,
    shakes,
    shakesPerMin: enoughFace ? perMin(shakes) : null,
    meanTilt,
  }
}
