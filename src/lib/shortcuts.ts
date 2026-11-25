// 단축키 문자열 ↔ 키보드 이벤트 변환

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** 키보드 이벤트를 "Ctrl+Shift+Enter" 형태 문자열로 변환. 수정키만 눌렀으면 null */
type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

export function eventToShortcut(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Cmd')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(normalizeKey(e.key))
  return parts.join('+')
}

export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  return eventToShortcut(e) === shortcut
}

const DISPLAY: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Enter',
  Escape: 'Esc',
}

/** 화면 표시용 문자열 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((p) => DISPLAY[p] ?? p)
    .join(' + ')
}
