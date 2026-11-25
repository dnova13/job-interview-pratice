import { useMemo, useState } from 'react'
import type { Topic, TopicSettings } from '../types'
import { DEFAULT_TOPIC_SETTINGS } from '../types'
import { newId, parseQuestions } from '../lib/utils'

interface Props {
  topic: Topic | null
  onSave: (topic: Topic) => void
  onCancel: () => void
}

/** 주제 생성·편집 + 주제별 개별 설정 */
export function TopicEditor({ topic, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(topic?.title ?? '')
  const [description, setDescription] = useState(topic?.description ?? '')
  const [questionText, setQuestionText] = useState(topic?.questions.join('\n') ?? '')
  const [settings, setSettings] = useState<TopicSettings>({ ...DEFAULT_TOPIC_SETTINGS, ...topic?.settings })

  const questions = useMemo(() => parseQuestions(questionText), [questionText])
  const canSave = title.trim().length > 0 && questions.length > 0

  const set = <K extends keyof TopicSettings>(key: K, value: TopicSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  const handleSave = () => {
    if (!canSave) return
    const now = Date.now()
    onSave({
      id: topic?.id ?? newId(),
      title: title.trim(),
      description: description.trim(),
      questions,
      settings: {
        ...settings,
        countdownSec: Math.max(0, Math.round(settings.countdownSec)),
        minRecordSec: Math.max(0, settings.minRecordSec),
      },
      createdAt: topic?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{topic ? '주제 편집' : '새 면접 주제'}</h1>
        <div className="header-actions">
          <button className="btn ghost" onClick={onCancel}>
            취소
          </button>
          <button className="btn primary" onClick={handleSave} disabled={!canSave}>
            저장
          </button>
        </div>
      </header>

      <div className="editor">
        <section className="editor-main">
          <label className="field">
            <span className="field-label">제목</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 프론트엔드 기술 면접" autoFocus />
          </label>

          <label className="field">
            <span className="field-label">설명</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 주제에 대한 설명 (선택)"
            />
          </label>

          <label className="field grow">
            <span className="field-label">
              질의 목록 <em>한 줄에 질의 하나 · 붙여넣기 가능 · 빈 줄은 무시</em>
            </span>
            <textarea
              className="questions-input"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={'자기소개를 해주세요.\n우리 회사에 지원한 이유는 무엇인가요?\n가장 어려웠던 프로젝트 경험을 말해주세요.'}
            />
            <span className="field-hint">질의 {questions.length}개</span>
          </label>
        </section>

        <aside className="editor-side">
          <h3>개별 설정</h3>

          <div className="field">
            <span className="field-label">출제 순서</span>
            <div className="segmented">
              <button className={settings.order === 'random' ? 'on' : ''} onClick={() => set('order', 'random')}>
                무작위
              </button>
              <button className={settings.order === 'sequential' ? 'on' : ''} onClick={() => set('order', 'sequential')}>
                순서대로
              </button>
            </div>
          </div>

          <label className="field">
            <span className="field-label">대기 카운트 (초)</span>
            <input
              type="number"
              min={0}
              max={60}
              value={settings.countdownSec}
              onChange={(e) => set('countdownSec', Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span className="field-label">최소 녹음 시간 (초)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={settings.minRecordSec}
              onChange={(e) => set('minRecordSec', Number(e.target.value))}
            />
            <span className="field-hint">이 시간 이하로 녹음되면 파일로 저장하지 않습니다.</span>
          </label>

          <div className="field">
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={settings.saveEnabled}
                onChange={(e) => set('saveEnabled', e.target.checked)}
              />
              <span>녹음 완료 시 자동 저장</span>
            </label>
            <span className="field-hint">
              {settings.saveEnabled
                ? '녹음을 완료하거나 이전·다음으로 넘어가면 자동으로 파일을 저장합니다.'
                : '자동으로 저장하지 않습니다. 녹음 완료 후 다시 듣기 화면의 저장 버튼으로 원하는 녹음만 저장합니다.'}
            </span>
          </div>

          {/* 저장 형식은 수동 저장에도 쓰이므로 자동 저장 여부와 관계없이 선택 가능 */}
          <div className="field">
            <span className="field-label">녹음 형식</span>
            <div className="segmented">
              <button
                className={settings.saveFormat === 'audio' ? 'on' : ''}
                onClick={() => set('saveFormat', 'audio')}
              >
                음성 (.m4a)
              </button>
              <button
                className={settings.saveFormat === 'video' ? 'on' : ''}
                onClick={() => set('saveFormat', 'video')}
              >
                영상 (.mp4)
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
