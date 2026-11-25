# 면접 연습 (InterviewPractice)

React + Vite + Electron으로 만든 면접 연습용 데스크톱 앱입니다. 카메라로 자신을 보면서 질의에 답하고, 답변을 녹음·녹화해서 다시 들으며 검토합니다.

## 실행

```bash
npm install
npm run dev        # 개발 모드 (Vite + Electron 자동 실행)
npm run typecheck  # 타입 검사
npm run preview    # 프로덕션 빌드 후 실행
```

## 패키징 (electron-builder)

```bash
npm run dist:mac        # macOS .dmg / .zip (arm64 + x64)
npm run dist:mac:local  # 설치 파일 없이 .app만 빠르게 생성
npm run dist:win        # Windows 설치 파일 (.exe, NSIS)
```

- 결과물: `release/{버전}/`
- 설정: `electron-builder.yml`, macOS 권한: `build/entitlements.mac.plist`
- 카메라·마이크 권한 안내 문구(`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`)가 Info.plist에 들어갑니다.
- 기본은 **ad-hoc 서명**이라 내 Mac에서는 바로 실행됩니다. 다른 Mac에 배포하면 Gatekeeper 경고가 뜨므로 우클릭 → 열기로 실행해야 합니다. 정식 배포하려면 Developer ID 인증서로 서명하고 공증을 받아야 합니다 (`electron-builder.yml`의 `identity: "-"` 줄을 지우면 키체인의 인증서로 서명).
- 앱 아이콘은 `build/icon.icns`(macOS), `build/icon.ico`(Windows)를 넣으면 자동으로 사용됩니다.

## 저장 위치

- 녹음 파일: `~/Documents/InterviewPractice/` (공통 설정에서 변경 가능)
  ```
  {주제이름}/{주제이름 yymmdd (n)}/{질의 앞 12자} (n).m4a | .mp4
  ```
  폴더는 첫 녹음 파일을 저장할 때 만들어집니다.
- 주제·설정 데이터: `~/Library/Application Support/InterviewPractice/store.json`

## 구조

| 경로 | 역할 |
|---|---|
| `electron/main.ts` | 창 생성, 카메라 권한, 주제·설정 저장, 녹음 파일 저장 규칙 |
| `electron/preload.ts` | 렌더러에 `window.api` 노출 |
| `src/screens/HomeScreen.tsx` | 주제 목록 |
| `src/screens/TopicEditor.tsx` | 주제 생성·편집 + 주제별 개별 설정 |
| `src/screens/SettingsModal.tsx` | 공통 설정 (저장 폴더, 단축키) |
| `src/screens/PracticeScreen.tsx` | 연습 화면 (카운트다운, 카메라, 녹음, 다시 듣기) |
| `src/lib/recorder.ts` | MediaRecorder 래퍼 (MP4/M4A 우선, 미지원 시 WebM) |
