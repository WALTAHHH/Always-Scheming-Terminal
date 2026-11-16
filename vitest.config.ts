import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  // tsconfig sets jsx:"preserve" for Next's own SWC transform; Vitest's esbuild
  // otherwise falls back to the classic runtime and demands `React` in scope in
  // .tsx test imports. Use the automatic JSX runtime so component .tsx tests
  // (LiveFeed, etc.) render without an explicit React import.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
