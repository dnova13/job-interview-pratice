import { useState } from 'react'
import type { Topic } from '../types'
import type { AnalysisSummary, CategoryKey, SessionSummary } from '../lib/analysis/types'
import { CATEGORY_LABELS } from '../lib/analysis/scoring'
import { formatDateTime, formatDuration } from '../lib/format'
import { Pager, usePaged } from './Pager'
import { RecordDetail } from './RecordDetail'
import { SessionReport } from './SessionReport'
import { Sparkline } from './Sparkline'
import { CloseIcon } from './Icons'

const tone = (s: number) => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low')
const KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[]

/** 질의 하나의 이전 기록 목록 (최근 순, 10개씩) */
export function QuestionHistoryPanel({
  topic,
  index,
  onClose,
}: {
  topic: Topic
  index: number
  onClose: () => void
}) {
  const question = topic.questions[index]
  const history = topic.analysisHistory?.[question] ?? []
  const newestFirst = [...history].reverse()
  const paged = usePaged(newestFirst)
  const [detail, setDetail] = useState<AnalysisSummary | null>(null)
  const scores = history.map((h) => h.overall).filter((v): v is number => v !== null)

  return (
    <aside className="memo-panel history-panel">
      <header>
        <span className="memo-panel-title">이전 기록 · {index + 1}번 · {history.length}회</span>
        <button className="icon-btn" onClick={onClose} aria-label="기록 닫기">
          <CloseIcon size={18} />
        </button>
      </header>
      <p className="memo-panel-question">{question}</p>
      {scores.length >= 2 && (
        <div className="history-trend">
          <Sparkline values={scores.slice(-20)} width={200} height={32} />
          <span className="muted">최근 {Math.min(20, scores.length)}회 추이</span>
        </div>
      )}
      <ul className="history-list">
        {paged.items.map((h) => (
          <li key={h.id}>
            <button className="history-item" onClick={() => setDetail(h)}>
              <span className="history-item-top">
                <span>{formatDateTime(h.at)}</span>
                {h.overall !== null && <strong className={`score-chip ${tone(h.overall)}`}>{h.overall}</strong>}
              </span>
              <span className="history-item-sub">
                {KEYS.map((k) => `${CATEGORY_LABELS[k]} ${h.scores[k] ?? '–'}`).join(' · ')}
              </span>
              <span className="history-item-sub">
                {formatDuration(h.durationSec)}
                {h.recordingPath ? ` · ${h.recordingKind === 'audio' ? '음성' : '영상'} 있음` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Pager page={paged.page} pages={paged.pages} onChange={paged.setPage} />
      {detail && <RecordDetail topic={topic} question={question} summary={detail} onClose={() => setDetail(null)} />}
    </aside>
  )
}

/** 주제의 종합 기록 목록 (최근 순, 10개씩) */
export function SessionHistoryPanel({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const list = [...(topic.sessionHistory ?? [])].reverse()
  const paged = usePaged(list)
  const [open, setOpen] = useState<SessionSummary | null>(null)

  return (
    <aside className="memo-panel history-panel">
      <header>
        <span className="memo-panel-title">종합 기록 · {list.length}회</span>
        <button className="icon-btn" onClick={onClose} aria-label="종합 기록 닫기">
          <CloseIcon size={18} />
        </button>
      </header>
      {list.length === 0 && <p className="muted">아직 종합 기록이 없습니다. 답변 분석을 켜고 연습하면 남습니다.</p>}
      <ul className="history-list">
        {paged.items.map((s) => (
          <li key={s.id}>
            <button className="history-item" onClick={() => setOpen(s)}>
              <span className="history-item-top">
                <span>{formatDateTime(s.startedAt)}</span>
                <span className={`session-status ${s.completed ? 'done' : 'stopped'}`}>
                  {s.completed ? '완료' : '중단'}
                </span>
                {s.overall !== null && <strong className={`score-chip ${tone(s.overall)}`}>{s.overall}</strong>}
              </span>
              <span className="history-item-sub">
                질의 {s.total}개 중 {s.answered}개 · {s.order === 'random' ? '무작위' : '순서대로'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Pager page={paged.page} pages={paged.pages} onChange={paged.setPage} />
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(null)}>
          <div className="modal session-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>종합 기록</h2>
              <button className="icon-btn" onClick={() => setOpen(null)} aria-label="닫기">
                <CloseIcon size={20} />
              </button>
            </header>
            {/* 종료 화면의 결과 보고서와 같은 내용 (질의별 점수·지표·그림) */}
            <SessionReport topic={topic} summary={open} />
          </div>
        </div>
      )}
    </aside>
  )
}
