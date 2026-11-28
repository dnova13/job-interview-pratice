// MediaPipe 실행 파일(wasm)과 얼굴 모델을 public/mediapipe에 준비
// - wasm: node_modules에서 복사 (저장소에는 올리지 않음)
// - 모델: 저장소에 포함. 없을 때만 내려받음
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public/mediapipe')
const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmOut = path.join(outDir, 'wasm')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const modelPath = path.join(outDir, 'face_landmarker.task')

await fs.mkdir(wasmOut, { recursive: true })
// SIMD를 지원하는 기본 변형만 사용
for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  await fs.copyFile(path.join(wasmSrc, name), path.join(wasmOut, name))
}

try {
  await fs.access(modelPath)
} catch {
  console.log('얼굴 모델 내려받는 중…')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`모델 다운로드 실패: ${res.status}`)
  await fs.writeFile(modelPath, Buffer.from(await res.arrayBuffer()))
}
console.log('MediaPipe 준비 완료')
