import { useEffect, useRef, useState } from 'react'
import type { AppSettings, QuestionMeta, QuestionOrder, Topic } from './types'
import { ANALYSIS_DETAIL_MAX, ANALYSIS_HISTORY_MAX, EMPTY_QUESTION_META, SESSION_HISTORY_MAX } from './types'
import type { AnalysisSummary, SessionSummary } from './lib/analysis/types'
import { getFaceLandmarker } from './lib/analysis/face'
import { EMPTY_DETAIL_STATE, TopicDetail, type DetailUiState } from './screens/TopicDetail'
import { HomeScreen } from './screens/HomeScreen'
import { TopicEditor } from './screens/TopicEditor'
import { SettingsModal } from './screens/SettingsModal'
import { PracticeScreen } from './screens/PracticeScreen'

type View =
  | { name: 'home' }
  | { name: 'detail'; topicId: string }
  | { name: 'edit'; topic: Topic | null; from: 'home' | 'detail' }
  | {
      name: 'practice'
      topicId: string
      /** 연습할 질의 (지정하지 않으면 주제 전체) */
      questions?: string[]
      /** 출제 순서 (지정하지 않으면 주제 설정) */
      order?: QuestionOrder
      from: 'home' | 'detail'
    }

export function App() {
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [view, setView] = useState<View>({ name: 'home' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 주제별 질의 목록 화면의 필터·선택 상태 (연습 후 돌아와도 유지) */
  const detailStates = useRef(new Map<string, DetailUiState>())
  const [, forceRender] = useState(0)

  useEffect(() => {
    window.api.loadStore().then((data) => {
      setTopics(data.topics)
      setSettings(data.settings)
      // 얼굴 분석 모델을 미리 읽어 두어 연습 시작을 빠르게 (실패해도 연습 화면에서 다시 시도)
      if (data.settings.analysis.enabled) window.setTimeout(() => void getFaceLandmarker().catch(() => {}), 1500)
    })
  }, [])

  if (!topics || !settings) return <div className="loading">불러오는 중…</div>

  const persistTopics = (next: Topic[]) => {
    setTopics(next)
    void window.api.saveTopics(next)
  }

  const findTopic = (id: string) => topics.find((t) => t.id === id)

  const saveTopic = (topic: Topic, from: 'home' | 'detail') => {
    const prev = topics.find((t) => t.id === topic.id)
    // 편집으로 지워진 질의의 상세 데이터 파일 정리
    if (prev?.analysisHistory) {
      const orphan = Object.entries(prev.analysisHistory)
        .filter(([q]) => !topic.analysisHistory?.[q])
        .flatMap(([, list]) => list.filter((h) => h.hasDetail).map((h) => h.id))
      if (orphan.length) void window.api.deleteAnalysisDetails(topic.id, orphan)
    }
    const exists = topics.some((t) => t.id === topic.id)
    persistTopics(exists ? topics.map((t) => (t.id === topic.id ? topic : t)) : [...topics, topic])
    setView(from === 'detail' ? { name: 'detail', topicId: topic.id } : { name: 'home' })
  }

  // 메모 입력 중 연속 저장에도 최신 목록을 쓰도록 함수형 갱신
  // 바뀐 항목만 기존 기록에 합쳐서 메모 저장과 별 클릭이 겹쳐도 서로 덮어쓰지 않음
  const updateMeta = (topicId: string, question: string, patch: Partial<QuestionMeta>) => {
    setTopics((prev) => {
      if (!prev) return prev
      const next = prev.map((t) =>
        t.id === topicId
          ? {
              ...t,
              questionMeta: {
                ...t.questionMeta,
                [question]: { ...EMPTY_QUESTION_META, ...t.questionMeta?.[question], ...patch },
              },
            }
          : t,
      )
      void window.api.saveTopics(next)
      return next
    })
  }

  /** 주제 하나를 바꿔 저장 */
  const updateTopic = (topicId: string, fn: (t: Topic) => Topic) => {
    setTopics((prev) => {
      if (!prev) return prev
      const next = prev.map((t) => (t.id === topicId ? fn(t) : t))
      void window.api.saveTopics(next)
      return next
    })
  }

  /**
   * 질의별 분석 점수 기록 추가.
   * 점수는 최근 ANALYSIS_HISTORY_MAX개, 상세 데이터(파일)는 최근 ANALYSIS_DETAIL_MAX개만 유지
   */
  const addAnalysis = (topicId: string, question: string, summary: AnalysisSummary) => {
    updateTopic(topicId, (t) => {
      const dropDetails: string[] = []
      const all = [...(t.analysisHistory?.[question] ?? []), summary]
      const kept = all.slice(-ANALYSIS_HISTORY_MAX)
      all.slice(0, all.length - kept.length).forEach((h) => h.hasDetail && dropDetails.push(h.id))
      const detailFrom = kept.length - ANALYSIS_DETAIL_MAX
      const list = kept.map((h, i) => {
        if (i < detailFrom && h.hasDetail) {
          dropDetails.push(h.id)
          return { ...h, hasDetail: false }
        }
        return h
      })
      // 점수만 남기는 오래된 기록의 상세 데이터 파일 삭제 (StrictMode를 쓰지 않아 한 번만 실행됨)
      if (dropDetails.length) void window.api.deleteAnalysisDetails(topicId, dropDetails)
      return { ...t, analysisHistory: { ...t.analysisHistory, [question]: list } }
    })
  }

  /** 저장한 녹음 파일을 분석 기록에 연결 */
  const linkRecording = (topicId: string, question: string, id: string, filePath: string, kind: 'audio' | 'video') =>
    updateTopic(topicId, (t) => ({
      ...t,
      analysisHistory: {
        ...t.analysisHistory,
        [question]: (t.analysisHistory?.[question] ?? []).map((h) =>
          h.id === id ? { ...h, recordingPath: filePath, recordingKind: kind } : h,
        ),
      },
    }))

  /** 세션 종합 기록 추가 (같은 id면 덮어씀) */
  const upsertSession = (topicId: string, summary: SessionSummary) =>
    updateTopic(topicId, (t) => {
      const list = t.sessionHistory ?? []
      const next = list.some((x) => x.id === summary.id)
        ? list.map((x) => (x.id === summary.id ? summary : x))
        : [...list, summary]
      return { ...t, sessionHistory: next.slice(-SESSION_HISTORY_MAX) }
    })

  const detailTopic = view.name === 'detail' ? findTopic(view.topicId) : undefined
  const practiceTopic = view.name === 'practice' ? findTopic(view.topicId) : undefined

  return (
    <>
      {view.name === 'home' && (
        <HomeScreen
          topics={topics}
          onCreate={() => setView({ name: 'edit', topic: null, from: 'home' })}
          onEdit={(topic) => setView({ name: 'edit', topic, from: 'home' })}
          onDelete={(topic) => {
            persistTopics(topics.filter((t) => t.id !== topic.id))
            void window.api.deleteAnalysisDetails(topic.id, null)
          }}
          onOpen={(topic) => setView({ name: 'detail', topicId: topic.id })}
          onStart={(topic) =>
            topic.questions.length > 0 && setView({ name: 'practice', topicId: topic.id, from: 'home' })
          }
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenFolder={() => window.api.openPath(settings.saveRoot)}
        />
      )}

      {view.name === 'detail' && detailTopic && (
        <TopicDetail
          topic={detailTopic}
          uiState={detailStates.current.get(detailTopic.id) ?? EMPTY_DETAIL_STATE}
          onUiStateChange={(state) => {
            detailStates.current.set(detailTopic.id, state)
            forceRender((n) => n + 1)
          }}
          onUpdateMeta={(question, patch) => updateMeta(detailTopic.id, question, patch)}
          onBack={() => setView({ name: 'home' })}
          onEdit={() => setView({ name: 'edit', topic: detailTopic, from: 'detail' })}
          onStart={(questions, order) =>
            setView({ name: 'practice', topicId: detailTopic.id, questions, order, from: 'detail' })
          }
        />
      )}

      {view.name === 'edit' && (
        <TopicEditor
          topic={view.topic}
          onSave={(topic) => saveTopic(topic, view.from)}
          onCancel={() =>
            setView(view.from === 'detail' && view.topic ? { name: 'detail', topicId: view.topic.id } : { name: 'home' })
          }
        />
      )}

      {view.name === 'practice' && practiceTopic && (
        <PracticeScreen
          topic={practiceTopic}
          questions={view.questions ?? practiceTopic.questions}
          order={view.order ?? practiceTopic.settings.order}
          settings={settings}
          onUpdateMeta={(question, patch) => updateMeta(practiceTopic.id, question, patch)}
          onAnalysis={(question, summary) => addAnalysis(practiceTopic.id, question, summary)}
          onRecordingLinked={(question, id, filePath, kind) =>
            linkRecording(practiceTopic.id, question, id, filePath, kind)
          }
          onSession={(summary) => upsertSession(practiceTopic.id, summary)}
          onExit={() =>
            setView(view.from === 'detail' ? { name: 'detail', topicId: practiceTopic.id } : { name: 'home' })
          }
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            setSettings(next)
            void window.api.saveSettings(next)
            setSettingsOpen(false)
          }}
        />
      )}
    </>
  )
}
