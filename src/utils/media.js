export function resolveMediaSource(block) {
  if (!block || typeof block !== 'object') return '';
  return block.media || block.image || block.video || block.audio || block.url || block.src || '';
}
