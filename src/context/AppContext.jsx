import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { loadLessons, loadSessions, saveLesson as storageSave, deleteLesson as storageDelete } from '../storage';

const AppContext = createContext(null);

const initialState = {
  lessons: [],
  sessions: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'REFRESH': {
      return { ...state, lessons: loadLessons(), sessions: loadSessions() };
    }
    case 'SAVE_LESSON': {
      const saved = storageSave(action.lesson);
      return { ...state, lessons: loadLessons(), currentSaved: saved };
    }
    case 'DELETE_LESSON': {
      storageDelete(action.id);
      return { ...state, lessons: loadLessons() };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    dispatch({ type: 'REFRESH' });
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

  const value = {
    lessons: state.lessons,
    sessions: state.sessions,
    refresh,
    saveLesson: saveLessonAction,
    deleteLesson: deleteLessonAction,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
