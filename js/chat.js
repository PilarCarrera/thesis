import { OPENAI_HEALTH_URL, DEFAULT_HL_COLOR } from './config.js';
import { sanitizeResponseHtml, stripHtml, truncate } from './utils.js';
import { callOpenAI } from './openai.js';
import { getPageText, getAllPageTexts } from './rag.js';

const rightPanel = document.querySelector('.panel.right');
const chatThread = document.getElementById('chatThread');
const chatEmpty = document.getElementById('chatEmpty');
const chatInput = document.querySelector('.chat-bar input');
const sendBtn = document.querySelector('.send');
const plusBtn = document.querySelector('.plus');
const floatingMenu = document.querySelector('.floating-menu');
const chatContextBubble = document.getElementById('chatContextBubble');
const chatContextText = chatContextBubble
  ? chatContextBubble.querySelector('.chat-context-text')
  : null;
const chatContextClose = chatContextBubble
  ? chatContextBubble.querySelector('.chat-context-close')
  : null;
const reformattedContent = document.getElementById('reformattedContent');

const chatFontType = document.getElementById('chatFontType');
const chatFontSize = document.getElementById('chatFontSize');
const chatHighlights = document.getElementById('chatHighlights');
const chatParagraphs = document.getElementById('chatParagraphs');
const chatFormat = document.getElementById('chatFormat');
const chatPoints = document.getElementById('chatPoints');

const contextState = {
  pendingContextText: '',
  pendingContextAction: '',
};

const pageLabelMap = {
  pageBook1: 'Page 1',
  pageBook2: 'Page 2',
  pageBook3: 'Page 3',
};

function getCurrentPageKey() {
  return (reformattedContent && reformattedContent.dataset.currentPage) || 'pageBook1';
}

function getCurrentPageLabel() {
  return pageLabelMap[getCurrentPageKey()] || 'this page';
}

const stopwords = new Set([
  'the',
  'and',
  'about',
  'what',
  'who',
  'why',
  'how',
  'is',
  'are',
  'was',
  'were',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'do',
  'does',
  'did',
  'this',
  'that',
  'these',
  'those',
  'page',
  'text',
  'tell',
  'me',
  'you',
  'your',
  'it',
  'its',
  'know',
]);

