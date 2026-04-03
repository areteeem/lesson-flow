/**
 * Quiz Import — parses pasted text or imported files into DSL blocks.
 *
 * Supported formats:
 * - Multiple choice with A) B) C) D), A. B. C. D., A: B: C: D:
 * - Multi-select with "(Select all that apply)" marker
 * - Open-ended / short answer (no options)
 * - Answer key sheet: "1. B" or "1: B" or "1) B"
 *
 * Supported file extensions: .txt, .md, .csv, .json, .tsv
 */

const QUESTION_START = /^(\d+)\.\s+(.+)/;
const OPTION_LINE = /^\s*([A-Z])[.):\s]\s*(.+)/;
const MULTI_SELECT_MARKER = /\(select\s+all\s+(that\s+)?apply\)/i;
const ANSWER_KEY_LINE = /^\s*(\d+)[.):\s]+\s*([A-Z](?:\s*,\s*[A-Z])*)\s*$/;

function trimLines(text) {
  return text.split('\n').map((l) => l.trimEnd());
}

/**
 * Parse pasted quiz text into an array of question objects.
 * Returns: { questions: [...], warnings: [] }
 */
export function parseQuizText(raw) {
  if (!raw || typeof raw !== 'string') return { questions: [], warnings: ['Empty input'] };

  const lines = trimLines(raw.trim());
  const questions = [];
  const warnings = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    if (!current.text.trim()) {
      warnings.push(`Question ${current.number}: empty question text`);
    }
    questions.push({ ...current });
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const qMatch = line.match(QUESTION_START);
    if (qMatch) {
      flush();
      const number = parseInt(qMatch[1], 10);
      let text = qMatch[2].trim();
      const isMultiSelect = MULTI_SELECT_MARKER.test(text);
      if (isMultiSelect) {
        text = text.replace(MULTI_SELECT_MARKER, '').trim();
      }
      current = {
        number,
        text,
        options: [],
        isMultiSelect,
        correctAnswers: [],
      };
      continue;
    }

    const optMatch = line.match(OPTION_LINE);
    if (optMatch && current) {
      current.options.push({
        letter: optMatch[1],
        text: optMatch[2].trim(),
      });
      continue;
    }

    // Continuation text for current question
    if (current && !optMatch) {
      current.text += ' ' + line.trim();
    }
  }
  flush();

  // Detect open-ended questions (no options)
  questions.forEach((q) => {
    if (q.options.length === 0) {
      q.type = 'open_ended';
    } else if (q.isMultiSelect) {
      q.type = 'multi_select';
    } else {
      q.type = 'multiple_choice';
    }
  });

  return { questions, warnings };
}

/**
 * Parse an answer key text.
 * Supported formats: "1. B", "1: B", "1) B", "1. A, C"
 * Returns: Map<number, string[]> (question number → correct option letters)
 */
export function parseAnswerKey(raw) {
  if (!raw || typeof raw !== 'string') return new Map();

  const lines = raw.trim().split('\n');
  const answers = new Map();

  for (const line of lines) {
    const match = line.trim().match(ANSWER_KEY_LINE);
    if (!match) continue;
    const num = parseInt(match[1], 10);
    const letters = match[2].split(/\s*,\s*/).map((l) => l.trim().toUpperCase());
    answers.set(num, letters);
  }

  return answers;
}

/**
 * Apply an answer key to parsed questions.
 */
export function applyAnswerKey(questions, answerKeyMap) {
  return questions.map((q) => {
    const key = answerKeyMap.get(q.number);
    if (!key || key.length === 0) return q;
    return {
      ...q,
      correctAnswers: key,
      isMultiSelect: key.length > 1 ? true : q.isMultiSelect,
      type: key.length > 1 ? 'multi_select' : q.type,
    };
  });
}

/**
 * Convert parsed questions to DSL text.
 */
