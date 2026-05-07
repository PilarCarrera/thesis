import { OPENAI_HEALTH_URL, DEFAULT_HL_COLOR } from './config.js';
import { sanitizeResponseHtml, stripHtml, truncate } from './utils.js';
import { callOpenAI } from './openai.js';
import { getPageText, getAllPageTexts } from './rag.js';
import { highlightCitationText, clearCitationHighlight } from './leftPanel.js';
import { isChatHighlightEnabled, isLeftHighlightEnabled } from './appMode.js';

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

const chatParagraphs = document.getElementById('chatParagraphs');
const chatFormat = document.getElementById('chatFormat');
const chatPoints = document.getElementById('chatPoints');

const contextState = {
  pendingContextText: '',
  pendingContextAction: '',
};

const pageLabelMap = {
  pageBook1: 'Text 1',
  pageBook2: 'Text 2',
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
  if (has(/\bpage\s*1\b/) || has(/\bpage\s*one\b/) || has(/\bfirst\s+page\b/) || has(/pagebook1/) ||
      has(/\btext\s*1\b/) || has(/\btext\s*one\b/) || has(/\bfirst\s+text\b/)) {
    return 'pageBook1';
  }
  if (has(/\bpage\s*2\b/) || has(/\bpage\s*two\b/) || has(/\bsecond\s+page\b/) || has(/pagebook2/) ||
      has(/\btext\s*2\b/) || has(/\btext\s*two\b/) || has(/\bsecond\s+text\b/)) {
    return 'pageBook2';
  }
  return null;
}

function setChatEmptyVisible(visible) {
  if (!chatEmpty) return;
  chatEmpty.hidden = !visible;
}

function getChatSettings() {
  const pageKey = getCurrentPageKey();
  return {
    highlightsOn: isChatHighlightEnabled(pageKey),
    paragraphs: chatParagraphs ? chatParagraphs.value : '2-4 lines',
    format: chatFormat ? chatFormat.value : 'Simple wording',
    points: chatPoints ? chatPoints.value : 'Bullet points',
  };
}

function stripHighlightTags(html) {
  return (html || '').replace(/<\/?(mark|strong|u)\b[^>]*>/gi, '');
}

export function applyChatStyle(settings) {
  if (!chatThread) return;
  chatThread.style.setProperty('--chat-highlight-color', DEFAULT_HL_COLOR);
  chatThread.dataset.highlights = settings.highlightsOn ? 'on' : 'off';
}

let citationPopup = null;

function getCitationPopup() {
  if (citationPopup) return citationPopup;
  citationPopup = document.createElement('div');
  citationPopup.className = 'citation-popup';
  citationPopup.hidden = true;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'citation-popup-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', hideCitationPopup);

  const label = document.createElement('div');
  label.className = 'citation-popup-label';

  const body = document.createElement('div');
  body.className = 'citation-popup-body';

  citationPopup.appendChild(closeBtn);
  citationPopup.appendChild(label);
  citationPopup.appendChild(body);
  document.body.appendChild(citationPopup);

  document.addEventListener('pointerdown', (e) => {
    if (!citationPopup.hidden && !citationPopup.contains(e.target) && !e.target.closest('.chat-ref')) {
      hideCitationPopup();
    }
  }, true);

  return citationPopup;
}

function showCitationPopup(refEl, citations, source) {
  const popup = getCitationPopup();
  popup.querySelector('.citation-popup-label').textContent = `📖 Found in: ${source}`;

  const body = popup.querySelector('.citation-popup-body');
  body.innerHTML = '';
  const msg = document.createElement('p');
  msg.className = 'citation-popup-text';
  msg.textContent = 'The relevant passage has been highlighted in the text on the left — that\'s where this answer comes from! 👈';
  body.appendChild(msg);

  popup.hidden = false;

  const rect = refEl.getBoundingClientRect();
  const popupW = 340;
  let left = rect.left + rect.width / 2 - popupW / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
  popup.style.left = `${left}px`;
  popup.style.top = `${rect.top - 8}px`;
  popup.style.transform = 'translateY(-100%)';

  if (isLeftHighlightEnabled(getCurrentPageKey())) {
    highlightCitationText(citations);
  }
}

function hideCitationPopup() {
  if (citationPopup) citationPopup.hidden = true;
  clearCitationHighlight();
}

function isUnknownResponse(text) {
  const plain = (text || '').replace(/<[^>]+>/g, '').toLowerCase();
  return (
    /i don['']t know/i.test(plain) ||
    /i do not know/i.test(plain) ||
    /not from the selected text/i.test(plain) ||
    /not from this text/i.test(plain) ||
    /not in the text/i.test(plain) ||
    /not mentioned in/i.test(plain) ||
    /ask me something from the text/i.test(plain) ||
    /cannot find/i.test(plain)
  );
}

