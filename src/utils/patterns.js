/** Blank marker patterns used across task components and parser */
export const BLANK_MARKER_RE = /(\{\}|_{3,}|\[blank\]|\[\d+\])/i;

/** Blank marker pattern that also captures answer tokens like {answer} */
export const BLANK_WITH_ANSWER_RE = /(\{[^}]+\}|\{\}|_{3,}|\[blank\]|\[\d+\])/i;
