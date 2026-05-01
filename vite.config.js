import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseTarget = env.VITE_SUPABASE_URL ? String(env.VITE_SUPABASE_URL).trim() : '';
  const aiToken = env.AI_TOKEN ? String(env.AI_TOKEN).trim() : env.VITE_AI_TOKEN ? String(env.VITE_AI_TOKEN).trim() : '';
  const proxy = {};

  if (supabaseTarget) {
    proxy['/__supabase'] = {
      target: supabaseTarget,
      changeOrigin: true,
      rewrite: (reqPath) => reqPath.replace(/^\/__supabase/, ''),
    };
  }

  proxy['/api/ai'] = {
    target: 'https://apifreellm.com',
    changeOrigin: true,
    rewrite: () => '/api/v1/chat',
    headers: aiToken ? {
      Authorization: `Bearer ${aiToken}`,
    } : undefined,
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'vendor-react';
            if (id.includes('node_modules/@monaco-editor/react')) return 'vendor-monaco-react';
            if (id.includes('node_modules/monaco-editor/esm/vs/editor/editor.worker')) return 'monaco-worker-editor';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/json/json.worker')) return 'monaco-worker-json';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/css/css.worker')) return 'monaco-worker-css';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/html/html.worker')) return 'monaco-worker-html';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/typescript/ts.worker')) return 'monaco-worker-ts';
            if (id.includes('node_modules/monaco-editor/esm/vs/basic-languages/')) return 'vendor-monaco-basic-languages';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/json/')) return 'vendor-monaco-json';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/css/')) return 'vendor-monaco-css';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/html/')) return 'vendor-monaco-html';
            if (id.includes('node_modules/monaco-editor/esm/vs/language/typescript/')) return 'vendor-monaco-typescript';
            if (id.includes('node_modules/monaco-editor/esm/vs/editor/')) return 'vendor-monaco-editor';
            if (id.includes('node_modules/monaco-editor/esm/vs/base/')) return 'vendor-monaco-base';
            if (id.includes('node_modules/monaco-editor/esm/vs/platform/')) return 'vendor-monaco-platform';
            if (id.includes('node_modules/monaco-editor') || id.includes('node_modules/@monaco-editor')) return 'vendor-monaco-misc';
            if (id.includes('node_modules/react-markdown') || id.includes('node_modules/rehype-raw') || id.includes('node_modules/remark-gfm')) return 'vendor-markdown';
          },
        },
      },
    },
  };
})

