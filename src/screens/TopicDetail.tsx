import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuestionMeta, QuestionOrder, Topic } from '../types'
import { EMPTY_QUESTION_META } from '../types'
import { QuestionHistoryPanel, SessionHistoryPanel } from '../components/HistoryPanels'

/** 질의의 분석 점수 기록 (점수가 있는 것만) */
const scoresOf = (topic: Topic, q: string) =>
  (topic.analysisHistory?.[q] ?? []).map((h) => h.overall).filter((v): v is number => v !== null)
import {
  BackIcon,
  CloseIcon,
  EditIcon,
  FlagIcon,
  MemoIcon,
  OrderedIcon,
  PlayIcon,
  ShuffleIcon,
  StarIcon,
} from '../components/Icons'

/** 화면을 나갔다 와도 유지할 목록 상태 (필터·선택) */
export interface DetailUiState {
  /** 선택한 중요도 (비어 있으면 전체). 0은 미지정 */
  importance: number[]
  hardOnly: boolean
  memoOnly: boolean
  search: string
  /** 선택한 질의 (문장 기준) */
  selected: string[]
  /** 선택 연습의 출제 순서 (null이면 주제 설정을 따름) */
  order: QuestionOrder | null
  /** 목록 정렬: 기본 순서 / 최근 분석 점수 낮은 순 / 높은 순 */
  sort: 'default' | 'scoreAsc' | 'scoreDesc'
}

export const EMPTY_DETAIL_STATE: DetailUiState = {
  importance: [],
  hardOnly: false,
  memoOnly: false,
  search: '',
  selected: [],
  order: null,
  sort: 'default',
}

interface Props {
  topic: Topic
  uiState: DetailUiState
  onUiStateChange: (state: DetailUiState) => void
  onUpdateMeta: (question: string, patch: Partial<QuestionMeta>) => void
  onBack: () => void
  onEdit: () => void
  onStart: (questions: string[], order: QuestionOrder) => void
}

