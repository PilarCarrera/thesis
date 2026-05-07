import {
  highlightPaletteColors,
  pageToFragmentUrl,
  DEFAULT_HL_COLOR,
} from './config.js';
import {
  hideElement,
  showElement,
  getClosestMark,
  truncate,
  clearSelection,
  positionFixedCentered,
} from './utils.js';
import { showChatContext } from './chat.js';
import { isLeftHighlightEnabled } from './appMode.js';

const contentEl = document.getElementById('reformattedContent');
const highlightPaletteEl = document.getElementById('highlightPalette');
const selectionMenu = document.getElementById('selectionMenu');
const highlightMenu = document.getElementById('highlightMenu');
const colorPickerMenu = document.getElementById('colorPickerMenu');
const pageDrawerItems = document.querySelectorAll('[data-page-drawer]');
const leftModeInputs = document.querySelectorAll('input[name="leftMode"]');

let activeMarkForColorChange = null;
let markIdCounter = 0;
let selectionActive = false;
const pageHtmlCache = new Map();

export function hideAllFloatingMenus() {
  hideElement(selectionMenu);
  hideElement(highlightMenu);
  hideElement(colorPickerMenu);
  activeMarkForColorChange = null;
}

function indexMarks() {
  if (!contentEl) return;
  const marks = contentEl.querySelectorAll('mark');
  markIdCounter = 0;
  marks.forEach((mark) => {
    const id = `hl_${markIdCounter++}`;
    mark.dataset.hlId = id;
    const inlineColor = mark.style.backgroundColor;
    const colorToUse = inlineColor ? inlineColor : DEFAULT_HL_COLOR;
    mark.dataset.hlColor = colorToUse;
    if (!inlineColor) mark.style.backgroundColor = colorToUse;
  });
}

function unwrapMark(mark) {
  if (!mark || !mark.parentNode) return;
  const parent = mark.parentNode;
  const frag = document.createDocumentFragment();
  while (mark.firstChild) frag.appendChild(mark.firstChild);
  parent.replaceChild(frag, mark);
}

function unwrapElement(el) {
  if (!el || !el.parentNode) return;
  const parent = el.parentNode;
  const frag = document.createDocumentFragment();
  while (el.firstChild) frag.appendChild(el.firstChild);
  parent.replaceChild(frag, el);
}

function unwrapAll(container, selector) {
  if (!container) return;
  const nodes = Array.from(container.querySelectorAll(selector));
  nodes.forEach((node) => unwrapElement(node));
}

function getLeftMode() {
  const checked = Array.from(leftModeInputs || []).find((input) => input.checked);
  return checked ? checked.value : 'larf';
}

function syncRawFromDom() {
  if (!contentEl) return;
  if (getLeftMode() !== 'larf') return;
  // Strip citation highlights before caching — they're temporary overlays, not user edits
  const citationEls = Array.from(contentEl.querySelectorAll('.citation-hl-para'));
  citationEls.forEach((el) => el.classList.remove('citation-hl-para'));
  contentEl.dataset.rawHtml = contentEl.innerHTML;
  const pageKey = contentEl.dataset.currentPage;
  if (pageKey) pageHtmlCache.set(pageKey, contentEl.dataset.rawHtml);
  citationEls.forEach((el) => el.classList.add('citation-hl-para'));
}

function renderContentFromRaw() {
  if (!contentEl) return;
  const raw = contentEl.dataset.rawHtml || '';
  contentEl.innerHTML = raw;

  const pageKey = contentEl.dataset.currentPage || 'pageBook1';
  if (!isLeftHighlightEnabled(pageKey)) {
    unwrapAll(contentEl, 'mark');
    unwrapAll(contentEl, 'strong');
    unwrapAll(contentEl, 'u');
  }

  indexMarks();
  clearSelection();
  hideAllFloatingMenus();
}

function setMarkColor(mark, color) {
  if (!mark) return;
  mark.style.backgroundColor = color;
  mark.dataset.hlColor = color;
  syncRawFromDom();
}

function buildHighlightPalette() {
  if (!highlightPaletteEl) return;
  highlightPaletteEl.innerHTML = '';

  highlightPaletteColors.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-btn';
    btn.style.backgroundColor = color;
    btn.dataset.color = color;
    highlightPaletteEl.appendChild(btn);
  });

  const divider = document.createElement('div');
  divider.className = 'palette-divider';
  highlightPaletteEl.appendChild(divider);

  [
    { fmt: 'bold', label: '<strong>B</strong>', title: 'Bold' },
    { fmt: 'underline', label: '<u>U</u>', title: 'Underline' },
  ].forEach(({ fmt, label, title }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-fmt-btn';
    btn.dataset.fmt = fmt;
    btn.title = title;
    btn.innerHTML = label;
    highlightPaletteEl.appendChild(btn);
  });
}

