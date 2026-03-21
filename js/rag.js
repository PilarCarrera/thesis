import { ragTextSources } from './config.js';

const ragTextCache = new Map();

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

async function fetchTextSource(url) {
  if (ragTextCache.has(url)) return ragTextCache.get(url);
  const res = await fetch(encodeURI(url));
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const html = await res.text();
  const text = htmlToText(html);
  ragTextCache.set(url, text);
  return text;
}

export async function getRagText() {
  const chunks = [];
  for (const url of ragTextSources) {
    try {
      const text = await fetchTextSource(url);
      if (text) chunks.push(text);
    } catch (err) {
      console.warn('RAG text load failed:', url, err);
    }
  }
  const combined = chunks.join('\n\n');
  if (combined.length <= 12000) return combined;
  return `${combined.slice(0, 12000)}...`;
}
