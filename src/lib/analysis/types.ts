// 답변 분석(목소리·시선·고개)에서 쓰는 타입

/** 오디오 측정 한 번 (약 50ms 간격) */
export interface AudioSample {
  /** 녹음 시작부터의 시간(ms, 일시정지 제외) */
  t: number
  /** 음량 (dBFS, 무음에 가까울수록 -100) */
  db: number
  /** 기본 주파수(Hz). 신뢰도가 낮으면 null */
  f0: number | null
}

/** 화면 위 점 (영상 원본 기준 0~1 좌표) */
export interface Point {
  x: number
  y: number
}

/** 얼굴 측정 한 번 (초당 10~15회) */
export interface FaceSample {
  t: number
  detected: boolean
  /** 머리 좌우·상하·기울기 각도(°) */
  yaw: number
  pitch: number
  roll: number
  /**
   * 머리 방향 (영상 기준, 얼굴 폭 대비 코끝 위치). 가로 +면 영상 오른쪽, 세로 +면 아래.
   * 3D 각도와 달리 부호가 영상 방향과 항상 같아 눈 방향과 더할 수 있음
   */
  headX: number
  headY: number
  /** 눈 방향 (영상 기준, 눈 폭 대비 눈동자 위치). 가로 +면 오른쪽, 세로 +면 아래 */
  eyeX: number
  eyeY: number
  /** 기준 자세 대비 정면 여부 */
  frontal: boolean
  /** 두 눈동자 중심 */
  irisL: Point | null
  irisR: Point | null
  /** 시선 방향을 표시할 점 */
  gaze: Point | null
}

/** 카운트다운 동안 잰 기준값 */
export interface Baseline {
  noiseDb: number
  /** 카메라 렌즈를 볼 때의 시선 방향 (머리 + 눈, 영상 기준) */
  gazeX: number
  gazeY: number
  /** 기준값을 실제로 측정했는지 (아니면 기본값) */
  measured: boolean
}

export const DEFAULT_BASELINE: Baseline = { noiseDb: -60, gazeX: 0, gazeY: 0, measured: false }

/** 지표 계산 결과. 측정할 수 없으면 null */
export interface Metrics {
  durationSec: number
  // 목소리
  meanDb: number | null
  /** 배경 소음보다 몇 dB 큰지 */
  loudnessAboveNoise: number | null
  dbStd: number | null
  tailDrop: number | null
  pitchStdSemitone: number | null
  medianF0: number | null
  // 말의 흐름
  longSilences: number
  longSilencesPerMin: number
  speechRatio: number
  startDelaySec: number | null
  // 시선
  faceDetectedRatio: number
  frontalRatio: number | null
  lookAways: number
  lookAwaysPerMin: number | null
  // 자세
  nods: number
  nodsPerMin: number | null
  shakes: number
  shakesPerMin: number | null
  meanTilt: number | null
}

export type CategoryKey = 'voice' | 'flow' | 'gaze' | 'posture'

export interface CategoryScore {
  key: CategoryKey
  label: string
  /** 0~100, 측정 불가면 null */
  score: number | null
  /** "음 높이 변화 2.6반음 (기준 2~4)" 같은 측정값 설명 */
  details: string[]
}

export interface Advice {
  key: string
  text: string
}

export interface AnalysisResult {
  metrics: Metrics
  categories: CategoryScore[]
  overall: number | null
  advice: Advice[]
}

/** 질의별 기록으로 저장하는 요약 */
export interface AnalysisSummary {
  /** 기록 id (상세 데이터 파일 이름) */
  id: string
  /** 이 답변을 한 연습 세션 id */
  sessionId?: string
  at: number
  durationSec: number
  overall: number | null
  scores: Record<CategoryKey, number | null>
  nodsPerMin: number | null
  frontalRatio: number | null
  pitchStdSemitone: number | null
  /** 상세 데이터(시계열)가 저장되어 있는지 */
  hasDetail?: boolean
  /** 녹음 파일로 저장했으면 그 경로 */
  recordingPath?: string | null
  recordingKind?: 'audio' | 'video'
}

/** 한 번의 연습 세션(주제 한 바퀴) 종합 기록 */
export interface SessionSummary {
  id: string
  startedAt: number
  endedAt: number
  /** 마지막 질의까지 마쳤는지 (중간에 나가면 false) */
  completed: boolean
  /** 이번 세션의 질의 수 */
  total: number
  /** 분석 점수가 나온 답변 수 */
  answered: number
  order: 'random' | 'sequential'
  overall: number | null
  scores: Record<CategoryKey, number | null>
  /** 반복해서 나온 습관 (조언 문구) */
  habits: { text: string; count: number }[]
}

/** 다시 듣기·타임라인용 전체 기록 */
export interface AnalysisRecord {
  audio: AudioSample[]
  face: FaceSample[]
  baseline: Baseline
  result: AnalysisResult
}
