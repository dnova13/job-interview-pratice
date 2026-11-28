import { useEffect, useRef, useState } from 'react'
import type { Topic } from '../types'
import type { AnalysisRecord, AnalysisSummary } from '../lib/analysis/types'
import { CATEGORY_LABELS } from '../lib/analysis/scoring'
import { formatDateTime, formatDuration } from '../lib/format'
import { AnalysisReport } from './AnalysisReport'
import { GazeOverlay } from './GazeOverlay'
import { CloseIcon } from './Icons'

interface Props {
  topic: Topic
  question: string
  summary: AnalysisSummary
  onClose: () => void
}

type Media = { url: string; kind: 'audio' | 'video' } | 'missing' | null

/**
 * 기록 한 건의 상세 보기.
 * 녹음 파일이 있으면 재생기와 타임라인을, 없으면 기록(점수·그림)만 보여 줌
 */
export function RecordDetail({ topic, question, summary, onClose }: Props) {
  const [record, setRecord] = useState<AnalysisRecord | null | 'loading'>('loading')
  const [media, setMedia] = useState<Media>(null)
  const playerRef = useRef<HTMLMediaElement | null>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)

  useEffect(() => {
    let alive = true
    let url: string | null = null
    void (async () => {
      // 상세 데이터와 녹음 파일을 함께 읽은 뒤 표시 (타임라인 표시 여부가 녹음 파일에 달려 있음)
      const [detail, data] = await Promise.all([
        summary.hasDetail ? window.api.loadAnalysisDetail(topic.id, summary.id) : Promise.resolve(null),
        summary.recordingPath ? window.api.readRecording(summary.recordingPath) : Promise.resolve(null),
      ])
      if (!alive) return
      if (summary.recordingPath) {
        if (data) {
          const kind = summary.recordingKind ?? (/\.m4a$/i.test(summary.recordingPath) ? 'audio' : 'video')
          url = URL.createObjectURL(new Blob([data as BlobPart], { type: kind === 'video' ? 'video/mp4' : 'audio/mp4' }))
          setMedia({ url, kind })
        } else setMedia('missing')
      }
      setRecord(detail)
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [summary, topic.id])

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 같은 질의의 바로 앞 기록 점수
  const history = topic.analysisHistory?.[question] ?? []
  const idx = history.findIndex((h) => h.id === summary.id)
  const previousOverall =
    idx > 0
      ? ([...history.slice(0, idx)].reverse().find((h) => h.overall !== null)?.overall ?? null)
      : null
  const hasMedia = media !== null && media !== 'missing'

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal record-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>{question}</h2>
            <p className="muted record-meta">
              {formatDateTime(summary.at)} · 답변 {formatDuration(summary.durationSec)}
              {summary.recordingPath ? ` · ${summary.recordingKind === 'audio' ? '음성' : '영상'} 저장됨` : ' · 녹음 파일 없음'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <CloseIcon size={20} />
          </button>
        </header>

        <div className={`record-body ${hasMedia ? 'with-media' : ''}`}>
          {hasMedia && (
            <div className="record-media">
              {media.kind === 'video' ? (
                <div className="record-video">
                  <video
                    ref={(el) => {
                      playerRef.current = el
                      setVideo(el)
                    }}
                    src={media.url}
                    controls
                  />
                  {record && record !== 'loading' && record.face.length > 0 && (
                    <GazeOverlay video={video} fit="contain" mirrored={false} samples={record.face} />
                  )}
                </div>
              ) : (
                <audio ref={(el) => void (playerRef.current = el)} src={media.url} controls />
              )}
            </div>
          )}

          <div className="record-report">
            {media === 'missing' && (
              <p className="field-hint">녹음 파일을 찾을 수 없어 기록만 표시합니다. (파일을 옮겼거나 지웠을 수 있습니다)</p>
            )}
            {record === 'loading' ? (
              <p className="muted">불러오는 중…</p>
            ) : record ? (
              <AnalysisReport
                record={record}
                previousOverall={previousOverall}
                durationMs={summary.durationSec * 1000}
                showTimeline={hasMedia}
                timelineOpen={hasMedia}
                onSeek={(sec) => {
                  const el = playerRef.current
                  if (!el) return
                  el.currentTime = sec
                  void el.play()
                }}
                getTime={() => (playerRef.current ? playerRef.current.currentTime : null)}
              />
            ) : (
              // 상세 데이터가 없는 오래된 기록: 점수만
              <div className="analysis">
                <header className="analysis-head">
                  <span className="analysis-score">
                    {summary.overall ?? '–'}
                    <small> / 100</small>
                  </span>
                  <span className="analysis-tag">참고용</span>
                </header>
                <p className="muted">
                  {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[])
                    .map((k) => `${CATEGORY_LABELS[k]} ${summary.scores[k] ?? '–'}`)
                    .join(' · ')}
                </p>
                <p className="field-hint">오래된 기록이라 상세 데이터(그림·타임라인)는 남아 있지 않습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
