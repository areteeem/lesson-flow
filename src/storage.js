import DOMPurify from 'dompurify';
import { resolveCanonicalTaskType } from './config/taskRegistry';
import { loadScopedDomainData, saveScopedDomainData } from './utils/accountStorage';

function escapeHtml(value = '') {
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function flattenBlocks(blocks = []) {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children || [])]);
}

function migrateTaskBlock(block) {
  if (!block || block.type !== 'task') return block;
  const previousType = block.taskType;
  const canonicalType = resolveCanonicalTaskType(previousType);
  if (canonicalType === previousType) return block;

  const migrated = { ...block, taskType: canonicalType };

  if (canonicalType === 'multiple_choice' && (!Array.isArray(migrated.options) || migrated.options.length === 0)) {
    if (previousType === 'true_false') migrated.options = ['True', 'False'];
    if (previousType === 'yes_no') migrated.options = ['Yes', 'No'];
  }

  if (canonicalType === 'order' && (!Array.isArray(migrated.items) || migrated.items.length === 0) && previousType === 'dialogue_reconstruct') {
    migrated.items = String(migrated.text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return migrated;
}

function migrateLessonTasks(lesson) {
  if (!lesson || typeof lesson !== 'object') return lesson;
  const walk = (blocks = []) => blocks.map((block) => {
    const migrated = migrateTaskBlock({ ...block });
    if (Array.isArray(migrated.children) && migrated.children.length > 0) {
      return { ...migrated, children: walk(migrated.children) };
    }
    return migrated;
  });
  return { ...lesson, blocks: walk(Array.isArray(lesson.blocks) ? lesson.blocks : []) };
}

function describeBlock(block) {
  if (!block) return '';
  if (block.type === 'task') {
    const options = Array.isArray(block.options) && block.options.length > 0 ? `<ul>${block.options.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ul>` : '';
    const items = Array.isArray(block.items) && block.items.length > 0 ? `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
    const text = block.text ? `<p>${escapeHtml(block.text)}</p>` : '';
    const hint = block.hint ? `<p><strong>Hint:</strong> ${escapeHtml(block.hint)}</p>` : '';
    return `${text}${options}${items}${hint}`;
  }

  const content = [block.instruction, block.content, block.text].filter(Boolean).map((entry) => `<p>${escapeHtml(entry)}</p>`).join('');
  return content || '<p>No preview content.</p>';
}

function formatInlineMarkdown(text = '') {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function formatMarkdownToHtml(text = '') {
  const lines = text.split(/\r?\n/);
  const parts = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      parts.push(`<ul>${listItems.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join('')}</ul>`);
      listItems = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2));
      return;
    }
    flushList();
    if (trimmed.startsWith('## ')) {
      parts.push(`<h3>${formatInlineMarkdown(trimmed.slice(3))}</h3>`);
      return;
    }
    if (trimmed.startsWith('# ')) {
      parts.push(`<h2>${formatInlineMarkdown(trimmed.slice(2))}</h2>`);
      return;
    }
    if (trimmed.startsWith('> ')) {
      parts.push(`<blockquote>${formatInlineMarkdown(trimmed.slice(2))}</blockquote>`);
      return;
    }
    parts.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  });

  flushList();
  return parts.join('') || '<p>No preview content.</p>';
}

function chunkItems(items = [], size = 2) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function getLessonMetaItems(lesson = {}) {
  const settings = lesson.settings || {};
  return [
    settings.lessonTopic ? { label: 'Topic', value: settings.lessonTopic } : null,
    settings.grammarTopic ? { label: 'Grammar', value: settings.grammarTopic } : null,
    settings.focus ? { label: 'Focus', value: settings.focus } : null,
    settings.difficulty ? { label: 'Difficulty', value: settings.difficulty } : null,
    { label: 'Hints', value: settings.showHints === false ? 'Hidden' : 'Shown' },
    { label: 'Explanations', value: settings.showExplanations === false ? 'Hidden' : 'Shown' },
    { label: 'Blocks', value: String(flattenBlocks(lesson.blocks || []).length) },
  ].filter(Boolean);
}

function renderLessonMetaCards(lesson = {}) {
  const items = getLessonMetaItems(lesson);
  if (!items.length) return '';
  return `<section class="lesson-meta-grid">${items.map((item) => `<div class="lesson-meta-card"><div class="lesson-meta-label">${escapeHtml(item.label)}</div><div class="lesson-meta-value">${escapeHtml(item.value)}</div></div>`).join('')}</section>`;
}

function renderLessonMetaInline(lesson = {}) {
  const items = getLessonMetaItems(lesson);
  if (!items.length) return '';
  return `<div class="deck-meta">${items.map((item) => `<span><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</span>`).join('<span class="deck-meta-separator">•</span>')}</div>`;
}

function describeAnswer(block) {
  if (!block || block.type !== 'task') return 'N/A';
  if (Array.isArray(block.answer)) return escapeHtml(block.answer.join(', '));
  if (block.answer) return escapeHtml(block.answer);
  if (Array.isArray(block.targets) && block.targets.length > 0) return escapeHtml(block.targets.join(', '));
  if (Array.isArray(block.pairs) && block.pairs.length > 0) return block.pairs.map((pair) => `${escapeHtml(pair.left)} -> ${escapeHtml(pair.right)}`).join('<br/>');
  return 'Open response';
}

function renderStaticChoiceList(options = [], multiple = false) {
  if (!options.length) return '';
  return `<div class="choice-list">${options.map((option) => `<div class="choice-item"><span class="choice-mark">${multiple ? '&#9633;' : '&#9711;'}</span><span>${escapeHtml(option)}</span></div>`).join('')}</div>`;
}

function renderStaticLines(count = 2) {
  return `<div class="line-stack">${Array.from({ length: count }).map((_, index) => `<div class="answer-line${index === count - 1 ? ' short' : ''}"></div>`).join('')}</div>`;
}

function renderStaticTaskBody(block) {
  const promptText = block.text ? `<p>${escapeHtml(block.text)}</p>` : '';
  const hint = block.hint ? `<p class="hint">Hint: ${escapeHtml(block.hint)}</p>` : '';

  if (['multiple_choice', 'true_false', 'yes_no', 'either_or', 'opinion_survey'].includes(block.taskType)) {
    return `${promptText}${renderStaticChoiceList(block.options || [], false)}${hint}`;
  }

  if (block.taskType === 'multi_select') {
    return `${promptText}${renderStaticChoiceList(block.options || [], true)}${hint}`;
  }

  if (['short_answer', 'fill_typing', 'memory_recall', 'flash_response', 'keyword_expand', 'dialogue_completion', 'error_correction'].includes(block.taskType)) {
    return `${promptText}${renderStaticLines(2)}${hint}`;
  }

  if (['long_answer', 'audio_transcription'].includes(block.taskType)) {
    return `${promptText}${renderStaticLines(4)}${hint}`;
  }

  if (['drag_to_blank'].includes(block.taskType)) {
    return `${promptText}<div class="chip-row">${(block.blanks || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>${hint}`;
  }

  if (['match', 'drag_drop', 'drag_match', 'matching_pairs_categories', 'emoji_symbol_match'].includes(block.taskType)) {
    return `<div class="match-grid">${(block.pairs || []).map((pair) => `<div class="match-row"><span>${escapeHtml(pair.left)}</span><span class="arrow">→</span><span>${escapeHtml(pair.right || '_____')}</span></div>`).join('')}</div>${hint}`;
  }

  if (['order', 'timeline_order', 'sentence_builder', 'story_reconstruction', 'word_family_builder', 'peer_review_checklist'].includes(block.taskType)) {
    return `<div class="chip-row">${(block.items || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>${hint}`;
  }

  if (['categorize', 'categorize_grammar'].includes(block.taskType)) {
    return `<div class="chip-row">${(block.items || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div><div class="category-grid">${(block.categories || []).map((item) => `<div class="category-box"><div class="category-title">${escapeHtml(item)}</div><div class="category-body"></div></div>`).join('')}</div>${hint}`;
  }

  if (['fill_grid', 'fill_table_matrix', 'compare_contrast_table', 'puzzle_jigsaw'].includes(block.taskType)) {
    return `<table class="student-table"><tbody>${(block.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>${hint}`;
  }

  if (['video_questions', 'image_labeling', 'hotspot_selection', 'map_geography_label', 'image_compare_spot', 'pronunciation_shadowing'].includes(block.taskType)) {
    return `<div class="media-panel">${block.media ? `<div class="media-label">Media attached</div>` : ''}<div class="media-box"></div></div>${promptText}${renderStaticLines(2)}${hint}`;
  }

  if (block.taskType === 'random_wheel') {
    return `<div class="chip-row">${(block.items || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div><p class="hint">Spin topic deck for speaking. Printed as prompt list.</p>`;
  }

  if (['choose_and_explain', 'scenario_decision', 'conditional_branch_questions', 'justify_order'].includes(block.taskType)) {
    return `${promptText}${renderStaticChoiceList(block.options || ['Option A', 'Option B'], false)}${renderStaticLines(2)}${hint}`;
  }

  if (block.taskType === 'highlight_mistake' || block.taskType === 'select_and_correct') {
    return `${promptText}<p class="hint">Find and ${block.taskType === 'highlight_mistake' ? 'highlight' : 'correct'} the mistake in the text above.</p>${renderStaticLines(1)}${hint}`;
  }

  if (block.taskType === 'reading_highlight' || block.taskType === 'highlight_differences') {
    return `${promptText}<p class="hint">Find and highlight the target words: ${(block.targets || []).map((t) => escapeHtml(t)).join(', ')}</p>${hint}`;
  }

  if (block.taskType === 'highlight_glossary') {
    const translationHint = (block.pairs || []).length > 0
      ? `<p class="hint">Highlighted words can show translations in the glossary list.</p>`
      : '';
    return `${promptText}<p class="hint">Highlight key words in the text and collect them below.</p>${translationHint}${hint}`;
  }

  if (block.taskType === 'cards') {
    return `<div class="match-grid">${(block.pairs || block.cards || []).map((p) => `<div class="match-row"><span>${escapeHtml(p.front || p.left || '')}</span><span class="arrow">↔</span><span>${escapeHtml(p.back || p.right || '')}</span></div>`).join('')}</div>${hint}`;
  }

  if (block.taskType === 'table_reveal') {
    const rows = block.rows || [];
    const hidden = new Set(block.hiddenCells || []);
    return `<table class="student-table"><tbody>${rows.map((row, ri) => `<tr>${row.map((cell, ci) => `<td>${hidden.has(`${ri}:${ci}`) ? '___' : escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>${hint}`;
  }

  if (block.taskType === 'scale') {
    return `${promptText}<p class="hint">Rate from ${block.min || 1} to ${block.max || 10}</p>${renderStaticLines(1)}${hint}`;
  }

  return `${promptText}${renderStaticLines(2)}${hint}`;
}

export function loadLessons() {
  return loadScopedDomainData('lessons', [])
    .map((lesson) => migrateLessonTasks(lesson))
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

export function saveLesson(lesson) {
  const normalizedLesson = migrateLessonTasks(lesson);
  const lessons = loadLessons();
  const existingIndex = lessons.findIndex((entry) => entry.id === normalizedLesson.id);
  const payload = {
    ...normalizedLesson,
    updatedAt: Date.now(),
  };
  if (existingIndex >= 0) {
    payload.createdAt = lessons[existingIndex].createdAt;
    lessons[existingIndex] = payload;
  } else {
    payload.createdAt = Date.now();
    lessons.unshift(payload);
  }
  saveScopedDomainData('lessons', lessons, { updatedAt: payload.updatedAt });
  return payload;
}

export function deleteLesson(id) {
  saveScopedDomainData('lessons', loadLessons().filter((lesson) => lesson.id !== id));
}

export function loadSessions() {
  return loadScopedDomainData('sessions', []).sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
}

export function saveSession(session) {
  const sessions = loadSessions();
  const payload = {
    ...session,
    id: session.id || crypto.randomUUID(),
    timestamp: session.timestamp || Date.now(),
  };
  const existingIndex = sessions.findIndex((entry) => entry.id === payload.id);
  if (existingIndex >= 0) {
    sessions[existingIndex] = payload;
  } else {
    sessions.unshift(payload);
  }
  saveScopedDomainData('sessions', sessions, { updatedAt: payload.timestamp || Date.now() });
  return payload;
}

export function deleteSession(id) {
  saveScopedDomainData('sessions', loadSessions().filter((session) => session.id !== id));
}

// ─── Folders ──────────────────────────────────
export function loadFolders() {
  return loadScopedDomainData('folders', []);
}

export function saveFolders(folders) {
  saveScopedDomainData('folders', folders);
}

// ─── Student profiles ─────────────────────────
export function loadStudentProfiles() {
  return loadScopedDomainData('students', []);
}

export function saveStudentProfile(profile) {
  const profiles = loadStudentProfiles();
  const idx = profiles.findIndex((p) => p.name === profile.name);
  if (idx >= 0) profiles[idx] = { ...profiles[idx], ...profile };
  else profiles.push(profile);
  saveScopedDomainData('students', profiles);
}

export function deleteStudentProfile(name) {
  saveScopedDomainData('students', loadStudentProfiles().filter((p) => p.name !== name));
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportLesson(lesson) {
  downloadJson(`${(lesson.title || 'lesson').replace(/\s+/g, '_')}.json`, lesson);
}

export function printLessonReport(lesson) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  const metaCards = renderLessonMetaCards(lesson);
  const cards = flattenBlocks(lesson.blocks || []).map((block, index) => `
    <article class="card">
      <div class="card-meta">${index + 1} · ${escapeHtml(block.taskType || block.type)}</div>
      <h2>${escapeHtml(block.title || block.question || block.instruction || `Block ${index + 1}`)}</h2>
      <div class="card-grid">
        <section>
          <div class="section-label">Prompt</div>
          <div class="section-body">${block.type === 'task' ? renderStaticTaskBody(block) : formatMarkdownToHtml([block.instruction, block.content, block.text].filter(Boolean).join('\n\n'))}</div>
        </section>
        <section>
          <div class="section-label">Answer Key</div>
          <div class="section-body answer">${describeAnswer(block)}</div>
        </section>
      </div>
    </article>
  `).join('');
  const html = `<!doctype html><html><head><title>${escapeHtml(lesson.title)}</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;padding:0;color:#111;background:#f5f5f4}main{padding:24px}h1{margin:0 0 8px;font-size:30px}.muted{color:#666;font-size:14px}.lesson-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.lesson-meta-card{border:1px solid #ddd;background:#fff;padding:12px}.lesson-meta-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#666}.lesson-meta-value{margin-top:6px;font-size:16px;font-weight:600}.card{break-inside:avoid;border:1px solid #ddd;background:#fff;padding:18px;margin-top:16px}.card-meta{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#666}.card h2{margin:8px 0 14px;font-size:20px}.card-grid{display:grid;grid-template-columns:1.4fr 0.9fr;gap:16px}.section-label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#666;margin-bottom:8px}.section-body{font-size:13px;line-height:1.45}.section-body.answer{border:1px solid #e4e4e7;background:#fafafa;padding:10px}.section-body p,.section-body ul{margin:0 0 8px}.section-body ul{padding-left:18px}.section-body h2,.section-body h3{margin:0 0 8px;font-size:15px}.section-body blockquote{margin:0 0 10px;padding-left:10px;border-left:2px solid #d4d4d8;color:#444}.section-body code{padding:1px 4px;background:#f3f4f6}.choice-list,.line-stack,.match-grid,.category-grid{margin-top:8px}.choice-item,.match-row{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #ececec}.choice-mark{display:inline-block;min-width:16px}.arrow{color:#666}.line-stack{display:grid;gap:6px}.answer-line{height:14px;border-bottom:1px solid #7a7a7a}.answer-line.short{width:55%}.chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chip{display:inline-flex;align-items:center;border:1px solid #d4d4d8;padding:4px 8px;background:#fafafa}.category-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}.category-box{border:1px solid #d4d4d8;min-height:56px;padding:6px}.category-title{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666;margin-bottom:6px}.category-body{height:22px;border-top:1px dashed #d4d4d8}.student-table{width:100%;border-collapse:collapse;margin-top:8px}.student-table td{border:1px solid #d4d4d8;padding:6px;vertical-align:top}.media-panel{margin-top:8px;margin-bottom:8px}.media-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666;margin-bottom:4px}.media-box{height:42px;border:1px solid #d4d4d8;background:#fafafa}.hint{margin-top:8px;color:#666;font-size:11px}</style></head><body><main><h1>${escapeHtml(lesson.title || 'Teacher Lesson Report')}</h1><div class="muted">Teacher view with prompt structure, printable support, and answer key.</div>${metaCards}${cards}</main></body></html>`;
  popup.document.write(DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'] }));
  popup.document.close();
  popup.focus();
  popup.print();
}

export function printStudentLesson(lesson) {
  const popup = window.open('', '_blank', 'width=1200,height=800');
  if (!popup) return;
  const flatBlocks = flattenBlocks(lesson.blocks || []);
  const deckMeta = renderLessonMetaInline(lesson);
  const sheets = chunkItems(flatBlocks, 2).map((sheetBlocks, sheetIndex) => {
    const frames = sheetBlocks.map((block, index) => {
      const absoluteIndex = sheetIndex * 2 + index;
      const title = escapeHtml(block.title || block.question || `${block.taskType || block.type} ${absoluteIndex + 1}`);
      const prompt = block.type === 'task' ? renderStaticTaskBody(block) : formatMarkdownToHtml([block.instruction, block.content, block.text].filter(Boolean).join('\n\n'));
      return `<article class="frame"><div class="page-meta">${absoluteIndex + 1} / ${flatBlocks.length} · ${escapeHtml(block.taskType || block.type)}</div><h2>${title}</h2><div class="page-body">${prompt}</div></article>`;
    }).join('');
    return `<section class="sheet">${frames}</section>`;
  }).join('');
  const studentHtml = `<!doctype html><html><head><title>${escapeHtml(lesson.title)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;background:#f4f4f2;margin:0}.deck{padding:6px}.deck-header{border:1.5px solid #111;background:#fff;padding:7mm 9mm;margin-bottom:8mm}.deck-header h1{margin:0 0 6px;font-size:24px}.deck-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#444}.deck-meta-separator{color:#999}.sheet{break-after:page;display:grid;grid-template-rows:1fr 1fr;gap:8mm;min-height:190mm}.sheet:last-child{break-after:auto}.frame{border:1.5px solid #111;background:#fff;padding:10mm 11mm 8mm;overflow:hidden;min-height:0}.page-meta{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#666}.frame h2{margin:6px 0 10px;font-size:19px;line-height:1.2}.page-body{font-size:13px;line-height:1.4}.page-body h2,.page-body h3{margin:0 0 8px;font-size:16px;line-height:1.25}.page-body p{margin:0 0 8px}.page-body ul{margin:0 0 10px;padding-left:18px}.page-body blockquote{margin:0 0 10px;padding-left:10px;border-left:2px solid #d4d4d8;color:#444}.page-body code{padding:1px 4px;background:#f3f4f6}.choice-list,.line-stack,.match-grid,.category-grid{margin-top:8px}.choice-item,.match-row{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #ececec}.choice-mark{display:inline-block;min-width:16px}.arrow{color:#666}.line-stack{display:grid;gap:6px}.answer-line{height:14px;border-bottom:1px solid #7a7a7a}.answer-line.short{width:55%}.chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chip{display:inline-flex;align-items:center;border:1px solid #d4d4d8;padding:4px 8px;background:#fafafa}.category-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}.category-box{border:1px solid #d4d4d8;min-height:56px;padding:6px}.category-title{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666;margin-bottom:6px}.category-body{height:22px;border-top:1px dashed #d4d4d8}.student-table{width:100%;border-collapse:collapse;margin-top:8px}.student-table td{border:1px solid #d4d4d8;padding:6px;vertical-align:top;min-height:22px}.media-panel{margin-top:8px;margin-bottom:8px}.media-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666;margin-bottom:4px}.media-box{height:42px;border:1px solid #d4d4d8;background:#fafafa}.hint{margin-top:8px;color:#666;font-size:11px}</style></head><body><div class="deck"><header class="deck-header"><h1>${escapeHtml(lesson.title || 'Student Lesson Deck')}</h1>${deckMeta}</header>${sheets}</div></body></html>`;
  popup.document.write(DOMPurify.sanitize(studentHtml, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'] }));
  popup.document.close();
  popup.focus();
  popup.print();
}

export function exportSession(session) {
  downloadJson(`${(session.lessonTitle || 'lesson')}-${session.studentName || 'session'}.json`.replace(/\s+/g, '_'), session);
}

function formatStudentResponse(result) {
  const response = result?.response;
  if (response === null || typeof response === 'undefined') return 'No answer submitted';
  if (typeof response === 'string') return escapeHtml(response);
  if (typeof response === 'number' || typeof response === 'boolean') return escapeHtml(String(response));
  if (Array.isArray(response)) return escapeHtml(response.join(' | '));
  try {
    return escapeHtml(JSON.stringify(response));
  } catch {
    return 'Structured response';
  }
}

export function printSessionReport(session, options = {}) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  const visibilityPolicy = options.visibilityPolicy || 'full_answers';
  const showCorrectness = visibilityPolicy !== 'student_answers_only';
  const showFeedback = visibilityPolicy === 'full_answers';
  const scoreLabel = showCorrectness ? 'Score' : 'Answer';
  const detailLabel = showFeedback ? 'Feedback' : (showCorrectness ? 'Status' : 'Submitted');
  const sessionHtml = `<!doctype html><html><head><title>${escapeHtml(session.lessonTitle)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin:0 0 8px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}.summary-card{border:1px solid #ddd;padding:12px;background:#fafafa}.summary-card .label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#666}.summary-card .value{margin-top:6px;font-size:24px;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}th{background:#f7f7f7}.muted{color:#666;font-size:14px}</style></head><body><h1>${escapeHtml(session.lessonTitle)}</h1><div class="muted">Student: ${escapeHtml(session.studentName || 'Unknown')} | Score: ${session.score}% | ${new Date(session.timestamp).toLocaleString()}</div><section class="summary"><div class="summary-card"><div class="label">Correct</div><div class="value">${session.correctCount ?? '-'}</div></div><div class="summary-card"><div class="label">Reviewed</div><div class="value">${session.completedCount ?? '-'}</div></div><div class="summary-card"><div class="label">Graded</div><div class="value">${session.total ?? '-'}</div></div><div class="summary-card"><div class="label">Earned</div><div class="value">${session.earned ?? '-'}</div></div></section><table><thead><tr><th>Task</th><th>${scoreLabel}</th><th>${detailLabel}</th></tr></thead><tbody>${(session.breakdown || []).map((entry) => `<tr><td>${escapeHtml(entry.label)}</td><td>${showCorrectness ? `${Math.round((entry.score || 0) * 100)}%` : formatStudentResponse(entry.result)}</td><td>${showFeedback ? escapeHtml(entry.result?.feedback || '') : (entry.correct === true ? 'Correct' : entry.correct === false ? 'Incorrect' : 'Submitted')}</td></tr>`).join('')}</tbody></table></body></html>`;
  popup.document.write(DOMPurify.sanitize(sessionHtml, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'] }));
  popup.document.close();
  popup.focus();
  popup.print();
}

export function importLesson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        resolve(migrateLessonTasks(JSON.parse(event.target.result)));
      } catch {
        reject(new Error('Invalid lesson file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

export function importDsl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        resolve(event.target.result?.toString() || '');
      } catch {
        reject(new Error('Invalid DSL file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
