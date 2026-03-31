import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';
import CardsTask from './tasks/CardsTask';
import CategorizeTask from './tasks/CategorizeTask';
import ChoiceTask from './tasks/ChoiceTask';
import CollectionTask from './tasks/CollectionTask';
import BranchTask from './tasks/BranchTask';
import DragDropTask from './tasks/DragDropTask';
import DragMatchTask from './tasks/DragMatchTask';
import DragToBlankTask from './tasks/DragToBlankTask';
import GenericTask from './tasks/GenericTask';
import HighlightMistakeTask from './tasks/HighlightMistakeTask';
import MatrixTask from './tasks/MatrixTask';
import MediaPromptTask from './tasks/MediaPromptTask';
import OrderTask from './tasks/OrderTask';
import PuzzleJigsawTask from './tasks/PuzzleJigsawTask';
import RandomWheelTask from './tasks/RandomWheelTask';
import ReadingHighlightTask from './tasks/ReadingHighlightTask';
import ScaleTask from './tasks/ScaleTask';
import SelectAndCorrectTask from './tasks/SelectAndCorrectTask';
import TextEntryTask from './tasks/TextEntryTask';
import WordFamilyBuilderTask from './tasks/WordFamilyBuilderTask';
import WordCloudTask from './tasks/WordCloudTask';
import YouTubeTask from './tasks/YouTubeTask';
import DialogueTask from './tasks/DialogueTask';
import DialogueDragTask from './tasks/DialogueDragTask';
import DialogueReconstructTask from './tasks/DialogueReconstructTask';
import HighlightGlossaryTask from './tasks/HighlightGlossaryTask';
import TextLinkingTask from './tasks/TextLinkingTask';

const MAP = {
  multiple_choice: ChoiceTask,
  multi_select: ChoiceTask,
  true_false: ChoiceTask,
  yes_no: ChoiceTask,
  either_or: ChoiceTask,
  opinion_survey: ChoiceTask,
  scale: ScaleTask,
  input: TextEntryTask,
  enter: TextEntryTask,
  completion: TextEntryTask,
  open: TextEntryTask,
  error_correction: TextEntryTask,
  transform: TextEntryTask,
  fill_typing: TextEntryTask,
  short_answer: TextEntryTask,
  long_answer: TextEntryTask,
  flash_response: TextEntryTask,
  memory_recall: TextEntryTask,
  dialogue_completion: DialogueDragTask,
  dialogue_fill: DialogueTask,
  dialogue_reconstruct: DialogueReconstructTask,
  keyword_expand: TextEntryTask,
  type_in_blank: TextEntryTask,
  drag_to_blank: DragToBlankTask,
  drag_drop: DragDropTask,
  match: DragMatchTask,
  drag_match: DragMatchTask,
  matching_pairs_categories: CategorizeTask,
  emoji_symbol_match: DragMatchTask,
  build: OrderTask,
  order: OrderTask,
  timeline_order: OrderTask,
  sentence_builder: OrderTask,
  story_reconstruction: OrderTask,
  reading_highlight: ReadingHighlightTask,
  highlight: ReadingHighlightTask,
  highlight_differences: ReadingHighlightTask,
  highlight_mistake: HighlightMistakeTask,
  select_and_correct: SelectAndCorrectTask,
  random_wheel: RandomWheelTask,
  cards: CardsTask,
  categorize: CategorizeTask,
  categorize_grammar: CategorizeTask,
  audio_transcription: MediaPromptTask,
  video_questions: MediaPromptTask,
  image_labeling: MediaPromptTask,
  hotspot_selection: MediaPromptTask,
  map_geography_label: MediaPromptTask,
  image_compare_spot: MediaPromptTask,
  pronunciation_shadowing: MediaPromptTask,
  compare_contrast_table: MatrixTask,
  fill_grid: MatrixTask,
  fill_table_matrix: MatrixTask,
  table_reveal: MatrixTask,
  puzzle_jigsaw: PuzzleJigsawTask,
  choose_and_explain: BranchTask,
  scenario_decision: BranchTask,
  conditional_branch_questions: BranchTask,
  justify_order: BranchTask,
  peer_review_checklist: CollectionTask,
  word_family_builder: WordFamilyBuilderTask,
  word_cloud: WordCloudTask,
  youtube: YouTubeTask,
  highlight_glossary: HighlightGlossaryTask,
  text_linking: TextLinkingTask,
};

export default function TaskRenderer({ block, onComplete, onProgress, existingResult, allowRetry = true, showCheckButton = true }) {
  const Component = MAP[block.taskType];
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [lastResult, setLastResult] = useState(existingResult || null);
  const [hintsShown, setHintsShown] = useState(0);

  const hints = Array.isArray(block.hints) ? block.hints : block.hint ? [block.hint] : [];

  const handleComplete = (result) => {
    setLastResult(result);
    const nextFeedback = showCheckButton && typeof result?.correct === 'boolean'
      ? (result.correct ? 'correct' : 'wrong')
      : null;
    setFeedback(nextFeedback);
    setTimeout(() => setFeedback(null), 1200);
    onComplete?.(result);
  };

  const handleProgress = (result) => {
    setLastResult(result);
    onProgress?.(result);
  };

  const retry = () => {
    setAttempt((a) => a + 1);
    setLastResult(null);
    setFeedback(null);
    setHintsShown(0);
  };

  return (
    <div className="task-shell relative">
      {feedback && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ animation: 'pop 0.4s ease-out' }}>
          <div className={feedback === 'correct' ? 'flex h-20 w-20 items-center justify-center border-4 border-emerald-500 bg-emerald-50 text-3xl text-emerald-600' : 'flex h-20 w-20 items-center justify-center border-4 border-red-500 bg-red-50 text-3xl text-red-600'}>
            {feedback === 'correct' ? '✓' : '✗'}
          </div>
        </div>
      )}
      <div key={attempt}>
        <ErrorBoundary message={`Failed to render task: ${block.taskType}`}>
          {Component
            ? <Component block={block} onComplete={handleComplete} onProgress={handleProgress} existingResult={attempt === 0 ? existingResult : undefined} showCheckButton={showCheckButton} />
            : <GenericTask block={block} onComplete={handleComplete} onProgress={handleProgress} existingResult={attempt === 0 ? existingResult : undefined} showCheckButton={showCheckButton} />}
        </ErrorBoundary>
      </div>
      {(hints.length > 0 || (lastResult?.submitted && !lastResult?.correct)) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {hints.length > 0 && !lastResult?.submitted && (
            <button
              type="button"
              onClick={() => setHintsShown((h) => Math.min(h + 1, hints.length))}
              disabled={hintsShown >= hints.length}
              className="border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
            >
              💡 Hint {hintsShown > 0 ? `(${hintsShown}/${hints.length})` : ''}
            </button>
          )}
          {allowRetry && lastResult?.submitted && !lastResult?.correct && (
            <button type="button" onClick={retry} className="ml-auto border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-900 hover:text-zinc-900">↻ Try Again</button>
          )}
        </div>
      )}
      {hintsShown > 0 && (
        <div className="mt-2 space-y-1">
          {hints.slice(0, hintsShown).map((hint, i) => (
            <div key={i} className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{hint}</div>
          ))}
        </div>
      )}
    </div>
  );
}
