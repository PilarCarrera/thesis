import { pageToFragmentUrl } from './config.js';

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

export async function getPageText(pageKey) {
  const url = pageToFragmentUrl[pageKey];
  if (!url) return '';
  try {
    const text = await fetchTextSource(url);
    return text || '';
  } catch (err) {
    console.warn('RAG text load failed:', url, err);
    return '';
  }
}

export async function getAllPageTexts() {
  const entries = await Promise.all(
    Object.keys(pageToFragmentUrl).map(async (key) => {
      const text = await getPageText(key);
      return [key, text];
    })
  );
  return Object.fromEntries(entries);
}

export async function getRagText(pageKey) {
  const url = pageToFragmentUrl[pageKey];
  if (!url) return '';
  try {
    const text = await fetchTextSource(url);
    if (!text) return '';
    if (text.length <= 12000) return text;
    return `${text.slice(0, 12000)}...`;
  } catch (err) {
    console.warn('RAG text load failed:', url, err);
    return '';
  }
}
