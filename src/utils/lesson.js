export function slugify(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getBlockRef(block, index = 0) {
  return block.ref || block.id || slugify(block.title || block.question || block.instruction || `${block.type}-${index + 1}`);
}

export function getBlockLabel(block, index = 0) {
  return block.title || block.question || block.instruction || `${block.taskType || block.type} ${index + 1}`;
}

export function buildBlockMap(blocks = []) {
  const entries = [];
  const visit = (block) => {
    entries.push([getBlockRef(block), block]);
    if (block.children?.length) {
      block.children.forEach(visit);
    }
  };
  blocks.forEach(visit);
  return new Map(entries);
}

export function findLinkedBlock(blocks = [], block) {
  if (!block?.linkTo) return null;
  const map = buildBlockMap(blocks);
  return map.get(slugify(block.linkTo)) || map.get(block.linkTo) || null;
}

export function flattenBlocks(blocks = []) {
  const flat = [];
  const visit = (block) => {
    flat.push(block);
    if (block.children?.length) {
      block.children.forEach(visit);
    }
  };
  blocks.forEach(visit);
  return flat;
}

export function getTaskBlocks(blocks = []) {
  return flattenBlocks(blocks).filter((block) => block.type === 'task');
}

export function normalizeVisibleBlocks(blocks = []) {
  return getVisibleBlocks(Array.isArray(blocks) ? blocks : [])
    .map((block) => {
      if (block.type === 'group' || block.type === 'split_group') {
        return { ...block, children: normalizeVisibleBlocks(block.children || []) };
      }
      return block;
    })
    .filter((block) => (block.type !== 'group' && block.type !== 'split_group') || block.children.length > 0);
}

export function validateLessonStructure(lesson) {
  const issues = [];

  if (!lesson || typeof lesson !== 'object') {
    return { blocks: [], issues: ['Lesson data is missing.'] };
  }

  const blocks = normalizeVisibleBlocks(lesson.blocks || []);
  if (blocks.length === 0) issues.push('Lesson has no visible slides or tasks.');

  flattenBlocks(blocks).forEach((block, index) => {
    if (!block?.type) {
      issues.push(`Block ${index + 1} is missing a type.`);
      return;
    }
    if (block.type === 'task' && !block.taskType) {
      issues.push(`Task ${index + 1} is missing a task type.`);
    }
  });

  return { blocks, issues };
}

export function isGradableTask(block) {
  return block?.type === 'task' && !['random_wheel', 'open', 'cards', 'opinion_survey', 'scale', 'peer_review_checklist', 'pronunciation_shadowing'].includes(block.taskType);
}

export function getTaskPoints(block) {
  if (!block || block.type !== 'task') return 0;
  const value = Number(block.points);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
}

export function getVisibleBlocks(blocks = []) {
  return blocks.filter((block) => block.enabled !== false);
}
