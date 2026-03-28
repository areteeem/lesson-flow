import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import './index.css'
import App from './App.jsx'

// Must be configured before the DslMonacoEditor lazy chunk loads and Monaco initialises
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
