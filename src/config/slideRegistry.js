export const SLIDE_REGISTRY = [
  { type: 'slide', label: 'Single Column Text', layout: 'single' },
  { type: 'rich', label: 'Rich Text Slide', layout: 'single' },
  { type: 'structure', label: 'Structure Slide', layout: 'single' },
  { type: 'table', label: 'Table / Grid Slide', layout: 'table' },
  { type: 'two_column_text_task', label: 'Two-Column Text + Task', layout: 'split' },
  { type: 'image_task', label: 'Image + Task', layout: 'media_split' },
  { type: 'video_task', label: 'Video + Task', layout: 'media_split' },
  { type: 'carousel', label: 'Carousel / Multi-Page', layout: 'carousel' },
  { type: 'group_task_slide', label: 'Group Task Slide', layout: 'group' },
  { type: 'step_by_step', label: 'Step-by-Step Slide', layout: 'stepper' },
  { type: 'focus', label: 'Highlight / Focus Slide', layout: 'focus' },
  { type: 'flashcard_slide', label: 'Flashcard Slide', layout: 'cards' },
  { type: 'scenario', label: 'Scenario / Dialogue Slide', layout: 'scenario' },
  { type: 'map_diagram', label: 'Map / Diagram Slide', layout: 'media' },
  { type: 'split_group', label: 'Split Group (Side-by-Side)', layout: 'split' },
];

export const SLIDE_TYPE_MAP = Object.fromEntries(SLIDE_REGISTRY.map((entry) => [entry.type, entry]));

export function getSlideDefinition(type) {
  return SLIDE_TYPE_MAP[type] || { type, label: type, layout: 'single' };
}

export function slideRegexEntries() {
  return SLIDE_REGISTRY.filter((entry) => entry.type !== 'slide').map((entry) => ({
    regex: new RegExp(`^#SLIDE:\\s*${entry.type.replace(/_/g, '[_\\s-]*').toUpperCase()}$`, 'i'),
    type: entry.type,
  }));
}