function appendMessage(role, content, options = {}) {
  if (!chatThread) return;
  const msg = document.createElement('div');
  msg.className = `chat-message ${role}`;
  if (options.className) {
    options.className
      .split(/\s+/)
      .filter(Boolean)
      .forEach((cls) => msg.classList.add(cls));
  }
  const allowHtml = options.allowHtml || false;
  if (allowHtml) {
    msg.innerHTML = sanitizeResponseHtml(content);
  } else {
    msg.textContent = stripHtml(content);
  }
  if (
    role === 'assistant' &&
    options.citations &&
    options.citations.length &&
    !isUnknownResponse(content) &&
    isChatHighlightEnabled(getCurrentPageKey())
  ) {
    const ref = document.createElement('button');
    ref.className = 'chat-ref';
    ref.type = 'button';
    ref.title = 'View source passage';
    ref.textContent = '1';
    ref.addEventListener('click', (e) => {
      e.stopPropagation();
      showCitationPopup(ref, options.citations, options.source || 'the text');
    });
    msg.appendChild(ref);
  }
  chatThread.appendChild(msg);
  if (chatThread.children.length <= 2) {
    chatThread.classList.add('chat-thread--single');
  } else {
    chatThread.classList.remove('chat-thread--single');
  }
  setChatEmptyVisible(false);
  chatThread.scrollTop = chatThread.scrollHeight;
  return msg;
}

export function appendAssistantMessage(content, options = {}) {
  return appendMessage('assistant', content, options);
}

function appendLoadingMessage() {
  if (!chatThread) return null;
  const msg = document.createElement('div');
  msg.className = 'chat-message assistant loading';
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-label', 'Waiting for response');
  msg.innerHTML = '<span class="chat-loading-spinner" aria-hidden="true"></span>';
  chatThread.appendChild(msg);
  chatThread.classList.remove('chat-thread--single');
  setChatEmptyVisible(false);
  chatThread.scrollTop = chatThread.scrollHeight;
  return msg;
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
  if (action === 'summary') {
    if (chatInput) chatInput.value = '';
    handleChatSend();
  }
}

function initializeSettings() {
  if (chatParagraphs) chatParagraphs.value = '2-4 lines';
  if (chatFormat) chatFormat.value = 'Simple wording';
  if (chatPoints) chatPoints.value = 'Bullet points';
  applyChatStyle(getChatSettings());
}

function clearTransientInfoMessages() {
  if (!chatThread) return;
  chatThread.querySelectorAll('.chat-message.chat-info-note').forEach((el) => el.remove());
}

async function handleChatSend() {
  if (!chatInput) return;
  const raw = chatInput.value.trim();
  const requestContextState = {
    pendingContextText: contextState.pendingContextText,
    pendingContextAction: contextState.pendingContextAction,
  };
  const fallbackFromContext =
    requestContextState.pendingContextText && requestContextState.pendingContextAction;
  if (!raw && !fallbackFromContext) return;

  const userText =
    raw ||
    (requestContextState.pendingContextAction === 'summary'
      ? 'Summarize the selected text.'
      : 'Explain the selected text.');
  openChatView();
  clearTransientInfoMessages();
  appendMessage('user', userText);
  chatInput.value = '';
  if (requestContextState.pendingContextText) clearChatContext();
  let loadingMsg = null;

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
  if (!requestContextState.pendingContextText && isSubjectiveOrUnclear(userText)) {
    appendMessage(
      'assistant',
      '<p><mark style="background-color:#E2ABE24D;">I don&#39;t think I understood your question.</mark> <u>Please rephrase it</u> or ask something directly from the text, and I will help. :)</p>',
      { allowHtml: true }
    );
    return;
  }
  if (!requestContextState.pendingContextText && !isGeneralRequest(userText)) {
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
    loadingMsg = appendLoadingMessage();
    const { text: response, source, citations } = await callOpenAI(
      userText,
      settings,
      requestContextState,
      currentPageKey,
      currentPageLabel
    );
    if (loadingMsg) {
      loadingMsg.remove();
      loadingMsg = null;
    }
    const safeResponse = settings.highlightsOn ? response : stripHighlightTags(response);
    appendMessage('assistant', safeResponse, { allowHtml: true, source, citations });
  } catch (err) {
    if (loadingMsg) {
      loadingMsg.remove();
      loadingMsg = null;
    }
    const detail = err && err.message ? ` (${err.message})` : '';
    appendMessage('assistant', `Sorry, I could not reach the chat service. Please try again.${detail}`);
    console.error(err);
  } finally {
    if (loadingMsg) loadingMsg.remove();
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

  const settingsInputs = [chatParagraphs, chatFormat, chatPoints].filter(Boolean);

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
