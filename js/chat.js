import { OPENAI_HEALTH_URL, DEFAULT_HL_COLOR } from './config.js';
import { sanitizeResponseHtml, stripHtml, truncate } from './utils.js';
import { callOpenAI } from './openai.js';

const rightPanel = document.querySelector('.panel.right');
const chatThread = document.getElementById('chatThread');
const chatEmpty = document.getElementById('chatEmpty');
const chatInput = document.querySelector('.chat-bar input');
const sendBtn = document.querySelector('.send');
const plusBtn = document.querySelector('.plus');
const floatingMenu = document.querySelector('.floating-menu');
const chatContextBubble = document.getElementById('chatContextBubble');

const chatFontType = document.getElementById('chatFontType');
const chatFontSize = document.getElementById('chatFontSize');
const chatHighlights = document.getElementById('chatHighlights');
const chatParagraphs = document.getElementById('chatParagraphs');
const chatFormat = document.getElementById('chatFormat');
const chatPoints = document.getElementById('chatPoints');
const ttsVoice = document.getElementById('ttsVoice');
const ttsHighlight = document.getElementById('ttsHighlight');
const ttsSpeed = document.getElementById('ttsSpeed');

const contextState = {
  pendingContextText: '',
  pendingContextAction: '',
};

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

export function applyChatStyle(settings) {
  if (!chatThread) return;
  chatThread.style.fontFamily = settings.fontType;
  chatThread.style.fontSize = `${settings.fontSize}px`;
  chatThread.style.setProperty('--chat-highlight-color', DEFAULT_HL_COLOR);
  chatThread.dataset.highlights = settings.highlightsOn ? 'on' : 'off';
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

export function openChatView() {
  if (rightPanel) rightPanel.dataset.view = 'chat';
}

export function prefillChat(prefix) {
  if (!chatInput) return;
  openChatView();
  chatInput.value = prefix;
  chatInput.focus();
  if (floatingMenu) floatingMenu.classList.remove('open');
}

export function showChatContext(action, selectedText) {
  if (!chatContextBubble) return;
  const t = truncate(selectedText, 180);

  let msg = '';
  if (action === 'read') msg = `Read Text: ${t}`;
  if (action === 'chat') msg = `Chat about: ${t}`;
  if (action === 'summary') msg = `Summary: ${t}`;

  chatContextBubble.textContent = msg;
  chatContextBubble.hidden = false;
  openChatView();
  contextState.pendingContextText = selectedText;
  contextState.pendingContextAction = action;
}

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

async function handleChatSend() {
  if (!chatInput) return;
  const raw = chatInput.value.trim();
  const fallbackFromContext = contextState.pendingContextText && contextState.pendingContextAction;
  if (!raw && !fallbackFromContext) return;

  const userText =
    raw ||
    (contextState.pendingContextAction === 'summary'
      ? 'Summarize the selected text.'
      : 'Explain the selected text.');
  openChatView();
  appendMessage('user', userText);
  chatInput.value = '';

  const settings = getChatSettings();
  try {
    const response = await callOpenAI(userText, settings, contextState);
    appendMessage('assistant', response, { allowHtml: settings.highlightsOn });
  } catch (err) {
    const detail = err && err.message ? ` (${err.message})` : '';
    appendMessage('assistant', `Sorry, I could not reach the chat service. Please try again.${detail}`);
    console.error(err);
  } finally {
    contextState.pendingContextText = '';
    contextState.pendingContextAction = '';
    if (chatContextBubble) chatContextBubble.hidden = true;
  }
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

export function closeFloatingMenu() {
  if (floatingMenu) floatingMenu.classList.remove('open');
}

export function initChat() {
  initializeSettings();

  if (plusBtn && chatInput) {
    plusBtn.addEventListener('click', () => {
      if (floatingMenu) floatingMenu.classList.toggle('open');
      chatInput.focus();
    });
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
    if (!floatingMenu) return;
    const isPlus = plusBtn && plusBtn.contains(event.target);
    const isMenu = floatingMenu.contains(event.target);
    if (!isPlus && !isMenu) floatingMenu.classList.remove('open');
  });

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

  if (chatThread && chatThread.children.length === 0) setChatEmptyVisible(true);
  checkServerHealth();
}

export function hideChatContextBubble() {
  if (chatContextBubble) chatContextBubble.hidden = true;
}

export function getCurrentTtsConfig() {
  const settings = getChatSettings();
  const rateMap = {
    'x0.25': 0.25,
    'x0.5': 0.5,
    'x0.75': 0.75,
    x1: 1,
    'x1.25': 1.25,
    'x1.5': 1.5,
    'x1.75': 1.75,
    x2: 2,
  };
  return {
    voiceLabel: settings.ttsVoice,
    rate: rateMap[settings.ttsSpeed] || 1,
  };
}
