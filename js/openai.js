import { OPENAI_MODEL, OPENAI_PROXY_URL } from './config.js';
import { getRagText } from './rag.js';
import { loadLarfPrompt, buildSystemPrompt, buildUserPrompt } from './prompt.js';

function parseCitation(rawText) {
  const matches = [...rawText.matchAll(/<cite>([\s\S]*?)<\/cite>/gi)];
  const citations = matches
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const text = rawText.replace(/<cite>[\s\S]*?<\/cite>/gi, '').trim();
  return { text, citations };
}

export async function callOpenAI(userText, settings, contextState, pageKey, pageLabel) {
  const larfPrompt = await loadLarfPrompt();
  const systemPrompt = buildSystemPrompt(settings, larfPrompt, pageLabel);
  const ragText = contextState.pendingContextText
    ? contextState.pendingContextText
    : await getRagText(pageKey);

  const contextLabel = contextState.pendingContextText ? 'the selected text' : pageLabel;
  const contextBlock = ragText ? `\n\nContext from ${contextLabel}:\n${ragText}` : '';
  const userContent = [
    {
      type: 'input_text',
      text: `${buildUserPrompt(
        userText,
        contextState.pendingContextText,
        contextState.pendingContextAction
      )}${contextBlock}`,
    },
  ];

  const payload = {
    model: OPENAI_MODEL,
    instructions: systemPrompt,
    input: [
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed && parsed.error && parsed.error.message) detail = parsed.error.message;
    } catch (e) {
      // Keep raw text if it's not JSON.
    }
    throw new Error(`OpenAI error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  let rawText = '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    rawText = data.output_text.trim();
  } else if (Array.isArray(data.output)) {
    const textParts = [];
    data.output.forEach((item) => {
      if (Array.isArray(item.content)) {
        item.content.forEach((part) => {
          if (part.type === 'output_text') textParts.push(part.text || '');
        });
      }
    });
    rawText = textParts.join('\n').trim();
  }

  const { text, citations } = parseCitation(rawText);
  return {
    text: text || 'I could not generate a response from the provided pages.',
    source: contextLabel,
    citations,
  };
}
