import { useMemo } from 'react'
import type { Baseline, FaceSample } from '../lib/analysis/types'
import { GAZE_FRONTAL_X, GAZE_FRONTAL_Y, gazeOf } from '../lib/analysis/face'
import { CRITERIA } from '../lib/analysis/scoring'

const OK = 'var(--ok)'
const WARN = 'var(--warn)'

const percentile = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)))]
}
const median = (xs: number[]) => percentile(xs, 0.5)
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

// ---------- 시선 그림 ----------

type Region = 'front' | 'up' | 'down' | 'left' | 'right'
const REGION_LABEL: Record<Region, string> = { front: '정면', up: '위', down: '아래', left: '왼쪽', right: '오른쪽' }

/**
 * 면접관(카메라) 그림 위에 내가 본 방향을 점으로 표시.
 * 내 쪽에서 본 방향 기준: 내 왼쪽을 보면 그림의 왼쪽에 찍힘
 */
export function GazeFigure({
  face,
  baseline,
  sets,
  onSeek,
}: {
  face?: FaceSample[]
  baseline?: Baseline
  /** 여러 답변을 합쳐 그릴 때: 답변마다 자기 기준값으로 계산 */
  sets?: { face: FaceSample[]; baseline: Baseline }[]
  /** 점을 누르면 그 시점으로 이동 (set은 sets의 몇 번째인지) */
  onSeek?: (sec: number, set: number) => void
}) {
  const W = 300
  const H = 270
  const cx = W / 2
  const cy = 125
  // 정면 범위가 면접관 얼굴 크기에 맞도록. 점을 자세히 보도록 얼굴을 크게 그림
  const RX = 70
  const RY = 84
  const sx = RX / GAZE_FRONTAL_X
  const sy = RY / GAZE_FRONTAL_Y

  const groups = useMemo(() => sets ?? (face && baseline ? [{ face, baseline }] : []), [sets, face, baseline])

  const data = useMemo(() => {
    const counts: Record<Region, number> = { front: 0, up: 0, down: 0, left: 0, right: 0 }
    let total = 0
    const dots = groups.flatMap(({ face, baseline }, set) =>
      face
        .filter((f) => f.detected)
        .map((f) => {
          total++
          const g = gazeOf(f)
          // 영상 기준 +x(영상 오른쪽)는 내 왼쪽이므로 좌우를 뒤집음
          const dx = -(g.x - baseline.gazeX)
          const dy = g.y - baseline.gazeY
          let region: Region = 'front'
          if (!f.frontal) {
            const nx = dx / GAZE_FRONTAL_X
            const ny = dy / GAZE_FRONTAL_Y
            region = Math.abs(nx) >= Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : ny < 0 ? 'up' : 'down'
          }
          counts[region]++
          return {
            t: f.t,
            set,
            x: Math.max(6, Math.min(W - 6, cx + dx * sx)),
            // 위·아래 끝은 비율 글자와 겹치지 않도록 여백을 둠
            y: Math.max(26, Math.min(H - 24, cy + dy * sy)),
            front: f.frontal,
          }
        }),
    )
    return { dots, counts, total }
  }, [groups, sx, sy, cx, cy])

  if (data.total < 10) return null
  const away = (['up', 'down', 'left', 'right'] as Region[]).map((r) => ({ r, p: pct(data.counts[r], data.total) }))
  const labelPos: Record<Exclude<Region, 'front'>, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = {
    up: { x: cx, y: 13, anchor: 'middle' },
    down: { x: cx, y: H - 6, anchor: 'middle' },
    left: { x: 6, y: 40, anchor: 'start' },
    right: { x: W - 6, y: 40, anchor: 'end' },
  }

  return (
    <figure className="figure gaze">
      <figcaption>
        <strong>시선</strong> 면접관(카메라)을 본 위치 · 정면 {pct(data.counts.front, data.total)}%
      </figcaption>
      {/* title 요소는 마우스를 올리면 말풍선이 그림을 가리므로 aria-label로 설명 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="figure-svg"
        role="img"
        aria-label="면접관 그림 위에 내가 본 방향을 점으로 표시. 점을 누르면 그 시점으로 이동합니다."
      >
        {/* 면접관: 머리와 어깨 */}
        <path
          d={`M ${cx - 135} ${H} Q ${cx - 125} ${cy + RY + 22} ${cx} ${cy + RY + 16} Q ${cx + 125} ${cy + RY + 22} ${cx + 135} ${H} Z`}
          className="figure-body"
        />
        <ellipse cx={cx} cy={cy} rx={RX} ry={RY} className="figure-head" />
        <circle cx={cx - 26} cy={cy - 10} r={4} className="figure-eye" />
        <circle cx={cx + 26} cy={cy - 10} r={4} className="figure-eye" />
        {/* 정면 범위 */}
        <rect
          x={cx - RX}
          y={cy - RY}
          width={RX * 2}
          height={RY * 2}
          rx={50}
          fill="none"
          stroke={OK}
          strokeDasharray="4 3"
          strokeWidth={1.5}
        />
        {data.dots.map((d) => (
          <circle
            key={`${d.set}-${d.t}`}
            cx={d.x}
            cy={d.y}
            r={3}
            fill={d.front ? OK : WARN}
            opacity={0.3}
            className={onSeek ? 'figure-dot' : undefined}
            onClick={onSeek ? () => onSeek(d.t / 1000, d.set) : undefined}
          />
        ))}
        {away.map(({ r, p }) =>
          p > 0 ? (
            <text
              key={r}
              x={labelPos[r as Exclude<Region, 'front'>].x}
              y={labelPos[r as Exclude<Region, 'front'>].y}
              textAnchor={labelPos[r as Exclude<Region, 'front'>].anchor}
              className="figure-label warn"
            >
              {REGION_LABEL[r]} {p}%
            </text>
          ) : null,
        )}
      </svg>
      <p className="figure-note">
        점 하나가 약 0.07초입니다.{' '}
        {groups.length > 1
          ? `답변 ${groups.length}개를 합쳐 그렸습니다. 점을 누르면 그 답변의 상세 보기가 열립니다.`
          : onSeek
            ? '점을 누르면 그 장면으로 이동합니다.'
            : ''}{' '}
        (내 쪽에서 본 방향 기준)
      </p>
    </figure>
  )
}

