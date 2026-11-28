// 메인 프로세스와 렌더러가 함께 쓰는 타입 정의
import type { AnalysisRecord, AnalysisSummary, SessionSummary } from './lib/analysis/types'

export type QuestionOrder = 'random' | 'sequential'
export type SaveFormat = 'audio' | 'video'

/** 주제별 개별 설정 */
export interface TopicSettings {
  order: QuestionOrder
  /** 질의 시작 전 대기 카운트(초) */
  countdownSec: number
  /** 이 시간(초) 이하로 녹화·녹음되면 파일로 저장하지 않고 점수도 내지 않음 */
  minRecordSec: number
  /** 파일 저장 여부 */
  saveEnabled: boolean
  /** 저장 형식: 음성(.m4a) / 영상(.mp4) */
  saveFormat: SaveFormat
}

/** 질의별 학습 기록 */
export interface QuestionMeta {
  /** 중요도 0~5 (0은 미지정) */
  importance: number
  memo: string
  /** 잘 안 외워지는 질의 표시 */
  hard: boolean
}

export const EMPTY_QUESTION_META: QuestionMeta = { importance: 0, memo: '', hard: false }

export interface Topic {
  id: string
  title: string
  description: string
  questions: string[]
  /** 질의 문장을 키로 한 학습 기록 (질의를 편집해도 문장이 같으면 유지) */
  questionMeta?: Record<string, QuestionMeta>
  /** 질의 문장을 키로 한 답변 분석 점수 기록 (최근 순서로 쌓임, 최대 ANALYSIS_HISTORY_MAX개) */
  analysisHistory?: Record<string, AnalysisSummary[]>
  /** 연습 세션별 종합 기록 (오래된 것부터) */
  sessionHistory?: SessionSummary[]
  settings: TopicSettings
  createdAt: number
  updatedAt: number
}

/** 단축키 문자열 예: "Ctrl+Enter", "ArrowLeft", "Shift+N" */
export interface Shortcuts {
  complete: string
  /** 녹음 일시정지 / 재개 */
  pause: string
  prev: string
  next: string
  /** 다시 듣기: 뒤로 이동 */
  seekBack: string
  /** 다시 듣기: 앞으로 이동 */
  seekForward: string
}

/** 답변 분석 설정 */
export interface AnalysisSettings {
  /** 목소리·시선·고개 분석 사용 */
  enabled: boolean
  /** 녹음 중 카메라 위에 시선 점·정면 표시 */
  liveOverlay: boolean
  /** 카메라 위에 고개 각도·측정 횟수 표시 (기준 조정 확인용) */
  debugOverlay: boolean
}

/** 공통 설정 */
export interface AppSettings {
  saveRoot: string
  shortcuts: Shortcuts
  /** 다시 듣기에서 한 번에 이동하는 시간(초) */
  seekStepSec: number
  analysis: AnalysisSettings
}

export const DEFAULT_SEEK_STEP_SEC = 1
export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = { enabled: true, liveOverlay: true, debugOverlay: false }
/** 질의별로 남기는 점수 기록 수 */
export const ANALYSIS_HISTORY_MAX = 100
/** 질의별로 상세 데이터(타임라인·그림용)를 남기는 최근 기록 수. 오래된 기록은 점수만 남김 */
export const ANALYSIS_DETAIL_MAX = 30
/** 주제별로 남기는 종합 기록 수 */
export const SESSION_HISTORY_MAX = 100

export interface StoreData {
  topics: Topic[]
  settings: AppSettings
}

export interface SaveRecordingRequest {
  saveRoot: string
  topicTitle: string
  /** 이번 세션에서 이미 만든 세션 폴더 경로 (없으면 첫 저장 시 생성) */
  sessionDir: string | null
  question: string
  ext: string
  data: ArrayBuffer
}

export interface SaveRecordingResult {
  sessionDir: string
  filePath: string
  fileName: string
}

export interface ElectronApi {
  loadStore(): Promise<StoreData>
  saveTopics(topics: Topic[]): Promise<void>
  saveSettings(settings: AppSettings): Promise<void>
  pickFolder(current: string): Promise<string | null>
  openPath(path: string): Promise<void>
  ensureMediaAccess(): Promise<{ camera: boolean; microphone: boolean }>
  saveRecording(req: SaveRecordingRequest): Promise<SaveRecordingResult>
  /** 답변 분석 상세 데이터 저장·읽기·삭제 (ids가 null이면 주제 전체) */
  saveAnalysisDetail(topicId: string, id: string, record: AnalysisRecord): Promise<void>
  loadAnalysisDetail(topicId: string, id: string): Promise<AnalysisRecord | null>
  deleteAnalysisDetails(topicId: string, ids: string[] | null): Promise<void>
  /** 저장 폴더 안의 녹음 파일 읽기 (없으면 null) */
  readRecording(filePath: string): Promise<Uint8Array | null>
}

export const DEFAULT_TOPIC_SETTINGS: TopicSettings = {
  order: 'random',
  countdownSec: 5,
  minRecordSec: 10,
  saveEnabled: true,
  saveFormat: 'video',
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  complete: 'Enter',
  pause: 'Space',
  prev: 'ArrowLeft',
  next: 'ArrowRight',
  seekBack: 'Shift+ArrowLeft',
  seekForward: 'Shift+ArrowRight',
}