function extractKeywords(text) {
  const words = (text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
  return words.filter((w) => w.length >= 4 && !stopwords.has(w));
}

function scoreMatch(text, keywords) {
  if (!text || !keywords.length) return 0;
  const haystack = text.toLowerCase();
  const unique = new Set(keywords);
  let score = 0;
  unique.forEach((kw) => {
    if (haystack.includes(kw)) score += 1;
  });
  return score;
}

function isGeneralRequest(text) {
  return /summary|summarize|overview|explain|describe|main points|key points|what is this page about/i.test(
    text || ''
  );
}

function isSubjectiveOrUnclear(text) {
  return /do you like|do you think|what do you think|your opinion|opinion|favorite|favourite|feel about/i.test(
    text || ''
  );
}

function detectReferencedPage(userText) {
  const text = (userText || '').toLowerCase();
  if (!text) return null;

  const has = (re) => re.test(text);
  if (has(/\bpage\s*1\b/) || has(/\bpage\s*one\b/) || has(/\bfirst\s+page\b/) || has(/pagebook1/)) {
    return 'pageBook1';
  }
  if (has(/\bpage\s*2\b/) || has(/\bpage\s*two\b/) || has(/\bsecond\s+page\b/) || has(/pagebook2/)) {
    return 'pageBook2';
  }
  if (has(/\bpage\s*3\b/) || has(/\bpage\s*three\b/) || has(/\bthird\s+page\b/) || has(/pagebook3/)) {
    return 'pageBook3';
  }
  return null;
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
  if (action === 'chat') msg = `Context on "${t}"`;
  if (action === 'summary') msg = `Summary context on "${t}"`;

  if (chatContextText) chatContextText.textContent = msg;
  chatContextBubble.hidden = false;
  openChatView();
  contextState.pendingContextText = selectedText;
  contextState.pendingContextAction = action;
}

function initializeSettings() {
  if (chatFontType) chatFontType.value = 'Lexend';
  if (chatFontSize) chatFontSize.value = '16';
  if (chatParagraphs) chatParagraphs.value = '2-4 lines';
  if (chatFormat) chatFormat.value = 'Simple wording';
  if (chatPoints) chatPoints.value = 'Bullet points';
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
  const currentPageKey = getCurrentPageKey();
  const currentPageLabel = getCurrentPageLabel();
  const referencedPageKey = detectReferencedPage(userText);
  if (referencedPageKey && referencedPageKey !== currentPageKey) {
    const referencedLabel = pageLabelMap[referencedPageKey] || 'that page';
    appendMessage(
      'assistant',
      `This question is about text on ${referencedLabel}. Please change to ${referencedLabel}; I cannot reply to it from ${currentPageLabel}.`
    );
    return;
  }
  if (!contextState.pendingContextText && isSubjectiveOrUnclear(userText)) {
    appendMessage(
      'assistant',
      '<p><mark style="background-color:#E2ABE24D;">I don&#39;t think I understood your question.</mark> <u>Please rephrase it</u> or ask something directly from the text, and I will help. :)</p>',
      { allowHtml: true }
    );
    return;
  }
  if (!contextState.pendingContextText && !isGeneralRequest(userText)) {
    const keywords = extractKeywords(userText);
    if (keywords.length) {
      const [currentText, allTexts] = await Promise.all([
        getPageText(currentPageKey),
        getAllPageTexts(),
      ]);
      const currentScore = scoreMatch(currentText, keywords);
      let bestOtherKey = null;
      let bestOtherScore = 0;
      Object.entries(allTexts).forEach(([key, text]) => {
        if (key === currentPageKey) return;
        const score = scoreMatch(text, keywords);
        if (score > bestOtherScore) {
          bestOtherScore = score;
          bestOtherKey = key;
        }
      });

      if (bestOtherKey && bestOtherScore > currentScore && bestOtherScore >= 1) {
        const referencedLabel = pageLabelMap[bestOtherKey] || 'that page';
        appendMessage(
          'assistant',
          `This question is about text on ${referencedLabel}. Please change to ${referencedLabel}; I cannot reply to it from ${currentPageLabel}.`
        );
        return;
      }

      if (currentScore === 0 && bestOtherScore === 0) {
        appendMessage(
          'assistant',
          '<p><mark style="background-color:#E2ABE24D;">I don&#39;t know.</mark> <u>It&#39;s not from the selected text.</u> <strong>Ask me something from the text</strong> and I will reply! :)</p>',
          { allowHtml: true }
        );
        return;
      }
    }
  }
  try {
    const response = await callOpenAI(userText, settings, contextState, currentPageKey, currentPageLabel);
    appendMessage('assistant', response, { allowHtml: settings.highlightsOn });
  } catch (err) {
    const detail = err && err.message ? ` (${err.message})` : '';
    appendMessage('assistant', `Sorry, I could not reach the chat service. Please try again.${detail}`);
    console.error(err);
  } finally {
    // keep context until user clears it
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
  ].filter(Boolean);

  settingsInputs.forEach((el) => {
    el.addEventListener('change', () => {
      applyChatStyle(getChatSettings());
    });
  });

  if (chatThread && chatThread.children.length === 0) setChatEmptyVisible(true);
  checkServerHealth();

  if (chatContextClose) {
    chatContextClose.addEventListener('click', () => clearChatContext());
  }
}

export function hideChatContextBubble() {
  if (chatContextBubble) chatContextBubble.hidden = true;
}

function clearChatContext() {
  contextState.pendingContextText = '';
  contextState.pendingContextAction = '';
  if (chatContextBubble) chatContextBubble.hidden = true;
}
