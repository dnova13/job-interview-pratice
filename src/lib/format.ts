// 날짜·시간 표시

const pad = (n: number) => String(n).padStart(2, '0')

/** 26.11.28 14:05 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getFullYear() % 100)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 1분 05초 / 42초 */
export function formatDuration(sec: number): string {
  const s = Math.round(sec)
  return s >= 60 ? `${Math.floor(s / 60)}분 ${pad(s % 60)}초` : `${s}초`
}
