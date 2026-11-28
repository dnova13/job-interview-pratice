import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisRecord, FaceSample } from '../lib/analysis/types'
import { findSwings, METRIC_PARAMS, silenceSpans } from '../lib/analysis/metrics'
import { GazeFigure, PostureFigure } from './AnalysisFigures'

interface Props {
  record: AnalysisRecord
  /** 같은 질의의 지난번 종합 점수 */
  previousOverall: number | null
  durationMs: number
  /** 타임라인을 눌렀을 때 그 시점으로 재생 이동 (초) */
  onSeek: (sec: number) => void
  /** 재생 중인 위치(초)를 읽는 함수 */
  getTime: () => number | null
  /** 타임라인 표시 (녹음 파일이 없으면 끔). 기본 true */
  showTimeline?: boolean
  /** 타임라인을 처음부터 펼쳐 둠 */
  timelineOpen?: boolean
}

const scoreTone = (s: number) => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low')

/** 다시 듣기 화면의 분석 결과 (참고용) */
export function AnalysisReport({
  record,
  previousOverall,
  durationMs,
  onSeek,
  getTime,
  showTimeline = true,
  timelineOpen = false,
}: Props) {
  const [open, setOpen] = useState(timelineOpen)
  const { result } = record
  const delta = result.overall !== null && previousOverall !== null ? result.overall - previousOverall : null

  return (
    <section className="analysis">
      <header className="analysis-head">
        <span className="analysis-score">
          {result.overall ?? '–'}
          <small> / 100</small>
        </span>
        {delta !== null && delta !== 0 && (
          <span className={`analysis-delta ${delta > 0 ? 'up' : 'down'}`}>
            지난번보다 {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
        <span className="analysis-tag" title="기준값은 경험치입니다. 습관을 찾는 용도로 참고하세요.">
          참고용
        </span>
      </header>

      <div className="analysis-cats">
        {result.categories.map((c) => (
          <div key={c.key} className="analysis-cat">
            <div className="analysis-cat-row">
              <span className="analysis-cat-label">{c.label}</span>
              <span className="analysis-bar">
                {c.score !== null && <i className={scoreTone(c.score)} style={{ width: `${c.score}%` }} />}
              </span>
              <span className="analysis-cat-score">{c.score ?? '측정 불가'}</span>
            </div>
            {c.details.map((d) => (
              <p key={d} className="analysis-detail">
                {d}
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* 시선·자세 그림 (얼굴이 충분히 잡혔을 때만) */}
      {result.metrics.faceDetectedRatio >= 0.5 && (
        <div className="analysis-figures">
          <GazeFigure face={record.face} baseline={record.baseline} onSeek={onSeek} />
          <PostureFigure
            face={record.face}
            nods={result.metrics.nods}
            shakes={result.metrics.shakes}
            nodsPerMin={result.metrics.nodsPerMin}
            shakesPerMin={result.metrics.shakesPerMin}
            meanTilt={result.metrics.meanTilt}
          />
        </div>
      )}

      {result.advice.length > 0 && (
        <ul className="analysis-advice">
          {result.advice.map((a) => (
            <li key={a.key}>{a.text}</li>
          ))}
        </ul>
      )}

      {showTimeline && (
        <>
          <button className="btn link" onClick={() => setOpen((o) => !o)}>
            {open ? '타임라인 닫기' : '자세히 · 타임라인'}
          </button>
          {open && <Timeline record={record} durationMs={durationMs} onSeek={onSeek} getTime={getTime} />}
        </>
      )}
    </section>
  )
}

const W = 600
const ROW = { gaze: 8, voice: 44, head: 92 }

/** 시선 구간 띠: 같은 상태가 이어지는 구간끼리 묶음 */
function gazeSegments(face: FaceSample[], durationMs: number) {
  const segs: { start: number; end: number; kind: 'front' | 'away' | 'none' }[] = []
  face.forEach((f, i) => {
    const kind = !f.detected ? 'none' : f.frontal ? 'front' : 'away'
    const end = face[i + 1]?.t ?? durationMs
    const last = segs[segs.length - 1]
    if (last && last.kind === kind) last.end = end
    else segs.push({ start: f.t, end, kind })
  })
  return segs
}

function Timeline({
  record,
  durationMs,
  onSeek,
  getTime,
}: Pick<Props, 'record' | 'durationMs' | 'onSeek' | 'getTime'>) {
  const total = Math.max(1, durationMs)
  const x = (t: number) => (t / total) * W
  const headRef = useRef<SVGLineElement>(null)

  const data = useMemo(() => {
    const { audio, face, baseline, result } = record
    const detected = face.filter((f) => f.detected)
    const p = METRIC_PARAMS
    const nods = findSwings(
      detected.map((f) => ({ t: f.t, v: f.pitch })),
      p.headSwingDeg,
      p.headSwingMinSec,
      p.headSwingMaxSec,
    )
    const shakes = findSwings(
      detected.map((f) => ({ t: f.t, v: f.yaw })),
      p.headSwingDeg,
      p.headSwingMinSec,
      p.headSwingMaxSec,
    )
    // 음 높이: 본인 중앙값 기준 ±12반음을 줄 높이에 맞춤. 끊긴 곳은 선을 나눔
    const med = result.metrics.medianF0
    const lines: string[] = []
    let cur: string[] = []
    for (const a of audio) {
      if (a.f0 && med) {
        const st = Math.max(-12, Math.min(12, 12 * Math.log2(a.f0 / med)))
        cur.push(`${x(a.t).toFixed(1)},${(ROW.voice + 14 - (st / 12) * 14).toFixed(1)}`)
      } else if (cur.length) {
        lines.push(cur.join(' '))
        cur = []
      }
    }
    if (cur.length) lines.push(cur.join(' '))
    return {
      gaze: gazeSegments(face, total),
      silences: silenceSpans(audio, baseline.noiseDb),
      pitchLines: lines.filter((l) => l.includes(' ')),
      nods,
      shakes,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, total])

  // 재생 위치 표시선
  useEffect(() => {
    let id = 0
    const loop = () => {
      const t = getTime()
      if (headRef.current) {
        headRef.current.style.display = t === null ? 'none' : ''
        if (t !== null) {
          const px = String(x(t * 1000))
          headRef.current.setAttribute('x1', px)
          headRef.current.setAttribute('x2', px)
        }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  })

  const fill = { front: 'var(--ok)', away: 'var(--warn)', none: 'var(--border)' }

  return (
    <div className="timeline">
      <div className="timeline-labels">
        <span>시선</span>
        <span>음 높이</span>
        <span>고개</span>
      </div>
      <svg
        viewBox={`0 0 ${W} 110`}
        preserveAspectRatio="none"
        role="img"
        aria-label="시선·음 높이·고개 움직임 타임라인. 누르면 그 시점으로 이동합니다."
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onSeek((((e.clientX - r.left) / r.width) * total) / 1000)
        }}
      >
        {data.gaze.map((s) => (
          <rect key={`g${s.start}`} x={x(s.start)} y={ROW.gaze} width={Math.max(1, x(s.end) - x(s.start))} height={14} fill={fill[s.kind]} />
        ))}
        {data.silences.map((s) => (
          <rect key={`s${s.start}`} x={x(s.start)} y={ROW.voice} width={x(s.end) - x(s.start)} height={28} fill="var(--border)" />
        ))}
        <line x1={0} x2={W} y1={ROW.voice + 14} y2={ROW.voice + 14} stroke="var(--border)" strokeDasharray="3 3" />
        {data.pitchLines.map((pts, i) => (
          <polyline key={i} points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {data.nods.map((t) => (
          <circle key={`n${t}`} cx={x(t)} cy={ROW.head + 4} r={4} fill="var(--danger)" />
        ))}
        {data.shakes.map((t) => (
          <rect key={`k${t}`} x={x(t) - 3.5} y={ROW.head} width={7} height={8} fill="var(--warn)" />
        ))}
        <line ref={headRef} y1={0} y2={110} stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="timeline-legend">
        <i style={{ background: 'var(--ok)' }} /> 정면 <i style={{ background: 'var(--warn)' }} /> 시선 이탈{' '}
        <i style={{ background: 'var(--border)' }} /> 얼굴 없음·긴 침묵 <i className="dot" /> 끄덕임{' '}
        <i style={{ background: 'var(--warn)' }} /> 좌우 흔들림 · 누르면 그 시점으로 이동
      </p>
    </div>
  )
}
