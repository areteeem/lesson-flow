import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DialogContext = createContext(null);

const INITIAL_DIALOG = {
  open: false,
  type: 'alert',
  title: '',
  message: '',
  confirmLabel: 'OK',
  cancelLabel: 'Cancel',
  placeholder: '',
  defaultValue: '',
  allowEmpty: false,
};

function AppDialogHost({ dialog, onConfirm, onCancel }) {
  const [draftValue, setDraftValue] = useState(dialog.defaultValue || '');

  useEffect(() => {
    setDraftValue(dialog.defaultValue || '');
  }, [dialog.defaultValue, dialog.open]);

  if (!dialog.open) return null;

  const isPrompt = dialog.type === 'prompt';
  const isConfirm = dialog.type === 'confirm';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="app-surface w-full max-w-md border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <div id="app-dialog-title" className="text-sm font-semibold text-zinc-900">{dialog.title || (isPrompt ? 'Enter a value' : isConfirm ? 'Please confirm' : 'Notice')}</div>
          {dialog.message && <div className="mt-1 text-sm leading-6 text-zinc-600">{dialog.message}</div>}
        </div>
        <div className="px-5 py-4">
          {isPrompt && (
            <input
              autoFocus
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onCancel();
                if (event.key === 'Enter' && (dialog.allowEmpty || String(draftValue).trim())) {
                  onConfirm(draftValue);
                }
              }}
              placeholder={dialog.placeholder}
              className="w-full border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4">
          {(isPrompt || isConfirm) && (
            <button type="button" onClick={onCancel} className="border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50">
              {dialog.cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(isPrompt ? draftValue : true)}
            disabled={isPrompt && !dialog.allowEmpty && !String(draftValue).trim()}
            className="task-primary-button border border-zinc-900 bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const resolverRef = useRef(null);
  const [dialog, setDialog] = useState(INITIAL_DIALOG);

  const closeDialog = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(INITIAL_DIALOG);
    resolve?.(result);
  }, []);

  const openDialog = useCallback((config) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setDialog({
      ...INITIAL_DIALOG,
      ...config,
      open: true,
    });
  }), []);

  const value = useMemo(() => ({
    alert: (message, options = {}) => openDialog({ ...options, type: 'alert', message }).then(() => undefined),
    confirm: (message, options = {}) => openDialog({ ...options, type: 'confirm', message }).then((result) => Boolean(result)),
    prompt: (message, options = {}) => openDialog({ ...options, type: 'prompt', message }).then((result) => {
      if (result === false || result === null || result === undefined) return null;
      return String(result);
    }),
  }), [openDialog]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <AppDialogHost
        dialog={dialog}
        onConfirm={(result) => closeDialog(result)}
        onCancel={() => closeDialog(dialog.type === 'confirm' ? false : null)}
      />
    </DialogContext.Provider>
  );
}

export function useAppDialogs() {
  const value = useContext(DialogContext);
  if (!value) throw new Error('useAppDialogs must be used within DialogProvider');
  return value;
}