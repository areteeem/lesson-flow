import GroupBlock from './GroupBlock';
import GenericSlide from './GenericSlide';
import RichSlide from './RichSlide';
import Slide from './Slide';
import SplitView from './SplitView';
import StructureSlide from './StructureSlide';
import TableSlide from './TableSlide';
import TaskRenderer from './TaskRenderer';
import { findLinkedBlock } from '../utils/lesson';

function renderStandalone(block, results, onCompleteBlock, onProgressBlock, taskOptions) {
  if (!block) return null;
  if (block.type === 'slide') return <Slide block={block} />;
  if (block.type === 'rich') return <RichSlide block={block} />;
  if (block.type === 'structure') return <StructureSlide block={block} />;
  if (block.type === 'table') return <TableSlide block={block} />;
  if (!['slide', 'rich', 'structure', 'table', 'group', 'split_group', 'task'].includes(block.type)) return <GenericSlide block={block} />;
  if (block.type === 'group' || block.type === 'split_group') return <GroupBlock block={block} results={results} onCompleteChild={onCompleteBlock} />;
  if (block.type === 'task') {
    return (
      <TaskRenderer
        block={block}
        onComplete={(result) => onCompleteBlock?.(block.id, result)}
        onProgress={(result) => onProgressBlock?.(block.id, result)}
        existingResult={results?.[block.id]}
        allowRetry={taskOptions?.allowRetry !== false}
        showCheckButton={taskOptions?.showCheckButton !== false}
      />
    );
  }
  return null;
}

export default function LessonStage({ blocks = [], currentIndex = 0, results = {}, onCompleteBlock, onProgressBlock, emptyMessage = 'Nothing to show yet.', taskOptions = null }) {
  const current = blocks[currentIndex] || null;

  if (!current) {
    return <div className="flex min-h-[18rem] items-center justify-center border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500">{emptyMessage}</div>;
  }

  const linkedBlock = findLinkedBlock(blocks, current);
  const shouldSplitView = linkedBlock && current.type !== 'group' && current.type !== 'split_group';

  if (!shouldSplitView) {
    return renderStandalone(current, results, onCompleteBlock, onProgressBlock, taskOptions);
  }

  return current.type === 'task'
    ? <SplitView left={renderStandalone(linkedBlock, results, onCompleteBlock, onProgressBlock, taskOptions)} right={renderStandalone(current, results, onCompleteBlock, onProgressBlock, taskOptions)} />
    : <SplitView left={renderStandalone(current, results, onCompleteBlock, onProgressBlock, taskOptions)} right={renderStandalone(linkedBlock, results, onCompleteBlock, onProgressBlock, taskOptions)} />;
}