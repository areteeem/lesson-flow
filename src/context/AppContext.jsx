import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { loadLessons, loadSessions, saveLesson as storageSave, deleteLesson as storageDelete, deleteSession as storageDeleteSession, loadFolders, saveFolders as storageSaveFolders } from '../storage';
import { hydrateSessionUser, subscribeSessionUser } from '../utils/accountAuth';
import { syncAccountDataBidirectional } from '../utils/accountCloudSync';
import { getActiveAccountScopeId, seedScopeFromLocal } from '../utils/accountStorage';

const AppContext = createContext(null);

const initialState = {
  lessons: [],
  sessions: [],
  folders: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'REFRESH': {
      return { ...state, lessons: loadLessons(), sessions: loadSessions(), folders: loadFolders() };
    }
    case 'SAVE_LESSON': {
      const saved = storageSave(action.lesson);
      return { ...state, lessons: loadLessons(), currentSaved: saved };
    }
    case 'DELETE_LESSON': {
      storageDelete(action.id);
      return { ...state, lessons: loadLessons() };
    }
    case 'DELETE_SESSION': {
      storageDeleteSession(action.id);
      return { ...state, sessions: loadSessions() };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      await hydrateSessionUser();
      seedScopeFromLocal(getActiveAccountScopeId());
      await syncAccountDataBidirectional({ source: 'startup' });
      if (active) {
        dispatch({ type: 'REFRESH' });
      }
    };

    void bootstrap();

    const unsubscribe = subscribeSessionUser(() => {
      seedScopeFromLocal(getActiveAccountScopeId());
      void syncAccountDataBidirectional({ source: 'account-change' }).finally(() => {
        if (active) {
          dispatch({ type: 'REFRESH' });
        }
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(() => dispatch({ type: 'REFRESH' }), []);

  const saveLessonAction = useCallback((lesson) => {
    const saved = storageSave(lesson);
    dispatch({ type: 'REFRESH' });
    return saved;
  }, []);

  const deleteLessonAction = useCallback((id) => {
    dispatch({ type: 'DELETE_LESSON', id });
  }, []);

  const deleteSessionAction = useCallback((id) => {
    dispatch({ type: 'DELETE_SESSION', id });
  }, []);

  const saveFoldersAction = useCallback((folders) => {
    storageSaveFolders(folders);
    dispatch({ type: 'REFRESH' });
  }, []);

  const value = {
    lessons: state.lessons,
    sessions: state.sessions,
    folders: state.folders,
    refresh,
    saveLesson: saveLessonAction,
    deleteLesson: deleteLessonAction,
    deleteSession: deleteSessionAction,
    saveFolders: saveFoldersAction,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
