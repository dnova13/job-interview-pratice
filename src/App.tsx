import { useEffect, useRef, useState } from 'react'
import type { AppSettings, QuestionMeta, QuestionOrder, Topic } from './types'
import { EMPTY_QUESTION_META } from './types'
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
    })
  }, [])

  if (!topics || !settings) return <div className="loading">불러오는 중…</div>

  const persistTopics = (next: Topic[]) => {
    setTopics(next)
    void window.api.saveTopics(next)
  }

  const findTopic = (id: string) => topics.find((t) => t.id === id)

  const saveTopic = (topic: Topic, from: 'home' | 'detail') => {
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

  const detailTopic = view.name === 'detail' ? findTopic(view.topicId) : undefined
  const practiceTopic = view.name === 'practice' ? findTopic(view.topicId) : undefined

  return (
    <>
      {view.name === 'home' && (
        <HomeScreen
          topics={topics}
          onCreate={() => setView({ name: 'edit', topic: null, from: 'home' })}
          onEdit={(topic) => setView({ name: 'edit', topic, from: 'home' })}
          onDelete={(topic) => persistTopics(topics.filter((t) => t.id !== topic.id))}
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