function toggleFormatInContent(tagName) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!contentEl || !contentEl.contains(range.commonAncestorContainer)) return;

  const startEl = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement : range.startContainer;
  const endEl = range.endContainer.nodeType === Node.TEXT_NODE
    ? range.endContainer.parentElement : range.endContainer;

  const startWrapper = startEl.closest(tagName);
  const endWrapper = endEl.closest(tagName);

  if (startWrapper && startWrapper === endWrapper) {
    // Entire selection inside one tag → remove it
    unwrapElement(startWrapper);
  } else {
    const el = document.createElement(tagName);
    try {
      const frag = range.extractContents();
      el.appendChild(frag);
      range.insertNode(el);
    } catch { /* ignore */ }
  }

  sel.removeAllRanges();
  syncRawFromDom();
}


function showColorPickerForMark(mark) {
  if (!colorPickerMenu || !mark) return;
  activeMarkForColorChange = mark;

  const rect = mark.getBoundingClientRect();
  colorPickerMenu.innerHTML = '';
  highlightPaletteColors.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-btn';
    btn.style.backgroundColor = color;
    btn.dataset.color = color;
    btn.title = `Set highlight color to ${color}`;
    btn.addEventListener('click', () => {
      setMarkColor(mark, color);
      hideAllFloatingMenus();
    });
    colorPickerMenu.appendChild(btn);
  });

  positionFixedCentered(colorPickerMenu, rect, 10);
  showElement(colorPickerMenu);
}

function maybeShowSelectionMenu() {
  if (!selectionMenu || !contentEl) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return hideElement(selectionMenu);
  if (sel.isCollapsed) return hideElement(selectionMenu);

  const range = sel.getRangeAt(0);
  if (!contentEl.contains(range.commonAncestorContainer)) return hideElement(selectionMenu);

  const anchorMark = getClosestMark(sel.anchorNode);
  const focusMark = getClosestMark(sel.focusNode);
  if (anchorMark && focusMark && anchorMark === focusMark) {
    const withinMark = anchorMark.contains(range.commonAncestorContainer);
    if (withinMark) return hideElement(selectionMenu);
  }

  const selectedText = sel.toString().trim();
  if (!selectedText) return hideElement(selectionMenu);

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return hideElement(selectionMenu);

  hideElement(highlightMenu);
  hideElement(colorPickerMenu);
  selectionMenu.dataset.selectedText = selectedText;
  selectionMenu.dataset.selectedPage = contentEl.dataset.currentPage || '';
  positionFixedCentered(selectionMenu, rect, 10);
  showElement(selectionMenu);
}

function wrapSelectionInMark(color) {
  if (!contentEl) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  if (sel.isCollapsed) return false;

  const range = sel.getRangeAt(0);
  if (!contentEl.contains(range.commonAncestorContainer)) return false;

  const anchorMark = getClosestMark(sel.anchorNode);
  const focusMark = getClosestMark(sel.focusNode);
  if (anchorMark || focusMark) return false;

  const selectedText = sel.toString().trim();
  if (!selectedText) return false;

  const extracted = range.extractContents();
  const mark = document.createElement('mark');
  mark.style.backgroundColor = color;
  mark.dataset.hlColor = color;
  mark.dataset.hlId = `hl_${markIdCounter++}`;
  mark.appendChild(extracted);
  range.insertNode(mark);

  sel.removeAllRanges();
  hideElement(selectionMenu);
  syncRawFromDom();
  return true;
}

export async function loadPage(pageKey) {
  if (!contentEl) return;
  const currentKey = contentEl.dataset.currentPage;
  if (currentKey) {
    const rawHtml = contentEl.dataset.rawHtml;
    if (rawHtml) pageHtmlCache.set(currentKey, rawHtml);
  }
  const url = pageToFragmentUrl[pageKey];
  if (!url) return;

  contentEl.innerHTML = '';
  contentEl.dataset.currentPage = pageKey;
  hideAllFloatingMenus();
  syncPageDrawerActive(pageKey);

  try {
    const cached = pageHtmlCache.get(pageKey);
    if (cached) {
      contentEl.dataset.rawHtml = cached;
      renderContentFromRaw();
      return;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    contentEl.dataset.rawHtml = html;
    renderContentFromRaw();
  } catch (err) {
    console.error('Failed to load LARF fragment:', err);
    contentEl.textContent = `Failed to load ${pageKey}. Expected: ${url}`;
  }
}

function syncPageDrawerActive(pageKey) {
  if (!pageDrawerItems || !pageDrawerItems.length) return;
  pageDrawerItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.pageDrawer === pageKey);
  });
}

