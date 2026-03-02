import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isCapacitor = process.env.VITE_CAPACITOR === 'true';

export default defineConfig({
  plugins: [react()],
  base: isCapacitor ? '/' : '/login/',
  build: {
    outDir: isCapacitor ? 'dist' : '../login',
    emptyOutDir: true,
    assetsDir: 'assets'
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
