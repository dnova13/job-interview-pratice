import { useEffect, useMemo, useState } from 'react'
import type { Topic } from '../types'
import type { AnalysisRecord, AnalysisSummary, CategoryKey, SessionSummary } from '../lib/analysis/types'
import { CATEGORY_LABELS, combineMetrics, metricRows } from '../lib/analysis/scoring'
import { formatDateTime, formatDuration } from '../lib/format'
import { GazeFigure, PostureFigure } from './AnalysisFigures'
import { RecordDetail } from './RecordDetail'

const tone = (s: number) => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low')
const KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[]

type Entry = { question: string; summary: AnalysisSummary }

interface Props {
  topic: Topic
  summary: SessionSummary
  /** 이번 세션의 질의별 기록. 없으면 질의별 기록(analysisHistory)에서 세션 id로 찾음 */
  entries?: Entry[]
}

/** 질의별 기록 중 이 세션에서 답한 것 (답한 순서) */
function findEntries(topic: Topic, sessionId: string): Entry[] {
  const out: Entry[] = []
  for (const [question, list] of Object.entries(topic.analysisHistory ?? {}))
    for (const summary of list) if (summary.sessionId === sessionId) out.push({ question, summary })
  return out.sort((a, b) => a.summary.at - b.summary.at)
}

