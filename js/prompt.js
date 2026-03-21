import { DEFAULT_HL_COLOR, LARF_PROMPT_URL } from './config.js';

let larfPromptText = '';

export async function loadLarfPrompt() {
  if (larfPromptText) return larfPromptText;
  try {
    const res = await fetch(LARF_PROMPT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    larfPromptText = (await res.text()).trim();
  } catch (err) {
    console.warn('Failed to load LARF prompt:', err);
    larfPromptText = '';
  }
  return larfPromptText;
}

export function buildSystemPrompt(settings, larfPrompt) {
  const paragraphsRule = {
    '1-2 lines': 'Keep paragraphs very short (about 1-2 lines, 1-2 sentences max).',
    '2-4 lines': 'Keep paragraphs short (about 2-4 lines, 2-3 sentences max).',
    '5-6 lines': 'Keep paragraphs moderate (about 5-6 lines, 3-5 sentences max).',
  }[settings.paragraphs] || 'Keep paragraphs short.';

  const wordingRule =
    settings.format === 'Professional wording'
      ? 'Use professional, academic wording.'
      : 'Use simple, everyday wording and avoid complex vocabulary.';

  const pointsRule =
    settings.points === 'Numbered points'
      ? 'If you need to enumerate items, prefer numbered lists.'
      : 'If you need to enumerate items, prefer bullet lists.';

  const highlightRule = settings.highlightsOn
    ? `Apply LARF annotations using only <mark>, <strong>, and <u>. Use <mark style="background-color:${DEFAULT_HL_COLOR};"> for highlights.`
    : 'Do not add any highlight/underline/bold tags beyond normal emphasis.';

  const larfBlock = settings.highlightsOn && larfPrompt ? `\n${larfPrompt}` : '';

  return [
    'This tool is designed for dyslexic students. Add extra spacing between paragraphs (insert blank lines between paragraphs).',
    'You are StudyBuddy. Answer using ONLY the information in the provided three pages.',
    'If the answer is not in those pages, say you do not have that information from the provided pages.',
    'Do not use outside knowledge.',
    'Respond in clean HTML using only <p>, <ul>, <ol>, <li>, <mark>, <strong>, <u>, <em>, and <br>.',
    'Use a few helpful emojis where they add clarity or encouragement.',
    paragraphsRule,
    wordingRule,
    pointsRule,
    highlightRule,
    larfBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildUserPrompt(userText, pendingContextText, pendingContextAction) {
  if (!pendingContextText) return userText;
  if (pendingContextAction === 'summary') {
    return `Summarize the selected text below.\nSelected text: ${pendingContextText}\nUser request: ${userText || 'Provide a concise summary.'}`;
  }
  if (pendingContextAction === 'read') {
    return `Explain the selected text below.\nSelected text: ${pendingContextText}\nUser request: ${userText || 'Explain it clearly.'}`;
  }
  return `Focus on the selected text below when answering.\nSelected text: ${pendingContextText}\nUser request: ${userText}`;
}
