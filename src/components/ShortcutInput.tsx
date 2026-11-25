import { useState } from 'react'
import { eventToShortcut, formatShortcut } from '../lib/shortcuts'

interface Props {
  value: string
  onChange: (value: string) => void
}

/** 클릭 후 원하는 키 조합을 누르면 단축키로 등록되는 입력 */
export function ShortcutInput({ value, onChange }: Props) {
  const [capturing, setCapturing] = useState(false)

  return (
    <button
      type="button"
      className={`shortcut-input ${capturing ? 'capturing' : ''}`}
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      // Space·Enter를 단축키로 등록할 때 keyup에서 버튼 클릭이 다시 일어나 입력 대기로 돌아가는 것을 방지
      onKeyUp={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!capturing) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Escape') {
          setCapturing(false)
          return
        }
        const combo = eventToShortcut(e)
        if (!combo) return
        onChange(combo)
        setCapturing(false)
      }}
    >
      {capturing ? '키를 누르세요… (Esc 취소)' : formatShortcut(value)}
    </button>
  )
}
