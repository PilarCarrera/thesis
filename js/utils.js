import { DEFAULT_HL_COLOR } from './config.js';

export function hideElement(el) {
  if (!el) return;
  el.hidden = true;
  el.classList.remove('is-visible');
  el.style.display = 'none';
  el.style.left = '-9999px';
  el.style.top = '-9999px';
  el.style.transform = '';
}

export function showElement(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.add('is-visible');
  el.style.display = '';
}

export function getClosestMark(node) {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node.closest('mark');
  if (node.parentElement) return node.parentElement.closest('mark');
  return null;
}

export function truncate(text, maxLen) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}...`;
}

export function clearSelection() {
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

export function positionFixedCentered(el, rect, yOffset = 8) {
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.bottom + yOffset}px`;
  el.style.transform = 'translateX(-50%)';
}

export function sanitizeResponseHtml(html) {
  const allowedTags = new Set(['MARK', 'STRONG', 'U', 'EM', 'BR', 'P', 'UL', 'OL', 'LI']);
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstChild;
  if (!container) return '';

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }
    if (!allowedTags.has(node.tagName)) {
      const text = doc.createTextNode(node.textContent || '');
      node.replaceWith(text);
      return;
    }
    [...node.attributes].forEach((attr) => {
      const isMark = node.tagName === 'MARK';
      if (isMark && attr.name === 'style') return;
      node.removeAttribute(attr.name);
    });
    if (node.tagName === 'MARK') {
      const rawStyle = node.getAttribute('style') || '';
      const match = rawStyle.match(/background-color\s*:\s*#[0-9a-fA-F]{6,8}/);
      node.setAttribute('style', match ? match[0] : `background-color:${DEFAULT_HL_COLOR}`);
    }
    Array.from(node.childNodes).forEach(cleanNode);
  };

  Array.from(container.childNodes).forEach(cleanNode);
  return container.innerHTML;
}

export function stripHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.body.textContent || '';
}
