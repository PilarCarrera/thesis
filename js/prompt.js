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

export function buildSystemPrompt(settings, larfPrompt, pageLabel = 'the current page') {
  const paragraphLimits = {
    '1-2 lines': 2,
    '2-4 lines': 4,
    '5-6 lines': 6,
  };
  const maxLines = paragraphLimits[settings.paragraphs] || 4;
  const paragraphsRule = `Target length: about ${maxLines} lines maximum when possible. If the user asks for more detail, prioritize a complete answer and do not cut it off.`;

  const wordingRule =
    settings.format === 'Professional wording'
      ? 'Use professional, academic wording.'
      : 'Use simple, everyday wording and avoid complex vocabulary.';

  const pointsRule =
    settings.points === 'Numbered points'
      ? 'If a list is required, use a numbered list (<ol><li>...).'
      : 'If a list is required, use a bullet list (<ul><li>...).';

  const highlightRule = settings.highlightsOn
    ? `Apply LARF annotations using only <mark>, <strong>, and <u>. Use <mark style="background-color:${DEFAULT_HL_COLOR};"> for highlights.`
    : 'Do not add any highlight/underline/bold tags beyond normal emphasis.';

  const larfBlock = settings.highlightsOn && larfPrompt ? `\n${larfPrompt}` : '';

  return [
    'This tool is designed for dyslexic students. Add extra spacing between paragraphs (insert blank lines between paragraphs).',
    `You are StudyBuddy. Answer using ONLY the information in ${pageLabel}.`,
    `If the answer is not in ${pageLabel}, respond with this message using LARF tags: "I don't know. It's not from the selected text. Ask me something from the text and I will reply! :)"`,
    'If the question is subjective, unclear, or not grounded in the text, respond with a clarification request using LARF tags.',
    'Never add background knowledge or inferred details beyond the provided context.',
    'If the user asks for N items, return exactly N items.',
    'When the user asks for characteristics, features, traits, effects, reasons, steps, or points, always respond as a list.',
    'Keep answers short and if it can be replied in one line, better, do not give extra information if not necessary.',
    'Keep answers under 90 words unless the user explicitly asks for more detail.',
    'Do not use outside knowledge.',
    'Respond in clean HTML using only <p>, <ul>, <ol>, <li>, <mark>, <strong>, <u>, <em>, and <br>.',
    'After your complete HTML answer, on a new line add one <cite>...</cite> tag per distinct passage you used. Use a separate tag for each non-adjacent excerpt. Plain text only inside each tag, no HTML. Example: <cite>first sentence from context</cite><cite>different sentence from a later paragraph</cite>',
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

function requiresList(userText) {
  const text = (userText || '').toLowerCase();
  if (!text) return false;
  if (/\b(list|enumerate|bullet|numbered|steps|points)\b/.test(text)) return true;
  if (/\bcharacteristics\b|\bfeatures\b|\btraits\b/.test(text)) return true;
  if (/\b\d+\b/.test(text) && /\b(items|points|reasons|characteristics|features|traits)\b/.test(text)) {
    return true;
  }
  return false;
}

export function buildUserPrompt(userText, pendingContextText, pendingContextAction) {
  const listHint = requiresList(userText)
    ? '\n\nReturn the answer as a list, matching the user selected points setting.'
    : '';
  if (!pendingContextText) return `${userText}${listHint}`;
  if (pendingContextAction === 'summary') {
    return `Summarize the selected text below.\nSelected text: ${pendingContextText}\nUser request: ${
      userText || 'Provide a concise summary.'
    }${listHint}`;
  }
  if (pendingContextAction === 'read') {
    return `Explain the selected text below.\nSelected text: ${pendingContextText}\nUser request: ${
      userText || 'Explain it clearly.'
    }${listHint}`;
  }
  return `Focus on the selected text below when answering.\nSelected text: ${pendingContextText}\nUser request: ${userText}${listHint}`;
}
