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
import { readSelection, readCurrentPage } from './reading.js';

const contentEl = document.getElementById('reformattedContent');
const highlightPaletteEl = document.getElementById('highlightPalette');
const selectionMenu = document.getElementById('selectionMenu');
const highlightMenu = document.getElementById('highlightMenu');
const colorPickerMenu = document.getElementById('colorPickerMenu');
const pageDrawerItems = document.querySelectorAll('[data-page-drawer]');

let activeMarkForColorChange = null;
let markIdCounter = 0;
let selectionActive = false;

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

function setMarkColor(mark, color) {
  if (!mark) return;
  mark.style.backgroundColor = color;
  mark.dataset.hlColor = color;
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
  if (anchorMark || focusMark) {
    return hideElement(selectionMenu);
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
  return true;
}

export async function loadPage(pageKey) {
  if (!contentEl) return;
  const url = pageToFragmentUrl[pageKey];
  if (!url) return;

  contentEl.innerHTML = '';
  contentEl.dataset.currentPage = pageKey;
  hideAllFloatingMenus();
  syncPageDrawerActive(pageKey);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    contentEl.innerHTML = html;
    indexMarks();
    clearSelection();
    hideAllFloatingMenus();
  } catch (err) {
    console.error('Failed to load LARF fragment:', err);
    contentEl.textContent = `Failed to load ${pageKey}. Expected: ${url}`;
  }
}

export function readCurrentPageTts() {
  if (!contentEl) return null;
  return readCurrentPage(contentEl);
}

function syncPageDrawerActive(pageKey) {
  if (!pageDrawerItems || !pageDrawerItems.length) return;
  pageDrawerItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.pageDrawer === pageKey);
  });
}

function selectionActionHandler(action, selectedText) {
  if (!selectedText.trim()) return hideElement(selectionMenu);
  if (action === 'read') {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) readSelection(sel.getRangeAt(0), selectedText);
    return;
  }
  showChatContext(action, selectedText);
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
  hideAllFloatingMenus();
}


export function initLeftPanel() {
  buildHighlightPalette();
  hideAllFloatingMenus();

  if (highlightPaletteEl) {
    highlightPaletteEl.addEventListener('click', (e) => {
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
