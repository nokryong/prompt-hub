import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 콘텐츠 스크립트 전용 빌드.
// MV3 콘텐츠 스크립트는 ESM import를 지원하지 않으므로
// 코드 분할 없이 단일 IIFE 파일로 묶어야 한다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/content.jsx',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'content.js',
      },
    },
  },
})
