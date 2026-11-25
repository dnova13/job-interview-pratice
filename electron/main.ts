import { app, BrowserWindow, dialog, ipcMain, session, shell, systemPreferences } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  AppSettings,
  SaveRecordingRequest,
  SaveRecordingResult,
  StoreData,
  Topic,
} from '../src/types'
import { DEFAULT_SEEK_STEP_SEC, DEFAULT_SHORTCUTS } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_SAVE_ROOT = path.join(app.getPath('documents'), 'InterviewPractice')
const STORE_PATH = path.join(app.getPath('userData'), 'store.json')
const MAX_QUESTION_CHARS = 12

// ---------- 저장소 (주제·설정 JSON) ----------

function defaultStore(): StoreData {
  return {
    topics: [],
    settings: {
      saveRoot: DEFAULT_SAVE_ROOT,
      shortcuts: { ...DEFAULT_SHORTCUTS },
      seekStepSec: DEFAULT_SEEK_STEP_SEC,
    },
  }
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoreData>
    const base = defaultStore()
    return {
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      settings: {
        saveRoot: parsed.settings?.saveRoot || base.settings.saveRoot,
        shortcuts: { ...base.settings.shortcuts, ...parsed.settings?.shortcuts },
        seekStepSec:
          typeof parsed.settings?.seekStepSec === 'number' && parsed.settings.seekStepSec > 0
            ? parsed.settings.seekStepSec
            : base.settings.seekStepSec,
      },
    }
  } catch {
    return defaultStore()
  }
}

let writeQueue: Promise<void> = Promise.resolve()

/** 동시 저장으로 파일이 깨지지 않도록 순서대로, 임시 파일을 거쳐 기록 */
function writeStore(patch: Partial<StoreData>): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const current = await readStore()
    const next = { ...current, ...patch }
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    const tmp = `${STORE_PATH}.tmp`
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
    await fs.rename(tmp, STORE_PATH)
  })
  return writeQueue
}

// ---------- 녹음 파일 저장 ----------

/** 파일·폴더 이름에 쓸 수 없는 문자를 제거 */
function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  return cleaned || '무제'
}

function yymmdd(d = new Date()): string {
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listNames(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

/** `${base} (n)${suffix}` 형태에서 가장 큰 n + 1 반환 */
async function nextIndex(dir: string, base: string, suffixPattern: string): Promise<number> {
  const re = new RegExp(`^${escapeRegExp(base)} \\((\\d+)\\)${suffixPattern}$`)
  let max = 0
  for (const name of await listNames(dir)) {
    const m = name.normalize('NFC').match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** 질의 문장이 12자를 넘으면 12자에서 자름 (한글·이모지 모두 1자로 계산) */
function questionBase(question: string): string {
  const chars = Array.from(sanitizeName(question))
  return chars.slice(0, MAX_QUESTION_CHARS).join('').trim() || '질의'
}

async function saveRecording(req: SaveRecordingRequest): Promise<SaveRecordingResult> {
  let sessionDir = req.sessionDir
  if (!sessionDir) {
    // 첫 녹음 파일을 저장할 때 {주제}/{주제 yymmdd (n)} 폴더를 생성
    const topicName = sanitizeName(req.topicTitle)
    const topicDir = path.join(req.saveRoot || DEFAULT_SAVE_ROOT, topicName)
    await fs.mkdir(topicDir, { recursive: true })
    const base = `${topicName} ${yymmdd()}`
    let n = await nextIndex(topicDir, base, '')
    // 다른 창이나 프로세스가 같은 이름을 먼저 만든 경우를 대비해 재시도
    for (;;) {
      const candidate = path.join(topicDir, `${base} (${n})`)
      try {
        await fs.mkdir(candidate)
        sessionDir = candidate
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          n += 1
          continue
        }
        throw err
      }
    }
  } else {
    await fs.mkdir(sessionDir, { recursive: true })
  }

  const ext = req.ext.replace(/[^a-z0-9]/gi, '') || 'm4a'
  const base = questionBase(req.question)
  // 같은 질의는 형식(m4a/mp4/webm)과 관계없이 번호가 이어서 증가
  let n = await nextIndex(sessionDir, base, '\\.[A-Za-z0-9]+')
  for (;;) {
    const fileName = `${base} (${n}).${ext}`
    const filePath = path.join(sessionDir, fileName)
    try {
      await fs.writeFile(filePath, Buffer.from(req.data), { flag: 'wx' })
      return { sessionDir, filePath, fileName }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        n += 1
        continue
      }
      throw err
    }
  }
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('store:load', () => readStore())
  ipcMain.handle('store:saveTopics', (_e, topics: Topic[]) => writeStore({ topics }))
  ipcMain.handle('store:saveSettings', (_e, settings: AppSettings) => writeStore({ settings }))

  ipcMain.handle('dialog:pickFolder', async (e, current: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      title: '녹음 파일 저장 폴더 선택',
      defaultPath: current || DEFAULT_SAVE_ROOT,
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('shell:openPath', async (_e, target: string) => {
    await fs.mkdir(target, { recursive: true }).catch(() => undefined)
    await shell.openPath(target)
  })

  ipcMain.handle('media:ensureAccess', async () => {
    if (process.platform !== 'darwin') return { camera: true, microphone: true }
    const camera = await systemPreferences.askForMediaAccess('camera')
    const microphone = await systemPreferences.askForMediaAccess('microphone')
    return { camera, microphone }
  })

  ipcMain.handle('recording:save', (_e, req: SaveRecordingRequest) => saveRecording(req))
}

// ---------- 창 ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: '면접 연습',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // 카메라·마이크 권한 요청을 허용
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