function selectionActionHandler(action, selectedText) {
  if (!selectedText.trim()) return hideElement(selectionMenu);
  showChatContext(action, selectedText);
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
  hideAllFloatingMenus();
}

function findTextRange(container, searchText) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  if (!nodes.length) return null;

  // Build rawText and a character-level map to node/offset
  let rawText = '';
  const posMap = []; // posMap[i] = { nodeIdx, offset }
  for (let ni = 0; ni < nodes.length; ni++) {
    const t = nodes[ni].textContent;
    for (let j = 0; j < t.length; j++) posMap.push({ nodeIdx: ni, offset: j });
    rawText += t;
  }

  // Build whitespace-normalised text with normPos→rawPos mapping
  let normText = '';
  const normToRaw = [];
  let prevSpace = true;
  for (let ri = 0; ri < rawText.length; ri++) {
    const ch = rawText[ri];
    if (/\s/.test(ch)) {
      if (!prevSpace) { normToRaw.push(ri); normText += ' '; prevSpace = true; }
    } else {
      normToRaw.push(ri); normText += ch; prevSpace = false;
    }
  }

  const normSearch = searchText.replace(/\s+/g, ' ').trim();
  let matchIdx = normText.indexOf(normSearch);
  let matchLen = normSearch.length;
  if (matchIdx === -1) {
    const snippet = normSearch.slice(0, 60);
    matchIdx = normText.indexOf(snippet);
    matchLen = snippet.length;
  }
  if (matchIdx === -1) return null;

  const rawStart = normToRaw[matchIdx];
  const rawEnd = normToRaw[Math.min(matchIdx + matchLen - 1, normToRaw.length - 1)] + 1;

  const sp = posMap[rawStart];
  const ep = posMap[Math.min(rawEnd - 1, posMap.length - 1)];
  if (!sp || !ep) return null;

  try {
    const r = document.createRange();
    r.setStart(nodes[sp.nodeIdx], sp.offset);
    r.setEnd(nodes[ep.nodeIdx], ep.offset + 1);
    return r;
  } catch {
    return null;
  }
}

export function clearCitationHighlight() {
  if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('citation');
  if (contentEl) {
    contentEl.querySelectorAll('.citation-hl-para').forEach((el) => el.classList.remove('citation-hl-para'));
  }
}

