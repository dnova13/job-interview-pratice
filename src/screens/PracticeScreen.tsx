import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, QuestionMeta, QuestionOrder, Topic } from '../types'
import { EMPTY_QUESTION_META } from '../types'
import { MemoField, StarRating } from './TopicDetail'
import { FaceTracker } from '../lib/analysis/face'
import { AudioAnalyzer } from '../lib/analysis/audio'
import { computeMetrics, countSwings, METRIC_PARAMS } from '../lib/analysis/metrics'
import { compactRecord, scoreMetrics, summarizeSession, toSummary } from '../lib/analysis/scoring'
import { newId } from '../lib/utils'
import { SessionReport } from '../components/SessionReport'
import {
  DEFAULT_BASELINE,
  type AnalysisRecord,
  type AnalysisResult,
  type AnalysisSummary,
  type Baseline,
  type FaceSample,
  type SessionSummary,
} from '../lib/analysis/types'
import { GazeOverlay } from '../components/GazeOverlay'
import { AnalysisReport } from '../components/AnalysisReport'
import { Recorder, type RecordingResult } from '../lib/recorder'
import { formatShortcut, matchShortcut } from '../lib/shortcuts'
import { formatTime, shuffle } from '../lib/utils'
import {
  CheckIcon,
  CloseIcon,
  MemoIcon,
  FlagIcon,
  ListIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RecordIcon,
  RestartIcon,
  SaveIcon,
} from '../components/Icons'

interface Props {
  topic: Topic
  /** 이번 연습에 쓸 질의 (전체 또는 목록에서 선택한 것) */
  questions: string[]
  order: QuestionOrder
  settings: AppSettings
  /** 질의 목록 패널에서 중요도·안 외워짐 표시를 바꿀 때 */
  onUpdateMeta: (question: string, patch: Partial<QuestionMeta>) => void
  /** 답변 분석 점수를 질의별 기록에 남길 때 */
  onAnalysis: (question: string, summary: AnalysisSummary) => void
  /** 분석 기록과 저장한 녹음 파일 연결 */
  onRecordingLinked: (question: string, recordId: string, filePath: string, kind: 'audio' | 'video') => void
  /** 세션 종합 기록 남기기 (같은 id면 덮어씀) */
  onSession: (summary: SessionSummary) => void
  onExit: () => void
}

type Phase = 'preparing' | 'error' | 'countdown' | 'recording' | 'paused' | 'review' | 'finished'

interface Review {
  url: string
  kind: 'audio' | 'video'
  durationMs: number
  blob: Blob
  ext: string
  question: string
  /** 저장된 파일 이름 (아직 저장 안 했으면 null) */
  savedName: string | null
  /** 답변 분석 결과 (분석을 끄거나 실패하면 null) */
  analysis: AnalysisRecord | null
  /** 분석 기록 id (녹음 파일을 저장하면 이 기록에 연결) */
  analysisId: string | null
  /** 같은 질의의 지난번 종합 점수 */
  previousOverall: number | null
}

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'error'
}

function buildOrder(count: number, order: QuestionOrder): number[] {
  const indices = Array.from({ length: count }, (_, i) => i)
  return order === 'random' ? shuffle(indices) : indices
}