/** 별 5개 중요도. 같은 별을 다시 누르면 해제 */
export function StarRating({
  value,
  onChange,
  size = 18,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
}) {
  return (
    <span className={`stars ${onChange ? 'editable' : ''}`} aria-label={`중요도 ${value}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            className={n <= value ? 'on' : ''}
            onClick={() => onChange(n === value ? 0 : n)}
            title={n === value ? '중요도 해제' : `중요도 ${n}`}
          >
            <StarIcon size={size} filled={n <= value} />
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''}>
            <StarIcon size={size} filled={n <= value} />
          </span>
        ),
      )}
    </span>
  )
}

/** 메모 입력: 입력이 멈추면 잠시 뒤 저장, 포커스를 잃으면 바로 저장 */
export function MemoField({ value, onSave, rows = 3 }: { value: string; onSave: (v: string) => void; rows?: number }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef({ draft, value, onSave })
  latest.current = { draft, value, onSave }

  const flush = () => {
    window.clearTimeout(timer.current)
    const { draft: d, value: v, onSave: save } = latest.current
    if (d !== v) save(d)
  }

  // 화면을 나갈 때 저장하지 못한 내용이 있으면 저장
  useEffect(() => flush, [])

  return (
    <textarea
      className="memo-input"
      rows={rows}
      autoFocus
      value={draft}
      placeholder="답변 요점, 키워드, 주의할 점 등을 적어 두세요"
      onChange={(e) => {
        setDraft(e.target.value)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(flush, 600)
      }}
      onBlur={flush}
    />
  )
}

const IMPORTANCE_FILTERS = [5, 4, 3, 2, 1, 0]

export function TopicDetail({ topic, uiState, onUiStateChange, onUpdateMeta, onBack, onEdit, onStart }: Props) {
  /** 오른쪽 메모 패널에 보여 줄 질의 번호 (닫혀 있으면 null) */
  const [memoFor, setMemoFor] = useState<number | null>(null)
  const [memoEditing, setMemoEditing] = useState(false)
  /** 오른쪽 패널: 질의 이전 기록 / 종합 기록 (메모 패널과 하나만 열림) */
  const [historyFor, setHistoryFor] = useState<number | null>(null)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const toggleHistory = (i: number) => {
    setMemoFor(null)
    setSessionsOpen(false)
    setHistoryFor((cur) => (cur === i ? null : i))
  }
  const toggleSessions = () => {
    setMemoFor(null)
    setHistoryFor(null)
    setSessionsOpen((o) => !o)
  }
  const state = uiState
  const set = (patch: Partial<DetailUiState>) => onUiStateChange({ ...state, ...patch })

  const patchMeta = onUpdateMeta

  // 질의가 편집되어 사라진 선택은 무시
  const selected = useMemo(
    () => new Set(state.selected.filter((q) => topic.questions.includes(q))),
    [state.selected, topic.questions],
  )

  const visible = useMemo(() => {
    const keyword = state.search.trim().toLowerCase()
    return topic.questions
      .map((q, i) => ({
        q,
        i,
        meta: { ...EMPTY_QUESTION_META, ...topic.questionMeta?.[q] },
      }))
      .filter(({ q, meta }) => {
        if (state.importance.length > 0 && !state.importance.includes(meta.importance)) return false
        if (state.hardOnly && !meta.hard) return false
        if (state.memoOnly && !meta.memo.trim()) return false
        if (keyword && !q.toLowerCase().includes(keyword) && !meta.memo.toLowerCase().includes(keyword)) return false
        return true
      })
      .sort((a, b) => {
        if (state.sort === 'default') return a.i - b.i
        // 점수가 없는 질의는 맨 뒤
        const sa = scoresOf(topic, a.q).at(-1)
        const sb = scoresOf(topic, b.q).at(-1)
        if (sa === undefined || sb === undefined) return (sa === undefined ? 1 : 0) - (sb === undefined ? 1 : 0) || a.i - b.i
        return (state.sort === 'scoreAsc' ? sa - sb : sb - sa) || a.i - b.i
      })
  }, [state.hardOnly, state.importance, state.memoOnly, state.search, state.sort, topic])

  const filtering = state.importance.length > 0 || state.hardOnly || state.memoOnly || state.search.trim() !== ''
  const allVisibleSelected = visible.length > 0 && visible.every(({ q }) => selected.has(q))

  const toggleSelect = (q: string) => {
    const next = new Set(selected)
    if (next.has(q)) next.delete(q)
    else next.add(q)
    set({ selected: [...next] })
  }

  const toggleVisible = () => {
    const next = new Set(selected)
    visible.forEach(({ q }) => (allVisibleSelected ? next.delete(q) : next.add(q)))
    set({ selected: [...next] })
  }

  const toggleImportance = (n: number) =>
    set({
      importance: state.importance.includes(n) ? state.importance.filter((x) => x !== n) : [...state.importance, n],
    })

  /** 메모 버튼: 패널을 열고, 같은 질의를 다시 누르면 닫음. 메모가 없으면 바로 입력 상태 */
  const toggleMemo = (i: number) => {
    setHistoryFor(null)
    setSessionsOpen(false)
    if (memoFor === i) {
      setMemoFor(null)
      return
    }
    setMemoFor(i)
    setMemoEditing(!topic.questionMeta?.[topic.questions[i]]?.memo.trim())
  }
  // 선택한 질의를 원래 목록 순서대로 연습
  const selectedInOrder = topic.questions.filter((q) => selected.has(q))
  const order = state.order ?? topic.settings.order
  const memoQuestion = memoFor !== null ? (topic.questions[memoFor] ?? null) : null
  const memoText = memoQuestion ? (topic.questionMeta?.[memoQuestion]?.memo ?? '') : ''
  const hardCount = topic.questions.filter((q) => topic.questionMeta?.[q]?.hard).length

  return (
    <div className="page detail">
      <header className="page-header">
        <div className="detail-title">
          <button className="icon-btn" onClick={onBack} title="목록으로" aria-label="목록으로">
            <BackIcon size={22} />
          </button>
          <div>
            <h1>{topic.title}</h1>
            {topic.description && <p className="topic-desc">{topic.description}</p>}
          </div>
        </div>
        <div className="header-actions">
          <button className={`btn ghost ${sessionsOpen ? 'on' : ''}`} onClick={toggleSessions} title="연습 세션별 종합 기록">
            종합 기록 ({topic.sessionHistory?.length ?? 0})
          </button>
          <button className="btn ghost" onClick={onEdit}>
            편집·설정
          </button>
        </div>
      </header>

      <section className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">중요도</span>
          {IMPORTANCE_FILTERS.map((n) => (
            <button
              key={n}
              className={`chip ${state.importance.includes(n) ? 'on' : ''}`}
              onClick={() => toggleImportance(n)}
            >
              {n === 0 ? (
                '미지정'
              ) : (
                <>
                  <StarIcon size={13} filled /> {n}
                </>
              )}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <button
            className={`chip hard ${state.hardOnly ? 'on' : ''}`}
            onClick={() => set({ hardOnly: !state.hardOnly })}
          >
            <FlagIcon size={13} filled={state.hardOnly} /> 안 외워짐 ({hardCount})
          </button>
          <button className={`chip ${state.memoOnly ? 'on' : ''}`} onClick={() => set({ memoOnly: !state.memoOnly })}>
            <MemoIcon size={13} /> 메모 있음
          </button>
          <input
            className="filter-search"
            value={state.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="질의·메모 검색"
          />
          {filtering && (
            <button
              className="btn link"
              onClick={() =>
                set({
                  importance: [],
                  hardOnly: false,
                  memoOnly: false,
                  search: '',
                })
              }
            >
              필터 초기화
            </button>
          )}
        </div>
      </section>

      <div className="detail-body">
        <div className="detail-list">
          <div className="q-list-head">
            <label className="q-check">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisible}
                disabled={visible.length === 0}
              />
              <span>{filtering ? `보이는 ${visible.length}개 전체 선택` : `전체 선택`}</span>
            </label>
            <span className="q-list-tools">
              <select
                className="sort-select"
                value={state.sort ?? 'default'}
                onChange={(e) => set({ sort: e.target.value as DetailUiState['sort'] })}
                aria-label="정렬"
              >
                <option value="default">기본 순서</option>
                <option value="scoreAsc">분석 점수 낮은 순</option>
                <option value="scoreDesc">분석 점수 높은 순</option>
              </select>
              <span className="muted">
                {filtering ? `${topic.questions.length}개 중 ${visible.length}개` : `질의 ${topic.questions.length}개`}
              </span>
            </span>
          </div>

          <ul className="q-list">
            {visible.length === 0 && <li className="q-empty">조건에 맞는 질의가 없습니다.</li>}
            {visible.map(({ q, i, meta }) => {
              const memoOpen = memoFor === i
              return (
                <li key={`${i}-${q}`} className={`q-item ${selected.has(q) ? 'selected' : ''}`}>
                  <div className="q-row">
                    <input
                      type="checkbox"
                      checked={selected.has(q)}
                      onChange={() => toggleSelect(q)}
                      aria-label="선택"
                    />
                    <span className="q-no">{i + 1}</span>
                    <span className="q-text" onClick={() => toggleSelect(q)}>
                      {q}
                    </span>
                    <QuestionScore scores={scoresOf(topic, q)} open={historyFor === i} onClick={() => toggleHistory(i)} />
                    <StarRating value={meta.importance} onChange={(v) => patchMeta(q, { importance: v })} />
                    <button
                      className={`icon-btn flag-btn ${meta.hard ? 'on' : ''}`}
                      onClick={() => patchMeta(q, { hard: !meta.hard })}
                      title={meta.hard ? '안 외워짐 해제' : '잘 안 외워짐 표시'}
                    >
                      <FlagIcon size={18} filled={meta.hard} />
                    </button>
                    <button
                      className={`icon-btn memo-btn ${meta.memo.trim() ? 'has' : ''} ${memoOpen ? 'open' : ''}`}
                      onClick={() => toggleMemo(i)}
                      title={memoOpen ? '메모 닫기' : meta.memo.trim() ? '메모 보기' : '메모 추가'}
                    >
                      <MemoIcon size={18} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {memoQuestion !== null && (
          <aside className="memo-panel">
            <header>
              <span className="memo-panel-title">
                <MemoIcon size={16} /> 메모 · {memoFor! + 1}번
              </span>
              <button className="icon-btn" onClick={() => setMemoFor(null)} aria-label="메모 닫기">
                <CloseIcon size={18} />
              </button>
            </header>
            <p className="memo-panel-question">{memoQuestion}</p>
            {memoEditing ? (
              <>
                {/* 질의가 바뀌면 새로 그려서 이전 질의의 메모를 먼저 저장 */}
                <MemoField
                  key={memoQuestion}
                  rows={12}
                  value={memoText}
                  onSave={(memo) => patchMeta(memoQuestion, { memo })}
                />
                <button className="btn primary memo-panel-btn" onClick={() => setMemoEditing(false)}>
                  완료
                </button>
              </>
            ) : (
              <>
                {memoText.trim() ? (
                  <p className="memo-panel-text" onClick={() => setMemoEditing(true)}>
                    {memoText}
                  </p>
                ) : (
                  <p className="memo-panel-empty">아직 메모가 없습니다.</p>
                )}
                <button className="btn ghost memo-panel-btn" onClick={() => setMemoEditing(true)}>
                  <EditIcon size={16} /> {memoText.trim() ? '수정' : '메모 추가'}
                </button>
              </>
            )}
          </aside>
        )}
        {memoQuestion === null && historyFor !== null && topic.questions[historyFor] !== undefined && (
          <QuestionHistoryPanel topic={topic} index={historyFor} onClose={() => setHistoryFor(null)} />
        )}
        {memoQuestion === null && historyFor === null && sessionsOpen && (
          <SessionHistoryPanel topic={topic} onClose={() => setSessionsOpen(false)} />
        )}
      </div>

      <footer className="start-bar">
        <span>
          <strong>{selectedInOrder.length}개</strong> 선택
          {selectedInOrder.length > 0 && (
            <button className="btn link" onClick={() => set({ selected: [] })}>
              선택 해제
            </button>
          )}
        </span>
        <div className="start-actions">
          <div className="order-toggle" role="radiogroup" aria-label="출제 순서">
            <button
              role="radio"
              aria-checked={order === 'sequential'}
              className={order === 'sequential' ? 'on' : ''}
              onClick={() => set({ order: 'sequential' })}
              title="순서대로"
            >
              <OrderedIcon size={20} />
            </button>
            <button
              role="radio"
              aria-checked={order === 'random'}
              className={order === 'random' ? 'on' : ''}
              onClick={() => set({ order: 'random' })}
              title="무작위"
            >
              <ShuffleIcon size={20} />
            </button>
          </div>
          <button
            className="btn primary"
            disabled={selectedInOrder.length === 0}
            onClick={() => onStart(selectedInOrder, order)}
          >
            <PlayIcon size={16} /> 선택한 질의 연습
          </button>
        </div>
      </footer>
    </div>
  )
}

/** 질의별 최근 분석 점수 (누르면 이전 기록) */
function QuestionScore({ scores, open, onClick }: { scores: number[]; open: boolean; onClick: () => void }) {
  if (scores.length === 0) return null
  const last = scores[scores.length - 1]
  const tone = last >= 80 ? 'good' : last >= 60 ? 'mid' : 'low'
  return (
    <button
      className={`q-score ${open ? 'open' : ''}`}
      onClick={onClick}
      title={`최근 분석 점수 (참고용) · 누르면 이전 기록 ${scores.length}회`}
    >
      <strong className={tone}>{last}</strong>
    </button>
  )
}
