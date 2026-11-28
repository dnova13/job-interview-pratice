import { describe, expect, it } from 'vitest'
import { computeMetrics, countSwings, METRIC_PARAMS, voicedFlags } from './metrics'

const P = METRIC_PARAMS
const swings = (series: { t: number; v: number }[]) =>
  countSwings(series, P.headSwingDeg, P.headSwingMinSec, P.headSwingMaxSec)

/** 초당 15회 측정, period(ms)마다 dur(ms) 동안 amp° 끄덕임 */
function nodSeries(totalMs: number, period: number, dur: number, amp: number, jitter = 0) {
  const out = []
  let seed = 1
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2
  for (let t = 0; t < totalMs; t += 67) {
    const ph = t % period
    const v = ph < dur ? -amp * Math.sin((Math.PI * ph) / dur) : 0
    out.push({ t, v: v + rand() * jitter })
  }
  return out
}
import { rangeScore, scoreMetrics } from './scoring'
import type { AudioSample, Baseline, FaceSample } from './types'

const BASE: Baseline = { noiseDb: -60, gazeX: 0, gazeY: 0, measured: true }

/** 50ms 간격 오디오: 구간별로 말함/침묵 지정 */
function audioOf(segments: { sec: number; voiced: boolean; f0?: (t: number) => number }[]): AudioSample[] {
  const out: AudioSample[] = []
  let t = 0
  for (const seg of segments) {
    const end = t + seg.sec * 1000
    for (; t < end; t += 50) {
      out.push({ t, db: seg.voiced ? -25 : -65, f0: seg.voiced ? (seg.f0?.(t) ?? 150) : null })
    }
  }
  return out
}

/** 80ms 간격 얼굴: 각도 함수와 정면 여부 함수 */
function faceOf(sec: number, pitch: (t: number) => number, frontal: (t: number) => boolean = () => true): FaceSample[] {
  const out: FaceSample[] = []
  for (let t = 0; t < sec * 1000; t += 80) {
    out.push({
      t,
      detected: true,
      yaw: 0,
      pitch: pitch(t),
      roll: 0,
      headX: 0,
      headY: 0,
      eyeX: 0,
      eyeY: 0,
      frontal: frontal(t),
      irisL: null,
      irisR: null,
      gaze: null,
    })
  }
  return out
}

describe('rangeScore', () => {
  it('범위 안은 100점, 기준만큼 벗어나면 0점', () => {
    expect(rangeScore(3, { min: 2, max: 4 })).toBe(100)
    expect(rangeScore(6, { max: 4 })).toBe(50)
    expect(rangeScore(8, { max: 4 })).toBe(0)
    expect(rangeScore(1, { min: 2 })).toBe(50)
    expect(rangeScore(-6, { min: -4 })).toBe(50)
  })
})

describe('countSwings', () => {
  it('1초에 한 번씩 10° 끄덕이면 횟수만큼 셈', () => {
    expect(swings(nodSeries(5000, 1000, 600, 10))).toBe(5)
  })

  it('빠른(0.3~0.4초) 작은 끄덕임도 5°~12° 모두 셈', () => {
    for (const dur of [300, 400])
      for (const amp of [5, 6, 8, 10, 12]) expect(swings(nodSeries(6000, 2000, dur, amp)), `${amp}°/${dur}ms`).toBe(3)
  })

  it('3° 이하의 아주 작은 움직임은 세지 않음', () => {
    expect(swings(nodSeries(6000, 2000, 400, 3))).toBe(0)
  })

  it('측정 떨림(±1°)이 섞여도 끄덕임 횟수는 그대로', () => {
    expect(swings(nodSeries(10000, 2000, 500, 6, 1))).toBe(5)
  })

  it('끄덕이지 않을 때 떨림(±1.5°)은 세지 않음', () => {
    expect(swings(nodSeries(10000, 2000, 500, 0, 1.5))).toBe(0)
  })

  it('천천히 고개를 숙이고 그대로 있으면 끄덕임이 아님', () => {
    const series = []
    for (let t = 0; t < 5000; t += 80) series.push({ t, v: t < 2000 ? -(t / 2000) * 15 : -15 })
    expect(swings(series)).toBe(0)
  })

  it('3초에 걸쳐 천천히 고개를 숙였다 드는 것은 끄덕임이 아님', () => {
    expect(swings(nodSeries(9000, 4500, 3000, 10))).toBe(0)
  })
})

