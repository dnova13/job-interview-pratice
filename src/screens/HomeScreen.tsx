import type { Topic } from '../types'
import { FlagIcon, FolderIcon, GearIcon, ListIcon, PlayIcon, PlusIcon } from '../components/Icons'

interface Props {
  topics: Topic[]
  onCreate: () => void
  onEdit: (topic: Topic) => void
  onDelete: (topic: Topic) => void
  onStart: (topic: Topic) => void
  /** 질의 목록 화면 열기 */
  onOpen: (topic: Topic) => void
  onOpenSettings: () => void
  onOpenFolder: () => void
}

const hardCount = (t: Topic) => t.questions.filter((q) => t.questionMeta?.[q]?.hard).length

export function HomeScreen({ topics, onCreate, onEdit, onDelete, onStart, onOpen, onOpenSettings, onOpenFolder }: Props) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>면접 연습</h1>
        <div className="header-actions">
          <button className="btn primary" onClick={onCreate} title="새 면접 주제 추가">
            <PlusIcon size={18} /> 주제 추가
          </button>
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
              <div className="topic-card-body" onClick={() => onOpen(t)} role="button" tabIndex={0} title="질의 목록 보기">
                <h2>{t.title}</h2>
                {t.description && <p className="topic-desc">{t.description}</p>}
                <div className="topic-meta">
                  <span>질의 {t.questions.length}개</span>
                  <span>{t.settings.order === 'random' ? '무작위' : '순서대로'}</span>
                  <span>{t.settings.saveFormat === 'video' ? '영상' : '음성'}</span>
                  <span>{t.settings.saveEnabled ? '자동 저장' : '수동 저장'}</span>
                  {hardCount(t) > 0 && (
                    <span className="meta-hard">
                      <FlagIcon size={12} filled /> 안 외워짐 {hardCount(t)}
                    </span>
                  )}
                </div>
              </div>
              <div className="topic-card-actions">
                <button className="btn primary" onClick={() => onStart(t)} disabled={t.questions.length === 0}>
                  <PlayIcon size={16} /> 전체 시작
                </button>
                <button className="btn ghost" onClick={() => onOpen(t)}>
                  <ListIcon size={16} /> 질의 목록
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
          {/* 주제 추가는 상단 헤더 버튼으로 대체 (목록 끝 추가 카드는 사용 안 함)
          <button className="topic-card add-card" onClick={onCreate} aria-label="주제 추가">
            <PlusIcon size={36} />
            <span>주제 추가</span>
          </button>
          */}
        </div>
      )}
    </div>
  )
}
