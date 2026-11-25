import { useEffect, useState } from 'react'
import type { AppSettings, Topic } from './types'
import { HomeScreen } from './screens/HomeScreen'
import { TopicEditor } from './screens/TopicEditor'
import { SettingsModal } from './screens/SettingsModal'
import { PracticeScreen } from './screens/PracticeScreen'

type View = { name: 'home' } | { name: 'edit'; topic: Topic | null } | { name: 'practice'; topic: Topic }

export function App() {
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [view, setView] = useState<View>({ name: 'home' })
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const saveTopic = (topic: Topic) => {
    const exists = topics.some((t) => t.id === topic.id)
    persistTopics(exists ? topics.map((t) => (t.id === topic.id ? topic : t)) : [...topics, topic])
    setView({ name: 'home' })
  }

  return (
    <>
      {view.name === 'home' && (
        <HomeScreen
          topics={topics}
          onCreate={() => setView({ name: 'edit', topic: null })}
          onEdit={(topic) => setView({ name: 'edit', topic })}
          onDelete={(topic) => persistTopics(topics.filter((t) => t.id !== topic.id))}
          onStart={(topic) => topic.questions.length > 0 && setView({ name: 'practice', topic })}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenFolder={() => window.api.openPath(settings.saveRoot)}
        />
      )}

      {view.name === 'edit' && (
        <TopicEditor topic={view.topic} onSave={saveTopic} onCancel={() => setView({ name: 'home' })} />
      )}

      {view.name === 'practice' && (
        <PracticeScreen topic={view.topic} settings={settings} onExit={() => setView({ name: 'home' })} />
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
