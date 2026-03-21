const leftPanel = document.querySelector('.panel.left');
const menuBtn = document.querySelector('.menu-btn');
const plusBtn = document.querySelector('.plus');
const sendBtn = document.querySelector('.send');
const chatInput = document.querySelector('.chat-bar input');
const floatingMenu = document.querySelector('.floating-menu');
const rightPanel = document.querySelector('.panel.right');
const viewSwitchers = document.querySelectorAll('[data-switch]');
const settingsToggle = document.querySelector('[data-settings="toggle"]');
const settingsPanel = document.querySelector('.settings-panel');
const settingsTabs = document.querySelectorAll('[data-settings-tab]');
const settingsBodies = document.querySelectorAll('[data-settings-body]');
const chatThread = document.getElementById('chatThread');
const chatEmpty = document.getElementById('chatEmpty');

const chatFontType = document.getElementById('chatFontType');
const chatFontSize = document.getElementById('chatFontSize');
const chatHighlights = document.getElementById('chatHighlights');
const chatParagraphs = document.getElementById('chatParagraphs');
const chatFormat = document.getElementById('chatFormat');
const chatPoints = document.getElementById('chatPoints');
const ttsVoice = document.getElementById('ttsVoice');
const ttsHighlight = document.getElementById('ttsHighlight');
const ttsSpeed = document.getElementById('ttsSpeed');

const pagePickerBtn = document.querySelector('[data-page-picker-btn="true"]');
const pagePickerMenu = document.querySelector('[data-page-picker-menu="true"]');
const contentEl = document.getElementById('reformattedContent');

const highlightPaletteEl = document.getElementById('highlightPalette');
const selectionMenu = document.getElementById('selectionMenu');
const highlightMenu = document.getElementById('highlightMenu');
const colorPickerMenu = document.getElementById('colorPickerMenu');
const chatContextBubble = document.getElementById('chatContextBubble');

const pageDrawerOverlay = document.getElementById('pageDrawerOverlay');
const pageDrawer = document.getElementById('pageDrawer');
const pageDrawerItems = document.querySelectorAll('[data-page-drawer]');

const mindMapBtn = document.querySelector('[data-mindmap="true"]');
const mindMapModal = document.getElementById('mindMapModal');
const mindMapCloseBtn = document.querySelector('[data-mindmap-close="true"]');
const floatingMenuItems = document.querySelectorAll('[data-menu-action]');

const DEFAULT_HL_COLOR = '#E2ABE24D'; // 30% transparency version.
const highlightPaletteColors = [
  DEFAULT_HL_COLOR, // pastel pink (as provided)
  '#F6E27A4D', // pastel yellow
  '#7CE6B84D', // pastel green
  '#7AB7FF4D', // pastel blue
  '#FFCD7A4D', // pastel orange
  '#FF7A7A4D', // pastel red
  '#B79CFF4D', // pastel purple
  '#6FD5D84D', // pastel teal
  '#BFC7D34D', // pastel gray
  '#C8A37B4D', // pastel brown
];

const pageToFragmentUrl = {
  pageBook1: 'Context/pageBook1_larf.html',
  pageBook2: 'Context/pageBook2_larf.html',
  pageBook3: 'Context/pageBook3_larf.html',
};

const LARF_PROMPT_URL = 'Context/prompt_LARF.txt';
const OPENAI_MODEL = 'gpt-4.1-mini';
const OPENAI_PROXY_URL = '/api/response';
const OPENAI_HEALTH_URL = '/api/health';
const ragTextSources = [
  'Context/pageBook1_larf.html',
  'Context/pageBook2_larf.html',
  'Context/pageBook3_larf.html',
];

let activeMarkForColorChange = null;
let markIdCounter = 0;
let pendingContextText = '';
let pendingContextAction = '';
let larfPromptText = '';
let selectionActive = false;
const ragTextCache = new Map();

function hideElement(el) {
  if (!el) return;
  el.hidden = true;
  el.classList.remove('is-visible');
  el.style.display = 'none';
  el.style.left = '-9999px';
  el.style.top = '-9999px';
  el.style.transform = '';
}

function showElement(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.add('is-visible');
  el.style.display = '';
}

