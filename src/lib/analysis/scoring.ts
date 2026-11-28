// 지표 → 점수·조언 (참고용, 기준값은 경험치)
import type {
  Advice,
  AnalysisRecord,
  AnalysisResult,
  AnalysisSummary,
  CategoryKey,
  CategoryScore,
  Metrics,
  SessionSummary,
} from './types'

/** 적정 범위. min 미만이나 max 초과면 감점 */
export interface Range {
  min?: number
  max?: number
}

/** 지표별 기준 (계획 문서 4장) */
export const CRITERIA = {
  pitchStdSemitone: { min: 2, max: 4 },
  loudnessAboveNoise: { min: 15 },
  dbStd: { max: 6 },
  tailDrop: { min: -4 },
  longSilencesPerMin: { max: 2 },
  speechRatio: { min: 0.7 },
  startDelaySec: { max: 5 },
  frontalRatio: { min: 0.65 },
  lookAwaysPerMin: { max: 3 },
  nodsPerMin: { max: 4 },
  shakesPerMin: { max: 3 },
  meanTilt: { max: 7 },
} satisfies Record<string, Range>

/** 항목별 가중치 (임의로 정한 값) */
export const WEIGHTS: Record<CategoryKey, number> = { voice: 0.3, flow: 0.2, gaze: 0.3, posture: 0.2 }

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  voice: '목소리',
  flow: '말의 흐름',
  gaze: '시선',
  posture: '자세',
}

/** 이보다 짧은 답변은 점수를 내지 않음 */
export const MIN_ANALYSIS_SEC = 10

/**
 * 범위 안이면 100점. 벗어나면 벗어난 만큼 직선으로 깎아
 * 기준값 크기만큼 벗어나면 0점 (예: 최대 4회 기준이면 8회에서 0점)
 */
export function rangeScore(value: number, range: Range): number {
  let dev = 0
  let span = 1
  if (range.min !== undefined && value < range.min) {
    dev = range.min - value
    span = Math.abs(range.min) || 1
  } else if (range.max !== undefined && value > range.max) {
    dev = value - range.max
    span = Math.abs(range.max) || 1
  }
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - dev / span))))
}

const fmt = (n: number, digits = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(digits))
const pct = (n: number) => `${Math.round(n * 100)}%`
const rangeText = (r: Range, unit = '', asPct = false) => {
  const v = (n: number) => (asPct ? pct(n) : `${fmt(n)}${unit}`)
  if (r.min !== undefined && r.max !== undefined) return `기준 ${v(r.min)}~${v(r.max)}`
  if (r.min !== undefined) return `기준 ${v(r.min)} 이상`
  return `기준 ${v(r.max!)} 이하`
}

interface Item {
  key: keyof typeof CRITERIA
  category: CategoryKey
  value: number | null
  label: string
  display: (v: number) => string
  range: Range
  rangeLabel: string
  advice: (v: number) => string
}