export function PracticeScreen({
  topic,
  questions,
  order: orderMode,
  settings,
  onUpdateMeta,
  onAnalysis,
  onRecordingLinked,
  onSession,
  onExit,
}: Props) {
  const analysisOn = settings.analysis.enabled
  const ts = topic.settings
  const [order, setOrder] = useState<number[]>(() => buildOrder(questions.length, orderMode))
  const [listOpen, setListOpen] = useState(false)
  /** 다시 듣기 화면에서 메모 편집 중인지 */
  const [memoEditing, setMemoEditing] = useState(false)
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
  /** 다시 듣기 플레이어 (영상이면 video, 음성이면 audio) */
  const playbackRef = useRef<HTMLMediaElement | null>(null)
  // ---------- 답변 분석 ----------
  const faceRef = useRef<FaceTracker | null>(null)
  const audioRef = useRef<AudioAnalyzer | null>(null)
  const baselineRef = useRef<Baseline>({ ...DEFAULT_BASELINE })
  // ---------- 세션 종합 기록 ----------
  const sessionIdRef = useRef(newId())
  const sessionStartRef = useRef(Date.now())
  /** 이번 세션에서 점수가 나온 답변 (질의, 요약, 결과) */
  const sessionEntriesRef = useRef<{ question: string; summary: AnalysisSummary; result: AnalysisResult }[]>([])
  /** 마지막 질의까지 마쳤는지 */
  const sessionCompletedRef = useRef(false)
  const [sessionReport, setSessionReport] = useState<SessionSummary | null>(null)
  /** 실시간 표시: 정면 여부와 끄덕임 횟수 */
  const [liveGaze, setLiveGaze] = useState<'front' | 'away' | 'none' | null>(null)
  const [liveNods, setLiveNods] = useState(0)
  /** 기준 확인용: 현재 고개 각도와 초당 측정 횟수 */
  const [liveAngles, setLiveAngles] = useState<{ pitch: number; yaw: number; roll: number; fps: number } | null>(null)
  const debugOn = settings.analysis.debugOverlay
  const debugRef = useRef(debugOn)
  debugRef.current = debugOn
  /** 녹화본 재생 위에 시선 점을 그리기 위한 재생 video 요소 */
  const [playbackVideo, setPlaybackVideo] = useState<HTMLVideoElement | null>(null)

  const question = questions[order[pos]] ?? ''
  const questionMeta: QuestionMeta = { ...EMPTY_QUESTION_META, ...topic.questionMeta?.[question] }
  const total = order.length

  // ---------- 공통 유틸 ----------

  const showToast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now()
    setToast({ id, text, tone })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3000)
  }, [])

  const clearReview = useCallback(() => {
    setMemoEditing(false)
    // 다른 질의로 넘어가면 다시 듣던 녹음은 멈춤
    playbackRef.current?.pause()
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
      // 카운트다운 동안 잰 기준값(배경 소음, 렌즈를 보는 자세)을 확정하고 기록을 새로 시작
      const noise = audioRef.current?.finishCalibration() ?? null
      const gaze = faceRef.current?.finishCalibration() ?? null
      const prev = baselineRef.current
      baselineRef.current = {
        noiseDb: noise ?? prev.noiseDb,
        gazeX: gaze?.gazeX ?? prev.gazeX,
        gazeY: gaze?.gazeY ?? prev.gazeY,
        measured: prev.measured || gaze !== null,
      }
      if (faceRef.current) faceRef.current.baseline = baselineRef.current
      faceRef.current?.reset()
      audioRef.current?.reset()
      setLiveNods(0)
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
      faceRef.current?.startCalibration()
      audioRef.current?.startCalibration()
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

  /** 녹음 데이터를 파일로 저장. 성공하면 파일 이름·경로, 실패하면 null */
  const saveBlob = useCallback(
    async (blob: Blob, ext: string, questionText: string): Promise<{ fileName: string; filePath: string } | null> => {
      try {
        const saved = await window.api.saveRecording({
          saveRoot: settings.saveRoot,
          topicTitle: topic.title,
          sessionDir: sessionDirRef.current,
          question: questionText,
          ext,
          data: await blob.arrayBuffer(),
        })
        sessionDirRef.current = saved.sessionDir
        setSavedCount((c) => c + 1)
        return { fileName: saved.fileName, filePath: saved.filePath }
      } catch (err) {
        showToast(`저장 실패: ${(err as Error).message}`, 'error')
        return null
      }
    },
    [settings.saveRoot, showToast, topic.title],
  )

  /** 녹음이 끝난 답변 분석. 점수가 나오면 질의별 기록에 남김 */
  const analyze = useCallback(
    (questionText: string, durationMs: number): { record: AnalysisRecord; id: string } | null => {
      const face = faceRef.current
      const audio = audioRef.current
      if (!analysisOn || (!face && !audio)) return null
      try {
        const faceSamples = face ? face.samples.slice() : []
        const audioSamples = audio ? audio.samples.slice() : []
        const baseline = { ...baselineRef.current }
        const result = scoreMetrics(
          computeMetrics(audioSamples, faceSamples, baseline, durationMs),
          ts.minRecordSec,
        )
        const record: AnalysisRecord = { audio: audioSamples, face: faceSamples, baseline, result }
        const id = newId()
        if (result.overall !== null) {
          // 상세 데이터(타임라인·그림용)는 별도 파일로 저장하고, 점수 요약은 질의별 기록에 남김
          void window.api.saveAnalysisDetail(topic.id, id, compactRecord(record)).catch(() => {})
          const summary = { ...toSummary(result, id), sessionId: sessionIdRef.current, hasDetail: true }
          sessionEntriesRef.current.push({ question: questionText, summary, result })
          onAnalysis(questionText, summary)
        }
        return { record, id }
      } catch (err) {
        console.warn('답변 분석 실패', err)
        return null
      }
    },
    [analysisOn, onAnalysis, topic.id, ts.minRecordSec],
  )

  /** 저장한 녹음 파일을 분석 기록에 연결 (점수가 나온 기록만) */
  const linkRecording = useCallback(
    (questionText: string, analysisId: string | null, filePath: string) => {
      if (!analysisId) return
      const entry = sessionEntriesRef.current.find((e) => e.summary.id === analysisId)
      if (!entry) return
      entry.summary = { ...entry.summary, recordingPath: filePath, recordingKind: ts.saveFormat }
      onRecordingLinked(questionText, analysisId, filePath, ts.saveFormat)
    },
    [onRecordingLinked, ts.saveFormat],
  )

  /** 세션 종합 기록 남기기. 점수가 나온 답변이 하나도 없으면 남기지 않음 */
  const recordSession = useCallback(() => {
    const entries = sessionEntriesRef.current
    if (entries.length === 0) return null
    const summary = summarizeSession(
      entries.map((e) => e.result),
      {
        id: sessionIdRef.current,
        startedAt: sessionStartRef.current,
        completed: sessionCompletedRef.current,
        total: questions.length,
        order: orderMode,
      },
    )
    onSession(summary)
    return summary
  }, [onSession, orderMode, questions.length])

  /** 녹음을 끝내고, 자동 저장이면 조건에 맞을 때 파일로 저장 */
  const finishRecording = useCallback(
    async (
      questionText: string,
    ): Promise<{
      result: RecordingResult
      savedName: string | null
      analysis: AnalysisRecord | null
      analysisId: string | null
    } | null> => {
      const rec = recorderRef.current
      if (!rec) return null
      recorderRef.current = null
      const result = await rec.stop()
      const analyzed = analyze(questionText, result.durationMs)
      const analysis = analyzed?.record ?? null
      const analysisId = analyzed?.id ?? null

      // 수동 저장 모드: 저장하지 않고 다시 듣기 화면의 저장 버튼으로 저장
      if (!ts.saveEnabled) return { result, savedName: null, analysis, analysisId }
      if (result.durationMs <= ts.minRecordSec * 1000) {
        showToast(`${ts.minRecordSec}초 이하로 녹음되어 저장하지 않았습니다.`, 'warn')
        return { result, savedName: null, analysis, analysisId }
      }
      const saved = await saveBlob(result.blob, result.ext, questionText)
      if (saved) {
        showToast(`저장됨: ${saved.fileName}`)
        linkRecording(questionText, analysisId, saved.filePath)
      }
      return { result, savedName: saved?.fileName ?? null, analysis, analysisId }
    },
    [analyze, linkRecording, saveBlob, showToast, ts.minRecordSec, ts.saveEnabled],
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
        // 지난번 점수는 이번 기록이 더해지기 전 값
        const history = topic.analysisHistory?.[question] ?? []
        const previousOverall = [...history].reverse().find((h) => h.overall !== null)?.overall ?? null
        const finished = await finishRecording(question)
        if (!finished) return
        const { result, savedName, analysis, analysisId } = finished
        const url = URL.createObjectURL(result.blob)
        reviewUrlRef.current = url
        setReview({
          url,
          kind: ts.saveFormat,
          durationMs: result.durationMs,
          blob: result.blob,
          ext: result.ext,
          question,
          savedName,
          analysis,
          analysisId,
          previousOverall,
        })
        setElapsed(result.durationMs)
        setPhase('review')
      }),
    [finishRecording, phase, question, runExclusive, topic.analysisHistory, ts.saveFormat],
  )

  /** 수동 저장 모드: 다시 듣기 중인 녹음을 저장 (이미 저장했으면 알림만) */
  const saveReview = useCallback(
    () =>
      runExclusive(async () => {
        if (phase !== 'review' || !review) return
        if (review.savedName) {
          showToast(`이미 저장되었습니다: ${review.savedName}`, 'warn')
          return
        }
        // 자동 저장과 같은 최소 녹화/녹음 시간 기준 적용
        if (review.durationMs <= ts.minRecordSec * 1000) {
          showToast(`${ts.minRecordSec}초 이하로 녹음되어 저장할 수 없습니다.`, 'warn')
          return
        }
        const saved = await saveBlob(review.blob, review.ext, review.question)
        if (!saved) return
        const savedName = saved.fileName
        setReview((r) => (r && r.url === review.url ? { ...r, savedName } : r))
        linkRecording(review.question, review.analysisId, saved.filePath)
        showToast(`저장되었습니다: ${savedName}`)
      }),
    [linkRecording, phase, review, runExclusive, saveBlob, showToast, ts.minRecordSec],
  )

  /** 녹음 버튼: 녹음 중이면 완료, 다시 듣기 상태면 같은 질의 다시 녹음 */
  const onRecordButton = useCallback(() => {
    if (phase === 'recording' || phase === 'paused') {
      void complete()
    } else if (phase === 'review') {
      // 저장 중에는 다시 녹음하지 않음
      if (busyRef.current) return
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

  /** 지정한 질의로 이동: 녹음 중이면 저장 후 이동, 완료 상태면 바로 이동. total이면 종료 화면 */
  const goTo = useCallback(
    (target: number) =>
      runExclusive(async () => {
        if (phase === 'preparing' || phase === 'error') return
        if (target < 0) return
        cancelCountdown()
        if (phase === 'recording' || phase === 'paused') {
          await finishRecording(question)
        }
        if (target >= total) {
          clearReview()
          // 마지막 질의까지 마침: 종합 기록을 남기고 결과 보고서 표시
          sessionCompletedRef.current = true
          setSessionReport(recordSession())
          setPhase('finished')
          return
        }
        beginCountdown(target)
      }),
    [beginCountdown, clearReview, finishRecording, phase, question, recordSession, runExclusive, total],
  )

  /** 이전/다음 */
  const move = useCallback(
    (delta: number) => goTo(phase === 'finished' ? total - 1 + (delta < 0 ? 0 : 1) : pos + delta),
    [goTo, phase, pos, total],
  )

  /** 질의 목록에서 항목 선택 */
  const jumpTo = useCallback(
    (target: number) => {
      setListOpen(false)
      // 지금 녹음(대기) 중인 질의를 다시 고르면 그대로 진행
      if (target === pos && (phase === 'recording' || phase === 'paused' || phase === 'countdown')) return
      void goTo(target)
    },
    [goTo, phase, pos],
  )

  const exit = useCallback(
    () =>
      runExclusive(async () => {
        cancelCountdown()
        if (phase === 'recording' || phase === 'paused') await finishRecording(question)
        // 도중에 나가도 종합 기록은 남김 (마지막까지 마쳤으면 완료로)
        recordSession()
        onExit()
      }),
    [finishRecording, onExit, phase, question, recordSession, runExclusive],
  )

  /** 다시 듣기 플레이어를 지정한 초만큼 앞뒤로 이동 */
  const seek = useCallback(
    (deltaSec: number) => {
      const el = playbackRef.current
      if (phase !== 'review' || !el) return
      const end = Number.isFinite(el.duration) ? el.duration : (review?.durationMs ?? 0) / 1000
      el.currentTime = Math.min(Math.max(0, el.currentTime + deltaSec), Math.max(0, end))
    },
    [phase, review],
  )

  /** 처음부터 다시: 녹음 중이면 저장 규칙대로 마무리하고, 순서를 새로 정해 첫 질의부터 */
  const restart = useCallback(
    () =>
      runExclusive(async () => {
        if (phase === 'preparing' || phase === 'error') return
        cancelCountdown()
        if (phase === 'recording' || phase === 'paused') await finishRecording(question)
        // 지금까지의 세션은 종합 기록으로 남기고 새 세션 시작
        recordSession()
        sessionIdRef.current = newId()
        sessionStartRef.current = Date.now()
        sessionEntriesRef.current = []
        sessionCompletedRef.current = false
        setSessionReport(null)
        setListOpen(false)
        setOrder(buildOrder(questions.length, orderMode))
        beginCountdown(0)
      }),
    [beginCountdown, finishRecording, orderMode, phase, question, questions.length, recordSession, runExclusive],
  )

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
      if (analysisOn) await startAnalyzers(stream)
      return true
    } catch (err) {
      setErrorText((err as Error).message || '카메라·마이크를 사용할 수 없습니다.')
      setPhase('error')
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 분석기 시작. 실패해도 녹음은 그대로 진행 */
  const startAnalyzers = async (stream: MediaStream) => {
    stopAnalyzers()
    // 실제로 녹음 중일 때만 시간을 돌려줌 (일시정지·카운트다운·다시 듣기 중에는 기록하지 않음)
    const clock = () => {
      const rec = recorderRef.current
      return rec && rec.isRecording ? rec.elapsedMs() : null
    }
    try {
      const audio = new AudioAnalyzer(stream)
      audio.clock = clock
      audio.start()
      audioRef.current = audio
    } catch (err) {
      console.warn('음성 분석을 시작할 수 없습니다.', err)
    }
    if (!videoRef.current) return
    const face = new FaceTracker(videoRef.current, baselineRef.current)
    face.clock = clock
    face.onFail = () => showToast('얼굴 분석이 멈춰 목소리만 분석합니다.', 'warn')
    try {
      // 모델을 처음 읽을 때 몇 초 걸릴 수 있어 최대 10초만 기다림
      await Promise.race([
        face.start(),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('시간 초과')), 10000)),
      ])
      faceRef.current = face
    } catch (err) {
      face.stop()
      console.warn('얼굴 분석을 시작할 수 없습니다.', err)
      showToast('얼굴 분석을 시작하지 못했습니다. 목소리만 분석합니다.', 'warn')
    }
  }

  const stopAnalyzers = () => {
    faceRef.current?.stop()
    faceRef.current = null
    audioRef.current?.stop()
    audioRef.current = null
  }

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
      stopAnalyzers()
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

  // 실시간 시선 표시: 측정값이 올 때마다 그리기, 정면 여부는 바뀔 때만 화면 갱신
  const subscribeLive = useCallback((draw: (s: FaceSample | null) => void) => {
    const face = faceRef.current
    if (!face) return () => {}
    face.onSample = (s) => {
      draw(s)
      setLiveGaze(!s.detected ? 'none' : s.frontal ? 'front' : 'away')
      if (debugRef.current)
        setLiveAngles(s.detected ? { pitch: s.pitch, yaw: s.yaw, roll: s.roll, fps: face.fps } : null)
    }
    return () => {
      face.onSample = null
    }
  }, [])

  // 녹음 중 끄덕임 횟수 (1초마다 다시 셈)
  useEffect(() => {
    if (phase !== 'recording' || !settings.analysis.liveOverlay) return
    const id = window.setInterval(() => {
      const samples = faceRef.current?.samples.filter((f) => f.detected) ?? []
      const p = METRIC_PARAMS
      setLiveNods(
        countSwings(
          samples.map((f) => ({ t: f.t, v: f.pitch })),
          p.headSwingDeg,
          p.headSwingMinSec,
          p.headSwingMaxSec,
        ),
      )
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase, settings.analysis.liveOverlay])

  // 녹음 시간 표시
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return
    const id = window.setInterval(() => {
      if (recorderRef.current) setElapsed(recorderRef.current.elapsedMs())
    }, 200)
    return () => window.clearInterval(id)
  }, [phase])

  // ---------- 단축키 ----------

  const handlers = useRef({ onRecordButton, move, togglePause, seek })
  handlers.current = { onRecordButton, move, togglePause, seek }

  useEffect(() => {
    const { shortcuts } = settings
    const step = settings.seekStepSec
    const all = Object.values(shortcuts)
    const isShortcut = (e: KeyboardEvent) => all.some((s) => matchShortcut(e, s))

    // 메모 등 글자를 입력하는 중에는 단축키를 쓰지 않음
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el?.closest?.('textarea, input:not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]')
    }

    // 기록 상세 창 등 모달이 열려 있으면 연습 단축키를 쓰지 않음
    const modalOpen = () => !!document.querySelector('.modal-backdrop')

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || modalOpen()) return
      // 포커스된 버튼이 Space·Enter로 함께 눌리거나, 플레이어 진행 바가
      // 방향키를 자체 처리(아주 작은 단위 이동)하지 않도록 단축키는 기본 동작을 막음
      if (isShortcut(e)) e.preventDefault()
      // 이동 단축키는 꾹 누르고 있으면 계속 이동
      if (matchShortcut(e, shortcuts.seekBack)) {
        handlers.current.seek(-step)
        return
      }
      if (matchShortcut(e, shortcuts.seekForward)) {
        handlers.current.seek(step)
        return
      }
      if (e.repeat) return
      if (matchShortcut(e, shortcuts.complete)) {
        // 녹음 버튼과 같은 동작: 녹음 중이면 완료, 다시 듣기 중이면 다시 녹음
        handlers.current.onRecordButton()
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
      if (isTyping(e) || modalOpen()) return
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
          <span className="muted">
            {orderMode === 'random' ? '무작위' : '순서대로'} · {ts.saveEnabled ? '자동 저장' : '수동 저장'} · 저장{' '}
            {savedCount}개
          </span>
        </div>
        <div className="practice-actions">
          <button
            className={`btn ghost ${listOpen ? 'on' : ''}`}
            onClick={() => setListOpen((o) => !o)}
            disabled={phase === 'preparing'}
            title="질의 목록을 보고 원하는 질의로 이동"
          >
            <ListIcon size={18} /> 질의 목록
          </button>
          <button
            className="btn ghost"
            onClick={() => void restart()}
            disabled={busy || phase === 'preparing' || phase === 'error'}
            title="순서를 새로 정해 첫 질의부터 다시 연습"
          >
            <RestartIcon size={16} /> 처음부터 다시
          </button>
          <button className="icon-btn" onClick={() => void exit()} title="연습 종료" disabled={busy}>
            <CloseIcon size={22} />
          </button>
        </div>
      </header>

      <main className="stage">
        <div className={`camera ${phase === 'recording' ? 'is-recording' : ''}`}>
          <video ref={videoRef} className="live" autoPlay muted playsInline hidden={showRecordedVideo} />
          {showRecordedVideo && review && (
            <video
              key={review.url}
              ref={(el) => {
                playbackRef.current = el
                setPlaybackVideo(el)
              }}
              className="playback"
              src={review.url}
              controls
            />
          )}
          {/* 시선 점: 실시간 카메라 위 / 녹화본 재생 위 */}
          {analysisOn && settings.analysis.liveOverlay && !showRecordedVideo && faceRef.current && (
            <GazeOverlay video={videoRef.current} fit="cover" mirrored subscribe={subscribeLive} />
          )}
          {analysisOn && showRecordedVideo && review?.analysis && review.analysis.face.length > 0 && (
            <GazeOverlay video={playbackVideo} fit="contain" mirrored={false} samples={review.analysis.face} />
          )}
          {analysisOn && settings.analysis.liveOverlay && isRecording && liveGaze && (
            <div className="live-analysis">
              <span className={`live-gaze ${liveGaze}`}>
                {liveGaze === 'front' ? '정면' : liveGaze === 'away' ? '시선 이탈' : '얼굴 없음'}
              </span>
              <span>끄덕임 {liveNods}</span>
              <span className="muted">참고용</span>
            </div>
          )}
          {analysisOn && settings.analysis.liveOverlay && debugOn && !showRecordedVideo && (
            <div className="live-debug">
              {liveAngles ? (
                <>
                  <span>상하 {liveAngles.pitch.toFixed(1)}°</span>
                  <span>좌우 {liveAngles.yaw.toFixed(1)}°</span>
                  <span>기울기 {liveAngles.roll.toFixed(1)}°</span>
                  <span>
                    {Math.round(liveAngles.fps)}회/초 · {faceRef.current?.delegate ?? '-'}
                  </span>
                  <span className="muted">끄덕임 기준 {METRIC_PARAMS.headSwingDeg}°</span>
                </>
              ) : (
                <span>얼굴 없음</span>
              )}
            </div>
          )}
          {phase === 'review' && review?.kind === 'audio' && (
            // 영상 컨트롤처럼 카메라 아래쪽에 표시. 자동 재생하지 않고 원할 때 재생
            <audio
              key={`audio-${review.url}`}
              ref={playbackRef as React.Ref<HTMLAudioElement>}
              className="audio-player"
              src={review.url}
              controls
            />
          )}
          <div className="camera-top">
            {statusBadge}
            {(isRecording || phase === 'review') && <span className="timer">{formatTime(elapsed)}</span>}
          </div>
        </div>

        <section className="question-panel">
          <div className="question-head">
            <span className="question-label">Q{Math.min(pos + 1, total)}</span>
            {/* 중요도·안 외워짐은 녹음 중에도 바로 표시 가능 */}
            {phase !== 'finished' && question && (
              <div className="question-marks">
                <StarRating
                  value={questionMeta.importance}
                  size={18}
                  onChange={(v) => onUpdateMeta(question, { importance: v })}
                />
                <button
                  className={`icon-btn flag-btn ${questionMeta.hard ? 'on' : ''}`}
                  onClick={() => onUpdateMeta(question, { hard: !questionMeta.hard })}
                  title={questionMeta.hard ? '안 외워짐 해제' : '잘 안 외워짐 표시'}
                >
                  <FlagIcon size={18} filled={questionMeta.hard} />
                </button>
              </div>
            )}
          </div>
          <p className="question-text">{phase === 'finished' ? '모든 질의를 마쳤습니다.' : question}</p>
          {/* 메모는 답변을 마친 뒤(다시 듣기)에만 보여 주고 수정 가능 */}
          {phase === 'review' && (
            <div className="review-memo">
              <div className="review-memo-head">
                <span>
                  <MemoIcon size={14} /> 메모
                </span>
                <button className="btn link" onClick={() => setMemoEditing((v) => !v)}>
                  {memoEditing ? '완료' : questionMeta.memo.trim() ? '수정' : '메모 추가'}
                </button>
              </div>
              {memoEditing ? (
                <MemoField value={questionMeta.memo} onSave={(memo) => onUpdateMeta(question, { memo })} />
              ) : questionMeta.memo.trim() ? (
                <p className="review-memo-text" onClick={() => setMemoEditing(true)}>
                  {questionMeta.memo}
                </p>
              ) : (
                <p className="review-memo-empty">아직 메모가 없습니다.</p>
              )}
            </div>
          )}
          {/* 수동 저장 모드에서만 저장 버튼 표시 (자동 저장일 때는 없음) */}
          {phase === 'review' && review && !ts.saveEnabled && (
            <button
              className={`btn save-btn ${review.savedName ? 'saved' : 'primary'}`}
              onClick={() => void saveReview()}
              disabled={busy}
            >
              {review.savedName ? <CheckIcon size={18} /> : <SaveIcon size={18} />}
              {review.savedName ? `저장됨 · ${review.savedName}` : `이 ${review.kind === 'video' ? '영상' : '음성'} 저장`}
            </button>
          )}
          {phase === 'review' && review?.analysis && (
            <AnalysisReport
              key={`report-${review.url}`}
              record={review.analysis}
              previousOverall={review.previousOverall}
              durationMs={review.durationMs}
              onSeek={(sec) => {
                const el = playbackRef.current
                if (!el) return
                el.currentTime = sec
                void el.play()
              }}
              getTime={() => (playbackRef.current ? playbackRef.current.currentTime : null)}
            />
          )}
          {phase === 'review' && (
            <p className="hint">
              다시 들으며 문제점을 확인하세요. {formatShortcut(settings.shortcuts.seekBack)} /{' '}
              {formatShortcut(settings.shortcuts.seekForward)}로 {settings.seekStepSec}초씩 이동합니다. 녹음 버튼을
              누르면 같은 질의로 다시 연습합니다.
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
          title={
            isRecording
              ? `클릭하거나 ${formatShortcut(settings.shortcuts.complete)}로 녹음 완료`
              : `클릭하거나 ${formatShortcut(settings.shortcuts.complete)}로 다시 녹음`
          }
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
        완료/다시 녹음 {formatShortcut(settings.shortcuts.complete)} · 정지/재개 {formatShortcut(settings.shortcuts.pause)} · 이전 {formatShortcut(settings.shortcuts.prev)} · 다음{' '}
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
          {analysisOn && faceRef.current && <p className="countdown-hint">카메라 렌즈를 보세요 · 시선 기준을 맞추는 중</p>}
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
        <div className="countdown-overlay finished">
          <p className="countdown-question">모든 질의를 마쳤습니다 🎉</p>
          {ts.saveEnabled && <p className="muted">이번 세션에 저장된 파일 {savedCount}개</p>}
          {analysisOn && sessionReport && (
            <SessionReport
              topic={topic}
              summary={sessionReport}
              entries={sessionEntriesRef.current.map((e) => ({ question: e.question, summary: e.summary }))}
            />
          )}
          <div className="overlay-actions">
            {sessionDirRef.current && (
              <button className="btn ghost" onClick={() => window.api.openPath(sessionDirRef.current!)}>
                저장 폴더 열기
              </button>
            )}
            <button className="btn ghost" onClick={() => void move(-1)}>
              마지막 질의로
            </button>
            <button className="btn ghost" onClick={() => void restart()}>
              처음부터 다시
            </button>
            <button className="btn primary" onClick={onExit}>
              목록으로
            </button>
          </div>
        </div>
      )}

      {listOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setListOpen(false)} />
          <aside className="q-drawer">
            <header>
              <strong>질의 목록</strong>
              <span className="muted">
                {orderMode === 'random' ? '무작위 순서' : '순서대로'} · {total}개
              </span>
              <button className="icon-btn" onClick={() => setListOpen(false)} aria-label="닫기">
                <CloseIcon size={18} />
              </button>
            </header>
            <ol>
              {order.map((qi, i) => {
                const q = questions[qi]
                const meta = { ...EMPTY_QUESTION_META, ...topic.questionMeta?.[q] }
                const current = i === pos && phase !== 'finished'
                return (
                  <li key={`${i}-${q}`} className={current ? 'current' : ''}>
                    <button className="q-drawer-item" onClick={() => jumpTo(i)} disabled={busy}>
                      <span className="q-no">Q{i + 1}</span>
                      <span className="q-text">{q}</span>
                    </button>
                    <div className="q-drawer-meta">
                      <StarRating
                        value={meta.importance}
                        size={14}
                        onChange={(v) => onUpdateMeta(q, { importance: v })}
                      />
                      <button
                        className={`icon-btn flag-btn ${meta.hard ? 'on' : ''}`}
                        onClick={() => onUpdateMeta(q, { hard: !meta.hard })}
                        title={meta.hard ? '안 외워짐 해제' : '잘 안 외워짐 표시'}
                      >
                        <FlagIcon size={15} filled={meta.hard} />
                      </button>
                      {current && <span className="badge-now">진행 중</span>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </aside>
        </>
      )}

      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
    </div>
  )
}