// ---------- 자세 그림 ----------

interface Mini {
  title: string
  /** 그림 아래 설명 */
  lines: string[]
  ok: boolean
  /** 고개 회전 (가운데, 범위 양 끝) */
  angle: number
  lo: number
  hi: number
  kind: 'front' | 'side' | 'top'
}

/** 머리 그림 하나: 목(회전 중심)을 기준으로 회전 */
function Head({ kind, angle, ghost }: { kind: Mini['kind']; angle: number; ghost?: boolean }) {
  const cls = ghost ? 'figure-ghost' : 'figure-head'
  const pivot = kind === 'top' ? '50 52' : '50 74'
  return (
    <g transform={`rotate(${angle} ${pivot})`}>
      {kind === 'front' && (
        <>
          <ellipse cx={50} cy={46} rx={20} ry={25} className={cls} />
          {!ghost && (
            <>
              <circle cx={42} cy={42} r={2} className="figure-eye" />
              <circle cx={58} cy={42} r={2} className="figure-eye" />
              <path d="M 44 56 Q 50 60 56 56" fill="none" className="figure-line" />
            </>
          )}
        </>
      )}
      {kind === 'side' && (
        <>
          {/* 옆모습: 오른쪽을 보는 머리, 코 돌출 */}
          <path
            d="M 50 22 C 70 22 74 38 72 46 L 78 52 L 71 55 C 70 66 62 72 50 72 C 34 72 28 60 28 46 C 28 32 36 22 50 22 Z"
            className={cls}
          />
          {!ghost && <circle cx={63} cy={42} r={2} className="figure-eye" />}
        </>
      )}
      {kind === 'top' && (
        <>
          {/* 위에서 본 머리: 원 + 코(앞쪽 = 아래) */}
          <circle cx={50} cy={52} r={20} className={cls} />
          <path d="M 45 70 L 50 78 L 55 70 Z" className={ghost ? 'figure-ghost' : 'figure-nose'} />
        </>
      )}
    </g>
  )
}

