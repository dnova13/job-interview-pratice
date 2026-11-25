import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, Topic } from '../types'
import { Recorder, type RecordingResult } from '../lib/recorder'
import { formatShortcut, matchShortcut } from '../lib/shortcuts'
import { formatTime, shuffle } from '../lib/utils'
import { CloseIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RecordIcon } from '../components/Icons'

interface Props {
  topic: Topic
  settings: AppSettings
  onExit: () => void
}

type Phase = 'preparing' | 'error' | 'countdown' | 'recording' | 'paused' | 'review' | 'finished'

interface Review {
  url: string
  kind: 'audio' | 'video'
  durationMs: number
}

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'error'
}

function buildOrder(topic: Topic): number[] {
  const indices = topic.questions.map((_, i) => i)
  return topic.settings.order === 'random' ? shuffle(indices) : indices
}

export function PracticeScreen({ topic, settings, onExit }: Props) {
  const ts = topic.settings
  const [order, setOrder] = useState<number[]>(() => buildOrder(topic))
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<Phase>('preparing')
  const [countdown, setCountdown] = useState(ts.countdownSec)
  const [elapsed, setElapsed] = useState(0)
  const [review, setReview] = useState<Review | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [errorText, setErrorText] = useState('')
  const [busy, setBusy] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  const sessionDirRef = useRef<string | null>(null)
  const countdownTokenRef = useRef(0)
  const busyRef = useRef(false)
  const reviewUrlRef = useRef<string | null>(null)

  const question = topic.questions[order[pos]] ?? ''
  const total = order.length

  // ---------- 공통 유틸 ----------

  const showToast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now()
    setToast({ id, text, tone })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3000)
  }, [])

  const clearReview = useCallback(() => {
    if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current)
    reviewUrlRef.current = null
    setReview(null)
  }, [])

  const cancelCountdown = () => {
    countdownTokenRef.current += 1
  }

  // ---------- 녹음 ----------

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    try {
      const rec = new Recorder(stream, ts.saveFormat)
      rec.start()
      recorderRef.current = rec
      setElapsed(0)
      setPhase('recording')
    } catch (err) {
      setErrorText(`녹음을 시작할 수 없습니다: ${(err as Error).message}`)
      setPhase('error')
    }
  }, [ts.saveFormat])

  /** 대기 카운트를 띄운 뒤 녹음을 자동으로 시작 */
  const beginCountdown = useCallback(
    (nextPos: number) => {
      const token = ++countdownTokenRef.current
      setPos(nextPos)
      clearReview()
      const secs = Math.max(0, Math.round(ts.countdownSec))
      if (secs === 0) {
        setPhase('recording')
        startRecording()
        return
      }
      setCountdown(secs)
      setPhase('countdown')
      let left = secs
      const tick = () => {
        if (countdownTokenRef.current !== token) return
        left -= 1
        if (left <= 0) {
          startRecording()
        } else {
          setCountdown(left)
          window.setTimeout(tick, 1000)
        }
      }
      window.setTimeout(tick, 1000)
    },
    [clearReview, startRecording, ts.countdownSec],
  )

  /** 녹음을 끝내고, 조건에 맞으면 파일로 저장 */
  const finishRecording = useCallback(
    async (questionText: string): Promise<RecordingResult | null> => {
      const rec = recorderRef.current
      if (!rec) return null
      recorderRef.current = null
      const result = await rec.stop()

      if (!ts.saveEnabled) return result
      if (result.durationMs <= ts.minRecordSec * 1000) {
        showToast(`${ts.minRecordSec}초 이하로 녹음되어 저장하지 않았습니다.`, 'warn')
        return result
      }
      try {
        const saved = await window.api.saveRecording({
          saveRoot: settings.saveRoot,
          topicTitle: topic.title,
          sessionDir: sessionDirRef.current,
          question: questionText,
          ext: result.ext,
          data: await result.blob.arrayBuffer(),
        })
        sessionDirRef.current = saved.sessionDir
        setSavedCount((c) => c + 1)
        showToast(`저장됨: ${saved.fileName}`)
      } catch (err) {
        showToast(`저장 실패: ${(err as Error).message}`, 'error')
      }
      return result
    },
    [settings.saveRoot, showToast, topic.title, ts.minRecordSec, ts.saveEnabled],
  )

  /** 진행 중인 작업이 겹치지 않도록 한 번에 하나만 실행 */
  const runExclusive = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  // ---------- 버튼 동작 ----------

  /** 녹음 완료 → 다시 듣기 화면 */
  const complete = useCallback(
    () =>
      runExclusive(async () => {
        if (phase !== 'recording' && phase !== 'paused') return
        const result = await finishRecording(question)
        if (!result) return
        const url = URL.createObjectURL(result.blob)
        reviewUrlRef.current = url
        setReview({ url, kind: ts.saveFormat, durationMs: result.durationMs })
        setElapsed(result.durationMs)
        setPhase('review')
      }),
    [finishRecording, phase, question, runExclusive, ts.saveFormat],
  )

  /** 녹음 버튼: 녹음 중이면 완료, 다시 듣기 상태면 같은 질의 다시 녹음 */
  const onRecordButton = useCallback(() => {
    if (phase === 'recording' || phase === 'paused') {
      void complete()
    } else if (phase === 'review') {
      beginCountdown(pos)
    }
  }, [beginCountdown, complete, phase, pos])

  const togglePause = useCallback(() => {
    const rec = recorderRef.current
    if (!rec) return
    if (phase === 'recording') {
      rec.pause()
      setPhase('paused')
    } else if (phase === 'paused') {
      rec.resume()
      setPhase('recording')
    }
  }, [phase])

  /** 이전/다음: 녹음 중이면 저장 후 이동, 완료 상태면 바로 이동 */
  const move = useCallback(
    (delta: number) =>
      runExclusive(async () => {
        if (phase === 'preparing' || phase === 'error') return
        const target = phase === 'finished' ? total - 1 + (delta < 0 ? 0 : 1) : pos + delta
        if (target < 0) return
        cancelCountdown()
        if (phase === 'recording' || phase === 'paused') {
          await finishRecording(question)
        }
        if (target >= total) {
          clearReview()
          setPhase('finished')
          return
        }
        beginCountdown(target)
      }),
    [beginCountdown, clearReview, finishRecording, phase, pos, question, runExclusive, total],
  )

  const exit = useCallback(
    () =>
      runExclusive(async () => {
        cancelCountdown()
        if (phase === 'recording' || phase === 'paused') await finishRecording(question)
        onExit()
      }),
    [finishRecording, onExit, phase, question, runExclusive],
  )

  const restart = useCallback(() => {
    setOrder(buildOrder(topic))
    beginCountdown(0)
  }, [beginCountdown, topic])

  // ---------- 카메라 준비 ----------

  const setupStream = useCallback(async () => {
    setPhase('preparing')
    setErrorText('')
    try {
      const access = await window.api.ensureMediaAccess()
      if (!access.camera || !access.microphone) {
        throw new Error('시스템 설정 > 개인정보 보호 및 보안에서 카메라·마이크 권한을 허용해 주세요.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      return true
    } catch (err) {
      setErrorText((err as Error).message || '카메라·마이크를 사용할 수 없습니다.')
      setPhase('error')
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setupStream().then((ok) => {
      if (ok && !cancelled) beginCountdown(0)
    })
    return () => {
      cancelled = true
      countdownTokenRef.current += 1
      recorderRef.current?.stop()
      recorderRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current)
    }
    // 화면에 들어올 때 한 번만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 다시 듣기 화면에서 돌아올 때 카메라 미리보기 다시 연결
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  })

  // 녹음 시간 표시
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return
    const id = window.setInterval(() => {
      if (recorderRef.current) setElapsed(recorderRef.current.elapsedMs())
    }, 200)
    return () => window.clearInterval(id)
  }, [phase])

  // ---------- 단축키 ----------

  const handlers = useRef({ complete, move, togglePause })
  handlers.current = { complete, move, togglePause }

  useEffect(() => {
    const { shortcuts } = settings
    const all = [shortcuts.complete, shortcuts.pause, shortcuts.prev, shortcuts.next]
    const isShortcut = (e: KeyboardEvent) => all.some((s) => matchShortcut(e, s))

    const onKey = (e: KeyboardEvent) => {
      // 포커스된 버튼이 Space·Enter로 함께 눌리지 않도록 단축키는 기본 동작을 막음
      if (isShortcut(e)) e.preventDefault()
      if (e.repeat) return
      if (matchShortcut(e, shortcuts.complete)) {
        void handlers.current.complete()
      } else if (matchShortcut(e, shortcuts.pause)) {
        handlers.current.togglePause()
      } else if (matchShortcut(e, shortcuts.prev)) {
        e.preventDefault()
        void handlers.current.move(-1)
      } else if (matchShortcut(e, shortcuts.next)) {
        e.preventDefault()
        void handlers.current.move(1)
      }
    }
    // 버튼의 Space 클릭은 keyup에서 일어나므로 keyup도 막음
    const onKeyUp = (e: KeyboardEvent) => {
      if (isShortcut(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [settings])

  // ---------- 렌더링 ----------

  const isRecording = phase === 'recording' || phase === 'paused'
  const showRecordedVideo = phase === 'review' && review?.kind === 'video'
  const formatLabel = ts.saveFormat === 'video' ? '영상' : '음성'

  const statusBadge = useMemo(() => {
    if (phase === 'recording')
      return (
        <span className="badge rec">
          <span className="rec-dot" /> REC · {formatLabel}
        </span>
      )
    if (phase === 'paused') return <span className="badge paused">일시정지</span>
    if (phase === 'review') return <span className="badge review">녹음 완료 · 다시 듣기</span>
    return null
  }, [formatLabel, phase])

  return (
    <div className="practice">
      <header className="practice-header">
        <div className="practice-title">
          <strong>{topic.title}</strong>
          <span className="progress">
            {Math.min(pos + 1, total)} / {total}
          </span>
          {ts.saveEnabled ? (
            <span className="muted">저장 {savedCount}개</span>
          ) : (
            <span className="muted">파일 저장 안 함</span>
          )}
        </div>
        <button className="icon-btn" onClick={() => void exit()} title="연습 종료" disabled={busy}>
          <CloseIcon size={22} />
        </button>
      </header>

      <main className="stage">
        <div className={`camera ${phase === 'recording' ? 'is-recording' : ''}`}>
          <video ref={videoRef} className="live" autoPlay muted playsInline hidden={showRecordedVideo} />
          {showRecordedVideo && review && (
            <video key={review.url} className="playback" src={review.url} controls autoPlay />
          )}
          <div className="camera-top">
            {statusBadge}
            {(isRecording || phase === 'review') && <span className="timer">{formatTime(elapsed)}</span>}
          </div>
        </div>

        <section className="question-panel">
          <span className="question-label">Q{Math.min(pos + 1, total)}</span>
          <p className="question-text">{phase === 'finished' ? '모든 질의를 마쳤습니다.' : question}</p>
          {phase === 'review' && review?.kind === 'audio' && (
            <audio key={review.url} className="audio-player" src={review.url} controls autoPlay />
          )}
          {phase === 'review' && (
            <p className="hint">
              다시 들으며 문제점을 확인하세요. 녹음 버튼을 누르면 같은 질의로 다시 연습합니다.
            </p>
          )}
        </section>
      </main>

      <footer className="controls">
        <button className="ctrl" onClick={() => void move(-1)} disabled={busy || pos === 0 || phase === 'preparing'}>
          <PrevIcon size={26} />
          <span>이전</span>
        </button>

        <button
          className={`ctrl record ${isRecording ? 'active' : ''} ${phase === 'paused' ? 'paused' : ''}`}
          onClick={onRecordButton}
          disabled={busy || !(isRecording || phase === 'review')}
          title={isRecording ? `클릭하거나 ${formatShortcut(settings.shortcuts.complete)}로 녹음 완료` : '다시 녹음'}
        >
          <span className="record-icon">
            <RecordIcon size={30} />
          </span>
          <span>{isRecording ? '녹음 중' : '녹음'}</span>
        </button>

        <button
          className="ctrl"
          onClick={togglePause}
          disabled={busy || !isRecording}
          title={`${formatShortcut(settings.shortcuts.pause)}로 정지/재개`}
        >
          {phase === 'paused' ? <PlayIcon size={26} /> : <PauseIcon size={26} />}
          <span>{phase === 'paused' ? '재개' : '정지'}</span>
        </button>

        <button className="ctrl" onClick={() => void move(1)} disabled={busy || phase === 'preparing' || phase === 'finished'}>
          <NextIcon size={26} />
          <span>다음</span>
        </button>
      </footer>

      <div className="shortcut-help">
        완료 {formatShortcut(settings.shortcuts.complete)} · 정지/재개 {formatShortcut(settings.shortcuts.pause)} · 이전 {formatShortcut(settings.shortcuts.prev)} · 다음{' '}
        {formatShortcut(settings.shortcuts.next)}
      </div>

      {phase === 'countdown' && (
        <div className="countdown-overlay">
          <span className="countdown-label">
            Q{pos + 1} / {total}
          </span>
          <span key={countdown} className="countdown-number">
            {countdown}
          </span>
          <p className="countdown-question">{question}</p>
        </div>
      )}

      {phase === 'preparing' && (
        <div className="countdown-overlay">
          <p className="countdown-question">카메라와 마이크를 준비하고 있습니다…</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="countdown-overlay">
          <p className="countdown-question">{errorText}</p>
          <div className="overlay-actions">
            <button
              className="btn primary"
              onClick={async () => {
                if (await setupStream()) beginCountdown(pos)
              }}
            >
              다시 시도
            </button>
            <button className="btn ghost" onClick={onExit}>
              목록으로
            </button>
          </div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="countdown-overlay">
          <p className="countdown-question">모든 질의를 마쳤습니다 🎉</p>
          {ts.saveEnabled && <p className="muted">이번 세션에 저장된 파일 {savedCount}개</p>}
          <div className="overlay-actions">
            {sessionDirRef.current && (
              <button className="btn ghost" onClick={() => window.api.openPath(sessionDirRef.current!)}>
                저장 폴더 열기
              </button>
            )}
            <button className="btn ghost" onClick={() => void move(-1)}>
              마지막 질의로
            </button>
            <button className="btn ghost" onClick={restart}>
              처음부터 다시
            </button>
            <button className="btn primary" onClick={onExit}>
              목록으로
            </button>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
    </div>
  )
}
