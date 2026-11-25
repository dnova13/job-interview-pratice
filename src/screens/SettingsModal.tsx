import { useState } from 'react'
import type { AppSettings } from '../types'
import { DEFAULT_SHORTCUTS } from '../types'
import { ShortcutInput } from '../components/ShortcutInput'
import { CloseIcon } from '../components/Icons'

interface Props {
  settings: AppSettings
  onSave: (settings: AppSettings) => void
  onClose: () => void
}

/** 공통 설정: 저장 폴더, 단축키 */
export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings)

  const setShortcut = (key: keyof AppSettings['shortcuts'], value: string) =>
    setDraft((d) => ({ ...d, shortcuts: { ...d.shortcuts, [key]: value } }))

  const values = Object.values(draft.shortcuts)
  const hasDuplicate = new Set(values).size !== values.length

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>공통 설정</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="field">
          <span className="field-label">녹음 파일 저장 폴더</span>
          <div className="path-row">
            <code className="path">{draft.saveRoot}</code>
            <button
              className="btn ghost"
              onClick={async () => {
                const picked = await window.api.pickFolder(draft.saveRoot)
                if (picked) setDraft((d) => ({ ...d, saveRoot: picked }))
              }}
            >
              변경
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">단축키</span>
          <div className="shortcut-table">
            <span>녹음 완료 / 다시 녹음</span>
            <ShortcutInput value={draft.shortcuts.complete} onChange={(v) => setShortcut('complete', v)} />
            <span>정지 / 재개</span>
            <ShortcutInput value={draft.shortcuts.pause} onChange={(v) => setShortcut('pause', v)} />
            <span>이전 질의</span>
            <ShortcutInput value={draft.shortcuts.prev} onChange={(v) => setShortcut('prev', v)} />
            <span>다음 질의</span>
            <ShortcutInput value={draft.shortcuts.next} onChange={(v) => setShortcut('next', v)} />
            <span>영상/음성 뒤로 이동</span>
            <ShortcutInput value={draft.shortcuts.seekBack} onChange={(v) => setShortcut('seekBack', v)} />
            <span>영상/음성 앞으로 이동</span>
            <ShortcutInput value={draft.shortcuts.seekForward} onChange={(v) => setShortcut('seekForward', v)} />
          </div>
          {hasDuplicate && <span className="field-error">같은 단축키가 중복되어 있습니다.</span>}
          <button
            className="btn link"
            onClick={() => setDraft((d) => ({ ...d, shortcuts: { ...DEFAULT_SHORTCUTS } }))}
          >
            단축키 기본값으로
          </button>
        </div>

        <label className="field">
          <span className="field-label">영상/음성 이동 간격 (초)</span>
          <input
            type="number"
            min={0.5}
            max={60}
            step={0.5}
            value={draft.seekStepSec}
            onChange={(e) => setDraft((d) => ({ ...d, seekStepSec: Number(e.target.value) }))}
          />
          <span className="field-hint">녹음 완료 후 다시 들을 때 영상/음성 뒤로·앞으로 이동 단축키로 움직이는 시간입니다.</span>
        </label>

        <footer className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={hasDuplicate || !(draft.seekStepSec > 0)}
            onClick={() => onSave(draft)}
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  )
}