function getClosestMark(node) {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node.closest('mark');
  if (node.parentElement) return node.parentElement.closest('mark');
  return null;
}

function truncate(text, maxLen) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function clearSelection() {
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

function setChatEmptyVisible(visible) {
  if (!chatEmpty) return;
  chatEmpty.hidden = !visible;
}

function getChatSettings() {
  return {
    fontType: chatFontType ? chatFontType.value : 'Lexend',
    fontSize: chatFontSize ? parseInt(chatFontSize.value, 10) : 12,
    highlightsOn: chatHighlights ? chatHighlights.checked : true,
    paragraphs: chatParagraphs ? chatParagraphs.value : '2-4 lines',
    format: chatFormat ? chatFormat.value : 'Simple wording',
    points: chatPoints ? chatPoints.value : 'Bullet points',
    ttsVoice: ttsVoice ? ttsVoice.value : 'Female 1',
    ttsHighlight: ttsHighlight ? ttsHighlight.value : DEFAULT_HL_COLOR,
    ttsSpeed: ttsSpeed ? ttsSpeed.value : 'x1',
  };
}

function applyChatStyle(settings) {
  if (!chatThread) return;
  chatThread.style.fontFamily = settings.fontType;
  chatThread.style.fontSize = `${settings.fontSize}px`;
  chatThread.style.setProperty('--chat-highlight-color', DEFAULT_HL_COLOR);
  chatThread.dataset.highlights = settings.highlightsOn ? 'on' : 'off';
}

function sanitizeResponseHtml(html) {
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

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.body.textContent || '';
}

function appendMessage(role, content, options = {}) {
  if (!chatThread) return;
  const msg = document.createElement('div');
  msg.className = `chat-message ${role}`;
  const allowHtml = options.allowHtml || false;
  if (allowHtml) {
    msg.innerHTML = sanitizeResponseHtml(content);
  } else {
    msg.textContent = stripHtml(content);
  }
  chatThread.appendChild(msg);
  if (chatThread.children.length <= 2) {
    chatThread.classList.add('chat-thread--single');
  } else {
    chatThread.classList.remove('chat-thread--single');
  }
  setChatEmptyVisible(false);
  chatThread.scrollTop = chatThread.scrollHeight;
}

async function loadLarfPrompt() {
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

async function getRagText() {
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
  return `${combined.slice(0, 12000)}…`;
}

function buildSystemPrompt(settings, larfPrompt) {
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
    'You are Sabi, your studyBuddy, and you are replying on a website chat. This tool is designed for dyslexic students.',
    'Add extra spacing between paragraphs (insert blank lines between paragraphs).',
    'You are StudyBuddy. Answer using ONLY the information in the provided three pages.',
    'If the answer is not in those pages, say you do not have that information from the provided pages.',
    'Never do a full paragrpah without any enters and add bullet points or numbers if necessary for explaining steps',
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

function buildUserPrompt(userText) {
  if (!pendingContextText) return userText;
  if (pendingContextAction === 'summary') {
    return `Summarize the selected text below.\nSelected text: ${pendingContextText}\nUser request: ${userText || 'Provide a concise summary.'}`;
  }
  if (pendingContextAction === 'read') {
    return `Explain the selected text below.\nSelected text: ${pendingContextText}\nUser request: ${userText || 'Explain it clearly.'}`;
  }
  return `Focus on the selected text below when answering.\nSelected text: ${pendingContextText}\nUser request: ${userText}`;
}

async function callOpenAI(userText, settings) {
  const larfPrompt = await loadLarfPrompt();
  const systemPrompt = buildSystemPrompt(settings, larfPrompt);
  const ragText = await getRagText();

  const contextBlock = ragText
    ? `\n\nContext from the three pages:\n${ragText}`
    : '';
  const userContent = [
    {
      type: 'input_text',
      text: `${buildUserPrompt(userText)}${contextBlock}`,
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
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const textParts = [];
    data.output.forEach((item) => {
      if (Array.isArray(item.content)) {
        item.content.forEach((part) => {
          if (part.type === 'output_text') textParts.push(part.text || '');
        });
      }
    });
    if (textParts.length) return textParts.join('\n').trim();
  }

  return 'I could not generate a response from the provided pages.';
}

function positionFixedCentered(el, rect, yOffset = 8) {
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.bottom + yOffset}px`;
  el.style.transform = 'translateX(-50%)';
}

function indexMarks() {
  if (!contentEl) return;
  const marks = contentEl.querySelectorAll('mark');
  markIdCounter = 0;
  marks.forEach((mark) => {
    const id = `hl_${markIdCounter++}`;
    mark.dataset.hlId = id;
    const inlineColor = mark.style.backgroundColor;
    // If LARF markup already includes an inline color, keep it; otherwise set the default.
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

function hideAllFloatingMenus() {
  hideElement(selectionMenu);
  hideElement(highlightMenu);
  hideElement(colorPickerMenu);
  activeMarkForColorChange = null;
}

function closeAllPopups() {
  hideAllFloatingMenus();
  clearSelection();
  if (floatingMenu) floatingMenu.classList.remove('open');
  if (settingsPanel) settingsPanel.classList.remove('open');
  if (mindMapModal) mindMapModal.setAttribute('aria-hidden', 'true');
  if (pageDrawerOverlay) pageDrawerOverlay.hidden = true;
  if (pageDrawer) pageDrawer.setAttribute('aria-hidden', 'true');
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
    // Selection is inside an existing highlight: let the highlight menu handle edits.
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

  // Extract the selected content and wrap it in a new <mark>.
  const extracted = range.extractContents();
  const mark = document.createElement('mark');
  mark.style.backgroundColor = color;
  mark.dataset.hlColor = color;
  mark.dataset.hlId = `hl_${markIdCounter++}`;
  mark.appendChild(extracted);
  range.insertNode(mark);

  // Clear selection to avoid re-wrapping.
  sel.removeAllRanges();
  hideElement(selectionMenu);
  return true;
}

async function loadPage(pageKey) {
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

function showChatContext(action, selectedText) {
  if (!chatContextBubble) return;
  const t = truncate(selectedText, 180);

  let msg = '';
  if (action === 'read') msg = `Read Text: ${t}`;
  if (action === 'chat') msg = `Chat about: ${t}`;
  if (action === 'summary') msg = `Summary: ${t}`;

  chatContextBubble.textContent = msg;
  chatContextBubble.hidden = false;
  if (rightPanel) rightPanel.dataset.view = 'chat';
  pendingContextText = selectedText;
  pendingContextAction = action;
}

// Existing UI behavior (menu/settings/chat)

function initializeSettings() {
  if (chatFontType) chatFontType.value = 'Lexend';
  if (chatFontSize) chatFontSize.value = '12';
  if (chatParagraphs) chatParagraphs.value = '2-4 lines';
  if (chatFormat) chatFormat.value = 'Simple wording';
  if (chatPoints) chatPoints.value = 'Bullet points';
  if (ttsVoice) ttsVoice.value = 'Female 1';
  if (ttsHighlight) ttsHighlight.value = DEFAULT_HL_COLOR;
  if (ttsSpeed) ttsSpeed.value = 'x1';
  if (chatHighlights) chatHighlights.checked = true;
  applyChatStyle(getChatSettings());
}

initializeSettings();

if (plusBtn && chatInput) {
  plusBtn.addEventListener('click', () => {
    if (floatingMenu) floatingMenu.classList.toggle('open');
    chatInput.focus();
  });
}

function openChatView() {
  if (rightPanel) rightPanel.dataset.view = 'chat';
}

function prefillChat(prefix) {
  if (!chatInput) return;
  openChatView();
  chatInput.value = prefix;
  chatInput.focus();
  if (floatingMenu) floatingMenu.classList.remove('open');
}

async function handleChatSend() {
  if (!chatInput) return;
  const raw = chatInput.value.trim();
  const fallbackFromContext = pendingContextText && pendingContextAction;
  if (!raw && !fallbackFromContext) return;

  const userText = raw || (pendingContextAction === 'summary' ? 'Summarize the selected text.' : 'Explain the selected text.');
  if (rightPanel) rightPanel.dataset.view = 'chat';
  appendMessage('user', userText);
  chatInput.value = '';

  const settings = getChatSettings();
  try {
    const response = await callOpenAI(userText, settings);
    appendMessage('assistant', response, { allowHtml: settings.highlightsOn });
  } catch (err) {
    const detail = err && err.message ? ` (${err.message})` : '';
    appendMessage('assistant', `Sorry, I could not reach the chat service. Please try again.${detail}`);
    console.error(err);
  } finally {
    pendingContextText = '';
    pendingContextAction = '';
    if (chatContextBubble) chatContextBubble.hidden = true;
  }
}

if (sendBtn) {
  sendBtn.addEventListener('click', () => handleChatSend());
}

if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  });
}

document.addEventListener('click', (event) => {
  if (floatingMenu) {
    const isPlus = plusBtn && plusBtn.contains(event.target);
    const isMenu = floatingMenu.contains(event.target);
    if (!isPlus && !isMenu) floatingMenu.classList.remove('open');
  }
});

if (settingsToggle && settingsPanel) {
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
  });
  document.addEventListener('click', (event) => {
    const isGear = settingsToggle.contains(event.target);
    const isPanel = settingsPanel.contains(event.target);
    if (!isGear && !isPanel) settingsPanel.classList.remove('open');
  });
}

if (settingsTabs.length && settingsBodies.length) {
  const activateTab = (tabName) => {
    settingsTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.settingsTab === tabName);
    });
    settingsBodies.forEach((body) => {
      body.classList.toggle('active', body.dataset.settingsBody === tabName);
    });
  };
  activateTab('style');
  settingsTabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.settingsTab));
  });
}

const settingsInputs = [
  chatFontType,
  chatFontSize,
  chatHighlights,
  chatParagraphs,
  chatFormat,
  chatPoints,
  ttsVoice,
  ttsHighlight,
  ttsSpeed,
].filter(Boolean);

settingsInputs.forEach((el) => {
  el.addEventListener('change', () => {
    applyChatStyle(getChatSettings());
  });
});

if (rightPanel && viewSwitchers.length) {
  viewSwitchers.forEach((btn) => {
    btn.addEventListener('click', () => {
      rightPanel.dataset.view = btn.dataset.switch || 'chat';
    });
  });
}

// Page picker (burger menu inside the left panel)
if (pagePickerBtn && pagePickerMenu) {
  pagePickerBtn.addEventListener('click', () => {
    const isOpen = pagePickerMenu.getAttribute('aria-hidden') === 'false';
    pagePickerMenu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!pagePickerMenu) return;
    const clickedInside = pagePickerMenu.contains(event.target);
    const clickedBtn = pagePickerBtn.contains(event.target);
    if (!clickedInside && !clickedBtn) pagePickerMenu.setAttribute('aria-hidden', 'true');
  });

  pagePickerMenu.querySelectorAll('.page-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageKey = btn.dataset.page;
      loadPage(pageKey);
      pagePickerMenu.setAttribute('aria-hidden', 'true');
    });
  });
}

// Highlight palette + selection menu behavior
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
    // Avoid constant re-positioning for empty selections.
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

    // Clicking a mark opens the highlight edit menu.
    const rect = mark.getBoundingClientRect();
    if (!rect) return;

    highlightMenu.dataset.hlId = mark.dataset.hlId || '';
    highlightMenu.dataset.hlColor = mark.dataset.hlColor || '';
    positionFixedCentered(highlightMenu, rect, 10);
    showElement(highlightMenu);

    // Prevent selection-menu from lingering.
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
    if (!selectedText.trim()) return hideElement(selectionMenu);

    showChatContext(action, selectedText);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideAllFloatingMenus();
  });
}

if (highlightMenu) {
  highlightMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hm-action]');
    if (!btn) return;
    const action = btn.dataset.hmAction;

    // Find currently shown mark by id.
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
      // Close the highlight menu; the color picker is the next step.
      hideElement(highlightMenu);
      showColorPickerForMark(mark);
      return;
    }
  });
}

function isFloatingMenuTarget(target) {
  if (!target) return false;
  const clickedSelectionMenu = selectionMenu && selectionMenu.contains(target);
  const clickedHighlightMenu = highlightMenu && highlightMenu.contains(target);
  const clickedColorPickerMenu = colorPickerMenu && colorPickerMenu.contains(target);
  const clickedPalette = highlightPaletteEl && highlightPaletteEl.contains(target);
  const clickedMark = contentEl && target.closest ? !!target.closest('mark') : false;
  const clickedPagePicker = pagePickerMenu && pagePickerMenu.contains(target);
  return (
    clickedSelectionMenu ||
    clickedHighlightMenu ||
    clickedColorPickerMenu ||
    clickedPalette ||
    clickedMark ||
    clickedPagePicker
  );
}

document.addEventListener(
  'pointerdown',
  (event) => {
    if (isFloatingMenuTarget(event.target)) return;
    hideAllFloatingMenus();
  },
  true
);

function syncPageDrawerActive(pageKey) {
  if (!pageDrawerItems || !pageDrawerItems.length) return;
  pageDrawerItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.pageDrawer === pageKey);
  });
}

async function checkServerHealth() {
  if (location.protocol === 'file:') {
    appendMessage(
      'assistant',
      'This page is opened as a local file. Start the server with `python server.py` and open `http://localhost:8000` so the chat can reach the API.'
    );
    return;
  }
  try {
    const res = await fetch(OPENAI_HEALTH_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.hasKey) {
      appendMessage(
        'assistant',
        'The server is running but has no OPENAI_API_KEY loaded. Check your `.env` file and restart the server.'
      );
    }
  } catch (err) {
    appendMessage(
      'assistant',
      'Cannot reach the local server. Start it with `python server.py` and reload the page.'
    );
  }
}

// Mind map modal
function openMindMap() {
  if (!mindMapModal) return;
  mindMapModal.setAttribute('aria-hidden', 'false');
}

function closeMindMap() {
  if (!mindMapModal) return;
  mindMapModal.setAttribute('aria-hidden', 'true');
}

if (mindMapBtn) {
  mindMapBtn.addEventListener('click', () => openMindMap());
}

if (mindMapCloseBtn) {
  mindMapCloseBtn.addEventListener('click', () => closeMindMap());
}

if (mindMapModal) {
  mindMapModal.addEventListener('click', (e) => {
    if (e.target === mindMapModal) closeMindMap();
  });
}

if (floatingMenu && floatingMenuItems.length) {
  floatingMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu-action]');
    if (!btn) return;
    const action = btn.dataset.menuAction;
    if (action === 'mindmap') {
      openMindMap();
      floatingMenu.classList.remove('open');
      return;
    }
    if (action === 'summary') {
      prefillChat('Make a summary about ');
      return;
    }
    if (action === 'tts') {
      prefillChat('Read the text out loud of ');
      return;
    }
    if (action === 'chat') {
      openChatView();
      floatingMenu.classList.remove('open');
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMindMap();
    hideAllFloatingMenus();
  }
});

