// 메인 프로세스와 렌더러가 함께 쓰는 타입 정의

export type QuestionOrder = 'random' | 'sequential'
export type SaveFormat = 'audio' | 'video'

/** 주제별 개별 설정 */
export interface TopicSettings {
  order: QuestionOrder
  /** 질의 시작 전 대기 카운트(초) */
  countdownSec: number
  /** 이 시간(초) 이하로 녹음되면 파일로 저장하지 않음 */
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

/** 공통 설정 */
export interface AppSettings {
  saveRoot: string
  shortcuts: Shortcuts
  /** 다시 듣기에서 한 번에 이동하는 시간(초) */
  seekStepSec: number
}

export const DEFAULT_SEEK_STEP_SEC = 1

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
}

export const DEFAULT_TOPIC_SETTINGS: TopicSettings = {
  order: 'random',
  countdownSec: 5,
  minRecordSec: 1,
  saveEnabled: true,
  saveFormat: 'audio',
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  complete: 'Enter',
  pause: 'Space',
  prev: 'ArrowLeft',
  next: 'ArrowRight',
  seekBack: 'Shift+ArrowLeft',
  seekForward: 'Shift+ArrowRight',
}