function items(m: Metrics): Item[] {
  const c = CRITERIA
  return [
    {
      key: 'pitchStdSemitone',
      category: 'voice',
      value: m.pitchStdSemitone,
      label: '음 높이 변화',
      display: (v) => `${fmt(v)}반음`,
      range: c.pitchStdSemitone,
      rangeLabel: rangeText(c.pitchStdSemitone, '반음'),
      advice: (v) =>
        v < c.pitchStdSemitone.min
          ? `목소리 높낮이 변화가 ${fmt(v)}반음으로 단조롭습니다. 핵심 단어에서 톤을 살짝 올려 보세요.`
          : `목소리 높낮이 변화가 ${fmt(v)}반음으로 큽니다. 조금 더 차분한 톤으로 말해 보세요.`,
    },
    {
      key: 'loudnessAboveNoise',
      category: 'voice',
      value: m.loudnessAboveNoise,
      label: '목소리 크기',
      display: (v) => `소음 대비 +${fmt(v, 0)}dB`,
      range: c.loudnessAboveNoise,
      rangeLabel: rangeText(c.loudnessAboveNoise, 'dB'),
      advice: () => '목소리가 작게 녹음되었습니다. 조금 더 크고 또렷하게 말하거나 마이크를 가까이 두세요.',
    },
    {
      key: 'dbStd',
      category: 'voice',
      value: m.dbStd,
      label: '음량 안정성',
      display: (v) => `변동 ${fmt(v)}dB`,
      range: c.dbStd,
      rangeLabel: rangeText(c.dbStd, 'dB'),
      advice: () => '목소리 크기가 들쭉날쭉합니다. 일정한 크기를 유지해 보세요.',
    },
    {
      key: 'tailDrop',
      category: 'voice',
      value: m.tailDrop,
      label: '끝 처짐',
      display: (v) => `${v > 0 ? '+' : ''}${fmt(v)}dB`,
      range: c.tailDrop,
      rangeLabel: rangeText(c.tailDrop, 'dB'),
      advice: (v) => `답변 끝부분 목소리가 ${fmt(Math.abs(v))}dB 작아졌습니다. 마지막 문장까지 힘 있게 마무리하세요.`,
    },
    {
      key: 'longSilencesPerMin',
      category: 'flow',
      value: m.longSilencesPerMin,
      label: '긴 침묵',
      display: (v) => `${m.longSilences}회 (${fmt(v)}회/분)`,
      range: c.longSilencesPerMin,
      rangeLabel: rangeText(c.longSilencesPerMin, '회/분'),
      advice: () =>
        `3초 이상 말이 끊긴 곳이 ${m.longSilences}번 있었습니다. 답변 흐름을 키워드로 미리 정리해 두세요.`,
    },
    {
      key: 'speechRatio',
      category: 'flow',
      value: m.speechRatio,
      label: '말한 시간 비율',
      display: (v) => pct(v),
      range: c.speechRatio,
      rangeLabel: rangeText(c.speechRatio, '', true),
      advice: (v) => `녹음 시간 중 말한 시간이 ${pct(v)}입니다. 쉬는 시간이 많으니 답변을 더 이어서 말해 보세요.`,
    },
    {
      key: 'startDelaySec',
      category: 'flow',
      value: m.startDelaySec,
      label: '답변 시작',
      display: (v) => `${fmt(v)}초`,
      range: c.startDelaySec,
      rangeLabel: rangeText(c.startDelaySec, '초'),
      advice: (v) => `답변을 시작하기까지 ${fmt(v)}초 걸렸습니다. 첫 문장을 미리 정해 두면 바로 시작할 수 있습니다.`,
    },
    {
      key: 'frontalRatio',
      category: 'gaze',
      value: m.frontalRatio,
      label: '정면 응시',
      display: (v) => pct(v),
      range: c.frontalRatio,
      rangeLabel: rangeText(c.frontalRatio, '', true),
      advice: (v) =>
        `답변의 ${pct(1 - v)}는 카메라가 아닌 곳을 봤습니다. 렌즈를 면접관의 눈이라고 생각해 보세요.`,
    },
    {
      key: 'lookAwaysPerMin',
      category: 'gaze',
      value: m.lookAwaysPerMin,
      label: '시선 이탈',
      display: (v) => `${m.lookAways}회 (${fmt(v)}회/분)`,
      range: c.lookAwaysPerMin,
      rangeLabel: rangeText(c.lookAwaysPerMin, '회/분'),
      advice: () => `1.5초 넘게 시선이 벗어난 적이 ${m.lookAways}번 있었습니다. 생각할 때도 시선을 오래 돌리지 마세요.`,
    },
    {
      key: 'nodsPerMin',
      category: 'posture',
      value: m.nodsPerMin,
      label: '끄덕임',
      display: (v) => `${m.nods}회 (${fmt(v)}회/분)`,
      range: c.nodsPerMin,
      rangeLabel: rangeText(c.nodsPerMin, '회/분'),
      advice: (v) => `1분에 ${fmt(v, 0)}번 고개를 끄덕였습니다. 강조할 때만 끄덕이면 더 차분해 보입니다.`,
    },
    {
      key: 'shakesPerMin',
      category: 'posture',
      value: m.shakesPerMin,
      label: '좌우 흔들림',
      display: (v) => `${m.shakes}회 (${fmt(v)}회/분)`,
      range: c.shakesPerMin,
      rangeLabel: rangeText(c.shakesPerMin, '회/분'),
      advice: (v) => `1분에 ${fmt(v, 0)}번 고개를 좌우로 움직였습니다. 머리를 고정하고 말해 보세요.`,
    },
    {
      key: 'meanTilt',
      category: 'posture',
      value: m.meanTilt,
      label: '고개 기울기',
      display: (v) => `${fmt(v)}°`,
      range: c.meanTilt,
      rangeLabel: rangeText(c.meanTilt, '°'),
      advice: (v) => `고개가 평균 ${fmt(v)}° 기울어져 있습니다. 고개를 똑바로 세워 보세요.`,
    },
  ]
}