describe('voicedFlags', () => {
  it('말 사이 짧은 공백(200ms)은 이어서 말한 것으로 봄', () => {
    const audio = audioOf([
      { sec: 1, voiced: true },
      { sec: 0.2, voiced: false },
      { sec: 1, voiced: true },
    ])
    expect(voicedFlags(audio, -60).every(Boolean)).toBe(true)
  })
})

describe('computeMetrics', () => {
  it('침묵·답변 시작·말한 비율', () => {
    const audio = audioOf([
      { sec: 2, voiced: false }, // 답변 시작 전 2초
      { sec: 10, voiced: true },
      { sec: 4, voiced: false }, // 긴 침묵 1회
      { sec: 10, voiced: true },
      { sec: 1, voiced: false }, // 짧은 쉼은 침묵이 아님
      { sec: 3, voiced: true },
    ])
    const m = computeMetrics(audio, [], BASE, 30000)
    expect(m.startDelaySec).toBeCloseTo(2, 1)
    expect(m.longSilences).toBe(1)
    expect(m.speechRatio).toBeCloseTo(23 / 30, 1)
    expect(m.loudnessAboveNoise).toBeCloseTo(35, 0)
  })

  it('음 높이 변화: 일정한 음은 0반음, 한 옥타브 오가면 약 6반음', () => {
    const flat = computeMetrics(audioOf([{ sec: 15, voiced: true }]), [], BASE, 15000)
    expect(flat.pitchStdSemitone).toBeCloseTo(0, 3)
    // 절반은 100Hz, 절반은 200Hz → 중앙값 기준 0/±12반음 → 표준편차 6
    const jumpy = computeMetrics(
      audioOf([
        { sec: 5, voiced: true, f0: () => 100 },
        { sec: 5, voiced: true, f0: () => 200 },
      ]),
      [],
      BASE,
      10000,
    )
    expect(jumpy.pitchStdSemitone).toBeCloseTo(6, 0)
  })

  it('짧게 시선을 돌린 것은 정면으로, 오래 돌린 것은 이탈로 셈', () => {
    // 20초 중 3~4초(1초), 10~14초(4초) 시선 돌림
    const face = faceOf(
      20,
      () => 0,
      (t) => !((t >= 3000 && t < 4000) || (t >= 10000 && t < 14000)),
    )
    const m = computeMetrics([], face, BASE, 20000)
    expect(m.lookAways).toBe(1)
    expect(m.frontalRatio).toBeCloseTo(16 / 20, 1)
  })

  it('끄덕임 분당 횟수', () => {
    const face = faceOf(30, (t) => {
      const ph = t % 3000 // 3초마다 한 번 끄덕임
      return ph < 600 ? -12 * Math.sin((Math.PI * ph) / 600) : 0
    })
    const m = computeMetrics([], face, BASE, 30000)
    expect(m.nods).toBe(10)
    expect(m.nodsPerMin).toBeCloseTo(20, 0)
  })
})

describe('scoreMetrics', () => {
  it('10초보다 짧으면 점수를 내지 않음', () => {
    const m = computeMetrics(audioOf([{ sec: 5, voiced: true }]), [], BASE, 5000)
    const r = scoreMetrics(m)
    expect(r.overall).toBeNull()
    expect(r.advice[0].key).toBe('short')
  })

  it('얼굴이 없으면 시선·자세는 측정 불가, 목소리 점수만으로 종합', () => {
    const m = computeMetrics(audioOf([{ sec: 20, voiced: true }]), [], BASE, 20000)
    const r = scoreMetrics(m)
    expect(r.categories.find((c) => c.key === 'gaze')!.score).toBeNull()
    expect(r.categories.find((c) => c.key === 'voice')!.score).not.toBeNull()
    expect(r.overall).not.toBeNull()
    expect(r.advice.some((a) => a.key === 'face')).toBe(true)
  })

  it('끄덕임이 많으면 자세 점수가 낮고 조언에 나옴', () => {
    const face = faceOf(30, (t) => {
      const ph = t % 3000
      return ph < 600 ? -12 * Math.sin((Math.PI * ph) / 600) : 0
    })
    const audio = audioOf([{ sec: 30, voiced: true, f0: (t) => 150 + 40 * Math.sin(t / 700) }])
    const r = scoreMetrics(computeMetrics(audio, face, BASE, 30000))
    const posture = r.categories.find((c) => c.key === 'posture')!
    expect(posture.score!).toBeLessThan(80)
    expect(r.advice.some((a) => a.key === 'nodsPerMin')).toBe(true)
  })
})
