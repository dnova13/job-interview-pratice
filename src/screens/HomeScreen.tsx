import type { Topic } from '../types'
import { FolderIcon, GearIcon, PlayIcon, PlusIcon } from '../components/Icons'

interface Props {
  topics: Topic[]
  onCreate: () => void
  onEdit: (topic: Topic) => void
  onDelete: (topic: Topic) => void
  onStart: (topic: Topic) => void
  onOpenSettings: () => void
  onOpenFolder: () => void
}

export function HomeScreen({ topics, onCreate, onEdit, onDelete, onStart, onOpenSettings, onOpenFolder }: Props) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>면접 연습</h1>
        <div className="header-actions">
          <button className="btn ghost" onClick={onOpenFolder} title="저장 폴더 열기">
            <FolderIcon size={18} /> 저장 폴더
          </button>
          <button className="btn ghost" onClick={onOpenSettings} title="공통 설정">
            <GearIcon size={18} /> 설정
          </button>
        </div>
      </header>

      {topics.length === 0 ? (
        <div className="empty">
          <p className="empty-title">아직 면접 주제가 없습니다</p>
          <p className="empty-desc">+ 버튼을 눌러 첫 면접 주제와 질의를 추가하세요.</p>
          <button className="add-big" onClick={onCreate} aria-label="주제 추가">
            <PlusIcon size={40} />
          </button>
        </div>
      ) : (
        <div className="topic-grid">
          {topics.map((t) => (
            <article key={t.id} className="topic-card">
              <div className="topic-card-body" onClick={() => onStart(t)} role="button" tabIndex={0}>
                <h2>{t.title}</h2>
                {t.description && <p className="topic-desc">{t.description}</p>}
                <div className="topic-meta">
                  <span>질의 {t.questions.length}개</span>
                  <span>{t.settings.order === 'random' ? '무작위' : '순서대로'}</span>
                  <span>{t.settings.saveEnabled ? (t.settings.saveFormat === 'video' ? '영상 저장' : '음성 저장') : '저장 안 함'}</span>
                </div>
              </div>
              <div className="topic-card-actions">
                <button className="btn primary" onClick={() => onStart(t)} disabled={t.questions.length === 0}>
                  <PlayIcon size={16} /> 시작
                </button>
                <button className="btn ghost" onClick={() => onEdit(t)}>
                  편집·설정
                </button>
                <button
                  className="btn ghost danger"
                  onClick={() => {
                    if (confirm(`"${t.title}" 주제를 삭제할까요?\n(저장된 녹음 파일은 삭제되지 않습니다)`)) onDelete(t)
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
          <button className="topic-card add-card" onClick={onCreate} aria-label="주제 추가">
            <PlusIcon size={36} />
            <span>주제 추가</span>
          </button>
        </div>
      )}
    </div>
  )
}