export function scoreMetrics(m: Metrics): AnalysisResult {
  const all = items(m)
  const tooShort = m.durationSec < MIN_ANALYSIS_SEC
  // 얼굴을 절반 이상 못 찾았으면 시선·자세는 측정 불가
  const faceOk = m.faceDetectedRatio >= 0.5

  const scored = all.map((it) => {
    const usable =
      !tooShort && it.value !== null && (faceOk || (it.category !== 'gaze' && it.category !== 'posture'))
    return { ...it, score: usable ? rangeScore(it.value!, it.range) : null }
  })

  const categories: CategoryScore[] = (Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => {
    const list = scored.filter((s) => s.category === key)
    const scores = list.map((s) => s.score).filter((s): s is number => s !== null)
    return {
      key,
      label: CATEGORY_LABELS[key],
      score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      details: list
        .filter((s) => s.score !== null)
        .map((s) => `${s.label} ${s.display(s.value!)} (${s.rangeLabel})`),
    }
  })

  const usable = categories.filter((c) => c.score !== null)
  const wsum = usable.reduce((a, c) => a + WEIGHTS[c.key], 0)
  const overall = wsum > 0 ? Math.round(usable.reduce((a, c) => a + c.score! * WEIGHTS[c.key], 0) / wsum) : null

  // 점수가 낮은 지표 순으로 조언 최대 3개 (80점 이상은 생략)
  const advice: Advice[] = scored
    .filter((s) => s.score !== null && s.score < 80)
    .sort((a, b) => a.score! - b.score!)
    .slice(0, 3)
    .map((s) => ({ key: s.key, text: s.advice(s.value!) }))

  if (tooShort) advice.unshift({ key: 'short', text: `${MIN_ANALYSIS_SEC}초 이상 답변하면 점수를 계산합니다.` })
  else if (!faceOk)
    advice.unshift({
      key: 'face',
      text: '얼굴이 잘 잡히지 않아 시선·자세는 측정하지 못했습니다. 카메라 위치와 조명을 확인하세요.',
    })

  return { metrics: m, categories, overall, advice }
}

export function toSummary(r: AnalysisResult, id: string): AnalysisSummary {
  const scores = Object.fromEntries(r.categories.map((c) => [c.key, c.score])) as Record<CategoryKey, number | null>
  return {
    id,
    at: Date.now(),
    durationSec: Math.round(r.metrics.durationSec),
    overall: r.overall,
    scores,
    nodsPerMin: r.metrics.nodsPerMin,
    frontalRatio: r.metrics.frontalRatio,
    pitchStdSemitone: r.metrics.pitchStdSemitone,
  }
}

/** 세션 종합 기록: 점수가 나온 답변들의 평균과 반복된 습관 */
export function summarizeSession(
  results: AnalysisResult[],
  meta: Pick<SessionSummary, 'id' | 'startedAt' | 'completed' | 'total' | 'order'>,
): SessionSummary {
  const scored = results.filter((r) => r.overall !== null)
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const keys = Object.keys(CATEGORY_LABELS) as CategoryKey[]
  const scores = Object.fromEntries(
    keys.map((k) => [k, avg(scored.map((r) => r.categories.find((c) => c.key === k)?.score ?? null))]),
  ) as Record<CategoryKey, number | null>
  // 같은 지표의 조언이 여러 답변에서 나오면 반복된 습관으로 봄
  const counts = new Map<string, { text: string; count: number }>()
  for (const r of scored)
    for (const a of r.advice) {
      if (a.key === 'short' || a.key === 'face') continue
      const c = counts.get(a.key)
      counts.set(a.key, { text: a.text, count: (c?.count ?? 0) + 1 })
    }
  return {
    ...meta,
    endedAt: Date.now(),
    answered: scored.length,
    overall: avg(scored.map((r) => r.overall)),
    scores,
    habits: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3),
  }
}

