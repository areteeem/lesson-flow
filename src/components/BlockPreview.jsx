import GenericSlide from './GenericSlide';
import GroupBlock from './GroupBlock';
import RichSlide from './RichSlide';
import Slide from './Slide';
import StructureSlide from './StructureSlide';
import TableSlide from './TableSlide';
import TaskRenderer from './TaskRenderer';

export default function BlockPreview({ block }) {
  if (!block) return null;
  if (block.type === 'slide') return <Slide block={block} />;
  if (block.type === 'rich') return <RichSlide block={block} />;
  if (block.type === 'structure') return <StructureSlide block={block} />;
  if (block.type === 'table') return <TableSlide block={block} />;
  if (block.type === 'group') return <GroupBlock block={block} results={{}} onCompleteChild={() => {}} />;
  if (block.type === 'split_group') return <GroupBlock block={{ ...block, layout: 'split' }} results={{}} onCompleteChild={() => {}} />;
  if (block.type === 'task') return <TaskRenderer block={block} onComplete={() => {}} />;
  return <GenericSlide block={block} />;
}