// Initial load
loadPage('pageBook1');
if (chatThread && chatThread.children.length === 0) setChatEmptyVisible(true);
closeAllPopups();
window.addEventListener('load', () => closeAllPopups());
checkServerHealth();

// Page drawer (burger on the far left)
function openPageDrawer() {
  if (!pageDrawer) return;
  if (pageDrawerOverlay) pageDrawerOverlay.hidden = false;
  pageDrawer.setAttribute('aria-hidden', 'false');
  syncPageDrawerActive(contentEl?.dataset?.currentPage || 'pageBook1');
  hideAllFloatingMenus();
}

function closePageDrawer() {
  if (!pageDrawer) return;
  if (pageDrawerOverlay) pageDrawerOverlay.hidden = true;
  pageDrawer.setAttribute('aria-hidden', 'true');
}

if (menuBtn && pageDrawerOverlay && pageDrawer) {
  menuBtn.addEventListener('click', () => {
    const isOpen = pageDrawer.getAttribute('aria-hidden') === 'false';
    if (isOpen) closePageDrawer();
    else openPageDrawer();
  });

  pageDrawerOverlay.addEventListener('click', () => closePageDrawer());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePageDrawer();
  });

  pageDrawerItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageKey = btn.dataset.pageDrawer;
      loadPage(pageKey);
      closePageDrawer();
    });
  });
}
