import { useEffect, useState } from 'react'

export const PAGE_SIZE = 10

/** 목록을 페이지 단위로 나눔. 목록이 바뀌어 페이지가 넘치면 마지막 페이지로 */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / size))
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1)
  }, [page, pages])
  const current = Math.min(page, pages - 1)
  return { page: current, pages, setPage, items: items.slice(current * size, current * size + size) }
}

export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="pager">
      <button className="btn ghost" disabled={page === 0} onClick={() => onChange(page - 1)}>
        이전
      </button>
      <span>
        {page + 1} / {pages}
      </span>
      <button className="btn ghost" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
        다음
      </button>
    </div>
  )
}
