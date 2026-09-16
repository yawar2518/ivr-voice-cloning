import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // File-change events do not cross a Windows/macOS -> Docker bind mount,
    // so poll the tree to keep HMR and the module cache fresh in the container.
    watch: {
      usePolling: true,
      interval: 500
    }
  }
})