/** 세션 종합 결과 보고서 (참고용) */
export function SessionReport({ topic, summary, entries: given }: Props) {
  const [detail, setDetail] = useState<Entry | null>(null)
  const entries = useMemo(() => given ?? findEntries(topic, summary.id), [given, topic, summary.id])
  // entries 배열은 렌더마다 새로 만들어질 수 있으므로 기록 id로 비교해 다시 불러오기를 막음
  const idsKey = entries.map((e) => `${e.summary.id}:${e.summary.hasDetail ? 1 : 0}`).join(',')
  const minutes = Math.max(1, Math.round((summary.endedAt - summary.startedAt) / 60000))

  // 질의별 상세 데이터(시계열)를 모아 세션 전체 그림·지표를 만듦
  const [records, setRecords] = useState<(AnalysisRecord | null)[] | null>(null)
  useEffect(() => {
    let alive = true
    setRecords(null)
    const load = (e: Entry) =>
      e.summary.hasDetail ? window.api.loadAnalysisDetail(topic.id, e.summary.id).catch(() => null) : null
    void (async () => {
      let rs = await Promise.all(entries.map(load))
      // 끝난 직후에는 마지막 답변의 상세 데이터가 아직 저장 중일 수 있어 한 번 더 시도
      if (rs.some((r, i) => !r && entries[i].summary.hasDetail)) {
        await new Promise((r) => setTimeout(r, 600))
        rs = await Promise.all(entries.map((e, i) => rs[i] ?? load(e)))
      }
      if (alive) setRecords(rs)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, topic.id])

  const combined = useMemo(() => {
    if (!records) return null
    const loaded = records
      .map((r, i) => (r ? { r, i } : null))
      .filter((x): x is { r: AnalysisRecord; i: number } => x !== null)
    const metrics = combineMetrics(loaded.map(({ r }) => r.result.metrics))
    // 얼굴이 충분히 잡힌 답변만 그림에 씀
    const faced = loaded.filter(({ r }) => r.result.metrics.faceDetectedRatio >= 0.5 && r.face.length > 0)
    return { loaded: loaded.length, metrics, faced }
  }, [records])

  return (
    <section className="session-report">
      <header className="session-report-head">
        <span className="analysis-score">
          {summary.overall ?? '–'}
          <small> / 100</small>
        </span>
        <span className="muted">
          {formatDateTime(summary.startedAt)} · 약 {minutes}분 · {summary.order === 'random' ? '무작위' : '순서대로'}
        </span>
        <span className={`session-status ${summary.completed ? 'done' : 'stopped'}`}>
          {summary.completed ? '완료' : '중단'}
        </span>
        <span className="analysis-tag">참고용</span>
      </header>
      <p className="muted session-count">
        질의 {summary.total}개 중 {summary.answered}개 답변 분석
      </p>

      <div className="analysis-cats">
        {KEYS.map((k) => {
          const v = summary.scores[k]
          return (
            <div key={k} className="analysis-cat-row">
              <span className="analysis-cat-label">{CATEGORY_LABELS[k]}</span>
              <span className="analysis-bar">{v !== null && <i className={tone(v)} style={{ width: `${v}%` }} />}</span>
              <span className="analysis-cat-score">{v ?? '측정 불가'}</span>
            </div>
          )
        })}
      </div>

      {summary.habits.length > 0 && (
        <ul className="analysis-advice">
          {summary.habits.map((h) => (
            <li key={h.text}>
              {h.count > 1 && <strong>{h.count}번 반복 · </strong>}
              {h.text}
            </li>
          ))}
        </ul>
      )}

      <h3 className="session-section-title">상세</h3>

      {entries.length === 0 ? (
        <p className="field-hint">이 세션의 질의별 기록이 남아 있지 않아 상세 내용을 표시할 수 없습니다.</p>
      ) : (
        <>
          {/* 질의별 점수 비교 */}
          <div className="session-entries">
            <p className="field-label">질의별 점수 · 누르면 상세 보기</p>
            <div className="session-compare-head" aria-hidden>
              <span />
              {KEYS.map((k) => (
                <span key={k}>{CATEGORY_LABELS[k]}</span>
              ))}
              <span>종합</span>
            </div>
            <ul>
              {entries.map((e) => (
                <li key={e.summary.id}>
                  <button className="session-entry compare" onClick={() => setDetail(e)}>
                    <span className="session-entry-q">
                      {e.question}
                      <small className="muted">
                        {formatDuration(e.summary.durationSec)}
                        {e.summary.recordingPath ? ' · 저장됨' : ''}
                      </small>
                    </span>
                    {KEYS.map((k) => {
                      const v = e.summary.scores[k]
                      return (
                        <span key={k} className="compare-cell" title={`${CATEGORY_LABELS[k]} ${v ?? '측정 불가'}`}>
                          <span className="analysis-bar">
                            {v !== null && <i className={tone(v)} style={{ width: `${v}%` }} />}
                          </span>
                          <small>{v ?? '–'}</small>
                        </span>
                      )
                    })}
                    {e.summary.overall !== null ? (
                      <strong className={`score-chip ${tone(e.summary.overall)}`}>{e.summary.overall}</strong>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {records === null ? (
            <p className="muted">상세 데이터를 불러오는 중…</p>
          ) : !combined || combined.loaded === 0 ? (
            <p className="field-hint">상세 데이터(그림·지표)는 최근 기록만 보관해 이 세션은 남아 있지 않습니다.</p>
          ) : (
            <>
              {combined.metrics && (
                <div className="session-metrics">
                  <p className="field-label">
                    세션 전체 지표 · 답변 {combined.loaded}개, 총 {formatDuration(combined.metrics.durationSec)}
                  </p>
                  <table>
                    <tbody>
                      {metricRows(combined.metrics)
                        .filter((r) => combined.faced.length > 0 || (r.category !== 'gaze' && r.category !== 'posture'))
                        .map((r) => (
                          <tr key={r.key} className={r.score >= 80 ? '' : 'warn'}>
                            <td className="muted">{CATEGORY_LABELS[r.category]}</td>
                            <td>{r.label}</td>
                            <td className="metric-value">{r.value}</td>
                            <td className="muted">{r.rangeLabel}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {combined.faced.length > 0 && combined.metrics && (
                <div className="analysis-figures">
                  <GazeFigure
                    sets={combined.faced.map(({ r }) => ({ face: r.face, baseline: r.baseline }))}
                    onSeek={(_, set) => setDetail(entries[combined.faced[set].i])}
                  />
                  <PostureFigure
                    face={combined.faced.flatMap(({ r }) => r.face)}
                    nods={combined.metrics.nods}
                    shakes={combined.metrics.shakes}
                    nodsPerMin={combined.metrics.nodsPerMin}
                    shakesPerMin={combined.metrics.shakesPerMin}
                    meanTilt={combined.metrics.meanTilt}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {detail && (
        <RecordDetail
          topic={topic}
          question={detail.question}
          summary={detail.summary}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  )
}
