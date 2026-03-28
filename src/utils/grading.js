import { getTaskBlocks, isGradableTask, getBlockLabel, getTaskPoints } from './lesson';

export function normalizeScore(result) {
  if (!result) return 0;
  if (typeof result.score === 'number') return result.score;
  if (result.correct === true) return 1;
  if (result.correct === false) return 0;
  return 0;
}

export function fuzzySimilarity(left, right) {
  const a = (left || '').toString().trim().toLowerCase();
  const b = (right || '').toString().trim().toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const matrix = Array.from({ length: a.length + 1 }, (_, row) => Array.from({ length: b.length + 1 }, (_, col) => row === 0 ? col : col === 0 ? row : 0));
  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(matrix[row - 1][col] + 1, matrix[row][col - 1] + 1, matrix[row - 1][col - 1] + cost);
    }
  }
  return 1 - matrix[a.length][b.length] / Math.max(a.length, b.length, 1);
}

export function summarizeResults(blocks = [], results = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return {
      score: 0,
      earned: 0,
      total: 0,
      breakdown: [],
    };
  }
  const tasks = getTaskBlocks(blocks).filter((block) => block.enabled !== false);
  const gradable = tasks.filter(isGradableTask);
  const earned = gradable.reduce((total, block) => total + normalizeScore(results[block.id]) * getTaskPoints(block), 0);
  const total = gradable.reduce((sum, block) => sum + getTaskPoints(block), 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const breakdown = tasks.map((block, index) => {
    const result = results[block.id] || null;
    const points = isGradableTask(block) ? getTaskPoints(block) : 0;
    const weighted = normalizeScore(result) * points;
    return {
      id: block.id,
      label: getBlockLabel(block, index),
      taskType: block.taskType,
      correct: result?.correct ?? null,
      score: normalizeScore(result),
      weightedScore: weighted,
      points,
      result,
      block,
    };
  });
  return {
    score,
    earned,
    total,
    breakdown,
  };
}