function findContainingBlock(range) {
  let el = range.startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  while (el && el !== contentEl) {
    if (['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV'].includes(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

function expandRangeToParagraph(range) {
  const el = findContainingBlock(range);
  if (!el || el === contentEl || !contentEl.contains(el)) return range;
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r;
  } catch {
    return range;
  }
}

export function highlightCitationText(searchTexts) {
  clearCitationHighlight();
  if (!contentEl || !searchTexts) return;
  const texts = Array.isArray(searchTexts) ? searchTexts : [searchTexts];

  const foundRanges = [];
  const foundBlocks = new Set();

  texts.forEach((t) => {
    const r = findTextRange(contentEl, t);
    if (!r) return;
    foundRanges.push(r);
    const block = findContainingBlock(r);
    if (block) foundBlocks.add(block);
  });

  if (foundRanges.length === 0 && foundBlocks.size === 0) return;

  // Scroll to the first matched paragraph
  const firstBlock = foundBlocks.size > 0 ? [...foundBlocks][0] : null;
  if (firstBlock) {
    try {
      const scrollContainer = contentEl.closest('.panel-body');
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const blockRect = firstBlock.getBoundingClientRect();
        const targetTop = scrollContainer.scrollTop + (blockRect.top - containerRect.top) - 12;
        scrollContainer.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
      } else {
        firstBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch { /* ignore */ }
  }

  // Primary approach: add CSS class to containing block elements (works in all browsers)
  foundBlocks.forEach((block) => block.classList.add('citation-hl-para'));

  // Enhancement: CSS Custom Highlights API for precise inline highlighting (modern browsers)
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    try {
      // Short citations (<= 150 chars) highlight precisely; longer ones expand to full paragraph
      const cssRanges = foundRanges.map((r) =>
        r.toString().length > 150 ? expandRangeToParagraph(r) : r
      );
      CSS.highlights.set('citation', new Highlight(...cssRanges));
    } catch { /* CSS Highlights API not available or failed */ }
  }
}

export function initLeftPanel() {
  buildHighlightPalette();
  hideAllFloatingMenus();

  if (highlightPaletteEl) {
    highlightPaletteEl.addEventListener('mousedown', (e) => {
      // Prevent losing text selection when clicking palette buttons
      if (e.target.closest('.palette-btn, .palette-fmt-btn')) e.preventDefault();
    });

    highlightPaletteEl.addEventListener('click', (e) => {
      // Format buttons (B / U)
      const fmtBtn = e.target.closest('.palette-fmt-btn');
      if (fmtBtn) {
        const fmt = fmtBtn.dataset.fmt;
        if (fmt === 'bold') toggleFormatInContent('strong');
        else if (fmt === 'underline') toggleFormatInContent('u');
        return;
      }

      // Colour buttons
      const btn = e.target.closest('.palette-btn');
      if (!btn) return;
      const color = btn.dataset.color;
      if (!color) return;

      if (activeMarkForColorChange) {
        setMarkColor(activeMarkForColorChange, color);
        hideElement(colorPickerMenu);
        activeMarkForColorChange = null;
        return;
      }

      if (wrapSelectionInMark(color)) {
        hideAllFloatingMenus();
        clearSelection();
      }
    });
  }

  if (leftModeInputs && leftModeInputs.length) {
    leftModeInputs.forEach((input) => {
      input.addEventListener('change', () => renderContentFromRaw());
    });
  }

  if (contentEl) {
    contentEl.addEventListener('pointerdown', () => {
      selectionActive = true;
      hideElement(highlightMenu);
      hideElement(colorPickerMenu);
    });

    document.addEventListener('selectionchange', () => {
      if (!selectionActive) return hideElement(selectionMenu);
      maybeShowSelectionMenu();
    });

    document.addEventListener('pointerup', () => {
      if (!selectionActive) return;
      selectionActive = false;
      maybeShowSelectionMenu();
    });

    contentEl.addEventListener('click', (e) => {
      const mark = e.target && e.target.closest ? e.target.closest('mark') : null;
      if (!mark) return;

      const rect = mark.getBoundingClientRect();
      if (!rect) return;

      highlightMenu.dataset.hlId = mark.dataset.hlId || '';
      highlightMenu.dataset.hlColor = mark.dataset.hlColor || '';
      positionFixedCentered(highlightMenu, rect, 10);
      showElement(highlightMenu);

      hideElement(selectionMenu);
      e.stopPropagation();
    });
  }

  if (selectionMenu) {
    selectionMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-selection-action]');
      if (!btn) return;

      const action = btn.dataset.selectionAction;
      const selectedText = selectionMenu.dataset.selectedText || '';
      selectionActionHandler(action, selectedText);
    });
  }

  if (highlightMenu) {
    highlightMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hm-action]');
      if (!btn) return;
      const action = btn.dataset.hmAction;

      const hlId = highlightMenu.dataset.hlId;
      if (!hlId) return;
      const mark = contentEl ? contentEl.querySelector(`mark[data-hl-id="${hlId}"]`) : null;
      if (!mark) return;

      if (action === 'delete') {
        unwrapMark(mark);
        hideAllFloatingMenus();
        indexMarks();
        syncRawFromDom();
        return;
      }

      if (action === 'change-color') {
        hideElement(highlightMenu);
        showColorPickerForMark(mark);
        return;
      }
    });
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!selectionMenu || !highlightMenu || !colorPickerMenu || !highlightPaletteEl || !contentEl) {
        return;
      }
      const clickedSelectionMenu = selectionMenu.contains(event.target);
      const clickedHighlightMenu = highlightMenu.contains(event.target);
      const clickedColorPickerMenu = colorPickerMenu.contains(event.target);
      const clickedPalette = highlightPaletteEl.contains(event.target);
      const clickedMark = event.target.closest ? !!event.target.closest('mark') : false;
      const clickedPagePicker = document
        .querySelector('[data-page-picker-menu="true"]')
        ?.contains(event.target);
      if (
        clickedSelectionMenu ||
        clickedHighlightMenu ||
        clickedColorPickerMenu ||
        clickedPalette ||
        clickedMark ||
        clickedPagePicker
      ) {
        return;
      }
      hideAllFloatingMenus();
    },
    true
  );
}