function MiniFigure({ m }: { m: Mini }) {
  return (
    <figure className="figure mini">
      <figcaption>{m.title}</figcaption>
      <svg viewBox="0 0 100 92" className="figure-svg" role="img" aria-label={`${m.title}: ${m.lines.join(', ')}`}>
        {m.kind !== 'top' && <path d="M 30 92 Q 34 74 50 72 Q 66 74 70 92 Z" className="figure-body" />}
        {m.kind === 'top' && <ellipse cx={50} cy={58} rx={40} ry={14} className="figure-body" />}
        <Head kind={m.kind} angle={m.lo} ghost />
        <Head kind={m.kind} angle={m.hi} ghost />
        <Head kind={m.kind} angle={m.angle} />
        {m.kind === 'front' && <line x1={50} y1={14} x2={50} y2={78} stroke="var(--border)" strokeDasharray="2 2" />}
      </svg>
      {m.lines.map((l) => (
        <p key={l} className={`figure-stat ${m.ok ? '' : 'warn'}`}>
          {l}
        </p>
      ))}
    </figure>
  )
}

/** 자세: 정면(기울기)·옆모습(상하 끄덕임)·위에서 본 모습(좌우 흔들림) */
export function PostureFigure({
  face,
  nodsPerMin,
  shakesPerMin,
  nods,
  shakes,
  meanTilt,
}: {
  face: FaceSample[]
  nods: number
  shakes: number
  nodsPerMin: number | null
  shakesPerMin: number | null
  meanTilt: number | null
}) {
  const data = useMemo(() => {
    const d = face.filter((f) => f.detected)
    if (d.length < 10) return null
    const rel = (xs: number[]) => {
      const m = median(xs)
      return { m, lo: percentile(xs, 0.05) - m, hi: percentile(xs, 0.95) - m }
    }
    return {
      pitch: rel(d.map((f) => f.pitch)),
      yaw: rel(d.map((f) => f.yaw)),
      roll: median(d.map((f) => f.roll)),
    }
  }, [face])
  if (!data) return null

  const c = CRITERIA
  const nodOk = (nodsPerMin ?? 0) <= c.nodsPerMin.max
  const shakeOk = (shakesPerMin ?? 0) <= c.shakesPerMin.max
  const tiltOk = (meanTilt ?? 0) <= c.meanTilt.max
  const range = (r: { lo: number; hi: number }) => `${Math.round(r.hi - r.lo)}°`
  // 그림에서 잘 보이도록 각도를 2배로 그림
  const k = 2

  const minis: Mini[] = [
    {
      kind: 'front',
      title: '정면 · 기울기',
      angle: data.roll * k,
      lo: data.roll * k,
      hi: data.roll * k,
      ok: tiltOk,
      lines: [`평균 ${Math.abs(data.roll).toFixed(1)}° 기울어짐`],
    },
    {
      kind: 'side',
      title: '옆모습 · 끄덕임',
      angle: 0,
      lo: data.pitch.lo * k,
      hi: data.pitch.hi * k,
      ok: nodOk,
      lines: [`끄덕임 ${nods}회 (${(nodsPerMin ?? 0).toFixed(1)}회/분)`, `상하 움직임 폭 ${range(data.pitch)}`],
    },
    {
      kind: 'top',
      title: '위에서 · 좌우',
      angle: 0,
      lo: data.yaw.lo * k,
      hi: data.yaw.hi * k,
      ok: shakeOk,
      lines: [`좌우 흔들림 ${shakes}회 (${(shakesPerMin ?? 0).toFixed(1)}회/분)`, `좌우 움직임 폭 ${range(data.yaw)}`],
    },
  ]

  return (
    <div className="figure posture">
      <p className="figure-title">
        <strong>자세</strong> 고개 움직임 (흐린 머리는 움직인 범위, 각도는 2배로 그림)
      </p>
      <div className="posture-row">
        {minis.map((m) => (
          <MiniFigure key={m.kind} m={m} />
        ))}
      </div>
    </div>
  )
}
