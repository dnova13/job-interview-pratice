import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  // 패키징 후 file:// 로 열 때 에셋 경로가 깨지지 않도록 상대 경로 사용
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            rolldownOptions: {
              // sandbox preload는 CommonJS여야 하므로 .cjs로 출력
              output: { entryFileNames: '[name].cjs' },
            },
          },
        },
      },
    }),
  ],
})
