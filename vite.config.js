import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'vendor-react';
          if (id.includes('node_modules/@monaco-editor') || id.includes('node_modules/monaco-editor')) return 'vendor-monaco';
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/rehype-raw') || id.includes('node_modules/remark-gfm')) return 'vendor-markdown';
        },
      },
    },
  },
})
