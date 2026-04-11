import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { DialogProvider } from './context/DialogContext'
import './index.css'
import App from './App.jsx'
import { initMobileDragDropSupport } from './utils/dragDropSupport'
import { cleanupExpiredResponses } from './utils/sessionCleanup'

// Must be configured before the DslMonacoEditor lazy chunk loads and Monaco initialises
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

void initMobileDragDropSupport();
cleanupExpiredResponses();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
