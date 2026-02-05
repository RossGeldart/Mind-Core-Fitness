import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/login/',
  build: {
    outDir: '../login',
    emptyOutDir: true,
    assetsDir: 'assets'
  }
})
