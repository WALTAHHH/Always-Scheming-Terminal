import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Transpile JSX with the automatic runtime (react/jsx-runtime), matching how
  // Next builds. Without this, esbuild defaults to the classic runtime and emits
  // `React.createElement` calls, which break any .tsx source that does not import
  // the default `React` (tsconfig sets "jsx": "preserve").
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
