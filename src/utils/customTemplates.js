const CUSTOM_TEMPLATES_KEY = 'lesson-flow-custom-templates';

export function loadCustomTemplates() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomTemplates(templates) {
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // Ignore storage write failures so template workflows remain usable.
  }
}

export function addCustomTemplate(name, dsl) {
  const templates = loadCustomTemplates();
  templates.push({ id: crypto.randomUUID(), name, dsl, createdAt: Date.now() });
  saveCustomTemplates(templates);
}