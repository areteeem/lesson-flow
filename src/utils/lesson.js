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

export function isGradableTask(block) {
  return block?.type === 'task' && !['random_wheel', 'open', 'cards'].includes(block.taskType);
}

export function getVisibleBlocks(blocks = []) {
  return blocks.filter((block) => block.enabled !== false);
}