export function questionsToDsl(questions) {
  const dslParts = [];

  for (const q of questions) {
    if (q.type === 'open_ended') {
      dslParts.push(
        `#TASK:SHORT_ANSWER`,
        `title: Question ${q.number}`,
        `question: ${q.text}`,
        `answer: `,
        '',
      );
      continue;
    }

    const taskType = q.type === 'multi_select' ? 'MULTI_SELECT' : 'MULTIPLE_CHOICE';
    const lines = [
      `#TASK:${taskType}`,
      `title: Question ${q.number}`,
      `question: ${q.text}`,
    ];

    const optionTexts = q.options.map((o) => o.text);
    lines.push(`options: ${optionTexts.join(' | ')}`);

    if (q.correctAnswers.length > 0) {
      const answerTexts = q.correctAnswers
        .map((letter) => q.options.find((o) => o.letter === letter)?.text)
        .filter(Boolean);
      if (answerTexts.length === 1) {
        lines.push(`answer: ${answerTexts[0]}`);
      } else if (answerTexts.length > 1) {
        lines.push(`answer: ${answerTexts.join(' | ')}`);
      }
    }

    lines.push('');
    dslParts.push(...lines);
  }

  return dslParts.join('\n');
}

/**
 * Read file contents based on extension.
 * Returns the raw text content.
 */
export function readImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Parse a JSON file with questions array.
 * Expected format: { questions: [{ text, options: ["A","B",...], answer: "B" }] }
 * Or array of objects.
 */
export function parseJsonQuestions(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { questions: [], warnings: ['Invalid JSON format'] };
  }

  const arr = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : [];
  if (arr.length === 0) return { questions: [], warnings: ['No questions found in JSON'] };

  const questions = arr.map((item, i) => {
    const num = item.number || i + 1;
    const text = item.text || item.question || '';
    const options = (item.options || []).map((opt, idx) => ({
      letter: String.fromCharCode(65 + idx),
      text: typeof opt === 'string' ? opt : opt.text || '',
    }));
    const correctAnswers = [];
    if (item.answer) {
      if (typeof item.answer === 'string') {
        // Check if it's a letter (A, B, C...) or full text
        if (/^[A-Z]$/.test(item.answer.trim())) {
          correctAnswers.push(item.answer.trim());
        } else {
          const match = options.find((o) => o.text === item.answer.trim());
          if (match) correctAnswers.push(match.letter);
        }
      }
      if (Array.isArray(item.answer)) {
        item.answer.forEach((a) => {
          if (/^[A-Z]$/.test(String(a).trim())) correctAnswers.push(String(a).trim());
          else {
            const match = options.find((o) => o.text === String(a).trim());
            if (match) correctAnswers.push(match.letter);
          }
        });
      }
    }

    return {
      number: num,
      text,
      options,
      isMultiSelect: correctAnswers.length > 1,
      correctAnswers,
      type: options.length === 0 ? 'open_ended' : correctAnswers.length > 1 ? 'multi_select' : 'multiple_choice',
    };
  });

  return { questions, warnings: [] };
}

/**
 * Parse CSV/TSV content.
 * Expected columns: question, optionA, optionB, optionC, optionD, answer
 */
export function parseCsvQuestions(raw, delimiter = ',') {
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return { questions: [], warnings: ['CSV must have a header row and at least one data row'] };

  // Skip header
  const questions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;

    const text = cols[0];
    const options = [];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let j = 1; j < Math.min(cols.length - 1, 7); j++) {
      if (cols[j]) {
        options.push({ letter: letters[j - 1] || String.fromCharCode(64 + j), text: cols[j] });
      }
    }

    const answerRaw = cols[cols.length - 1] || '';
    const correctAnswers = answerRaw.split(/\s*,\s*/)
      .map((a) => a.trim().toUpperCase())
      .filter((a) => /^[A-Z]$/.test(a));

    questions.push({
      number: i,
      text,
      options,
      isMultiSelect: correctAnswers.length > 1,
      correctAnswers,
      type: options.length === 0 ? 'open_ended' : correctAnswers.length > 1 ? 'multi_select' : 'multiple_choice',
    });
  }

  return { questions, warnings: [] };
}

/**
 * Master import function — detects format from file extension or defaults to text parsing.
 */
export async function importQuizFile(file) {
  const name = file.name.toLowerCase();
  const text = await readImportFile(file);

  if (name.endsWith('.json')) {
    return parseJsonQuestions(text);
  }
  if (name.endsWith('.csv')) {
    return parseCsvQuestions(text, ',');
  }
  if (name.endsWith('.tsv')) {
    return parseCsvQuestions(text, '\t');
  }
  // .txt, .md, or any other
  return parseQuizText(text);
}

/** Accepted file extensions for the file input */
export const ACCEPTED_QUIZ_EXTENSIONS = '.txt,.md,.csv,.tsv,.json';