/** 상세 데이터 저장 전 숫자를 줄여 파일 크기를 줄임 */
export function compactRecord(r: AnalysisRecord): AnalysisRecord {
  const n = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d
  const p = (pt: { x: number; y: number } | null) => (pt ? { x: n(pt.x), y: n(pt.y) } : null)
  return {
    ...r,
    audio: r.audio.map((a) => ({ t: Math.round(a.t), db: n(a.db, 1), f0: a.f0 === null ? null : n(a.f0, 1) })),
    face: r.face.map((f) => ({
      ...f,
      t: Math.round(f.t),
      yaw: n(f.yaw, 2),
      pitch: n(f.pitch, 2),
      roll: n(f.roll, 2),
      headX: n(f.headX),
      headY: n(f.headY),
      eyeX: n(f.eyeX),
      eyeY: n(f.eyeY),
      irisL: p(f.irisL),
      irisR: p(f.irisR),
      gaze: p(f.gaze),
    })),
  }
}

/** 지표 한 줄: 측정값·기준·점수 (세션 종합 표에 씀) */
export interface MetricRow {
  key: keyof typeof CRITERIA
  category: CategoryKey
  label: string
  value: string
  rangeLabel: string
  score: number
}

export function metricRows(m: Metrics): MetricRow[] {
  return items(m)
    .filter((it) => it.value !== null)
    .map((it) => ({
      key: it.key,
      category: it.category,
      label: it.label,
      value: it.display(it.value!),
      rangeLabel: it.rangeLabel,
      score: rangeScore(it.value!, it.range),
    }))
}

/**
 * 여러 답변의 지표를 하나로 합침 (세션 종합용).
 * 횟수는 더한 뒤 분당 횟수를 다시 계산하고, 나머지는 답변 길이로 가중 평균
 */
export function combineMetrics(list: Metrics[]): Metrics | null {
  const ms = list.filter((m) => m.durationSec >= MIN_ANALYSIS_SEC)
  if (ms.length === 0) return null
  const dur = ms.reduce((a, m) => a + m.durationSec, 0)
  const wavg = (pick: (m: Metrics) => number | null) => {
    let s = 0
    let w = 0
    for (const m of ms) {
      const v = pick(m)
      if (v === null) continue
      s += v * m.durationSec
      w += m.durationSec
    }
    return w > 0 ? s / w : null
  }
  // 분당 횟수가 있는 답변만 모아 횟수 합 / 시간 합
  const rate = (count: (m: Metrics) => number, perMin: (m: Metrics) => number | null) => {
    const ok = ms.filter((m) => perMin(m) !== null)
    const sec = ok.reduce((a, m) => a + m.durationSec, 0)
    const n = ok.reduce((a, m) => a + count(m), 0)
    return { n, perMin: sec > 0 ? n / (sec / 60) : null }
  }
  const sil = rate((m) => m.longSilences, (m) => m.longSilencesPerMin)
  const look = rate((m) => m.lookAways, (m) => m.lookAwaysPerMin)
  const nod = rate((m) => m.nods, (m) => m.nodsPerMin)
  const shake = rate((m) => m.shakes, (m) => m.shakesPerMin)
  return {
    durationSec: dur,
    meanDb: wavg((m) => m.meanDb),
    loudnessAboveNoise: wavg((m) => m.loudnessAboveNoise),
    dbStd: wavg((m) => m.dbStd),
    tailDrop: wavg((m) => m.tailDrop),
    pitchStdSemitone: wavg((m) => m.pitchStdSemitone),
    medianF0: wavg((m) => m.medianF0),
    longSilences: sil.n,
    longSilencesPerMin: sil.perMin ?? 0,
    speechRatio: wavg((m) => m.speechRatio) ?? 0,
    startDelaySec: wavg((m) => m.startDelaySec),
    faceDetectedRatio: wavg((m) => m.faceDetectedRatio) ?? 0,
    frontalRatio: wavg((m) => m.frontalRatio),
    lookAways: look.n,
    lookAwaysPerMin: look.perMin,
    nods: nod.n,
    nodsPerMin: nod.perMin,
    shakes: shake.n,
    shakesPerMin: shake.perMin,
    meanTilt: wavg((m) => m.meanTilt),
  }
}
