import { prepareContainerTts, speakWithHighlights, speakText, calibrateTts, calibrateAllSpeeds } from './tts.js';
import { appendTtsPlayer, appendUserMessage, openChatView } from './chat.js';

let activePageTts = null;

export function readSelection(range, fallbackText) {
  if (range && range.toString().trim()) {
    const originalText = range.toString();
    const prepared = wrapRangeForTts(range, originalText);
    const controller = speakWithHighlights(
      originalText,
      prepared.wordSpans,
      prepared.wordOffsets,
      prepared.sentenceRanges,
      () => {
        unwrapTtsWrapper(prepared.wrapper, originalText);
      }
    );
    return { controller };
  }
  if (fallbackText) speakText(fallbackText);
  return null;
}

export function readCurrentPage(container) {
  if (!container) return null;
  if (activePageTts) {
    activePageTts.controller.stop();
    activePageTts.restore();
    activePageTts = null;
  }
  const prepared = prepareContainerTts(container);
  if (!prepared || !prepared.text.trim()) return null;
  const controller = speakWithHighlights(
    prepared.text,
    prepared.wordSpans,
    prepared.wordOffsets,
    prepared.sentenceRanges,
    () => {
      prepared.restore();
      activePageTts = null;
    }
  );
  if (controller) {
    controller.calibrate = () => {
      controller.stop();
      prepared.restore();
      const sample = buildCalibrationSample(prepared.text);
      calibrateTts(sample, controller._rate || 1, controller._voiceLabel || '', () => {});
    };
    controller.calibrateAll = () => {
      controller.stop();
      prepared.restore();
      const sample = buildCalibrationSample(prepared.text);
      calibrateAllSpeeds(sample, controller._voiceLabel || '', () => {});
    };
  }
  activePageTts = { controller, restore: prepared.restore };
  return activePageTts;
}

function buildCalibrationSample(text) {
  const words = text.trim().split(/\s+/);
  const sampleWords = words.slice(0, 60);
  return sampleWords.join(' ');
}

export function readCurrentPageFromChat(container) {
  openChatView();
  const title = 'Read the text out loud from the current page';
  const tts = readCurrentPage(container);
  if (tts) appendUserMessage(title);
  if (tts && tts.controller) appendTtsPlayer(title, tts.controller);
}

function wrapRangeForTts(range, text) {
  const wrapper = document.createElement('span');
  wrapper.dataset.ttsContainer = 'true';
  wrapper.className = 'tts-container';

  const wordSpans = [];
  const wordOffsets = [];
  const sentenceRanges = [];

  const wordRegex = /\S+/g;
  let match;
  let lastIndex = 0;

  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      wrapper.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }
    const span = document.createElement('span');
    span.className = 'tts-word';
    span.textContent = match[0];
    wrapper.appendChild(span);
    wordSpans.push(span);
    wordOffsets.push(start);
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    wrapper.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  const sentenceRegex = /[^.!?]+[.!?]*/g;
  let sentenceMatch;
  while ((sentenceMatch = sentenceRegex.exec(text)) !== null) {
    const sStart = sentenceMatch.index;
    const sEnd = sStart + sentenceMatch[0].length;
    let startWord = null;
    let endWord = null;
    for (let i = 0; i < wordOffsets.length; i += 1) {
      const wordStart = wordOffsets[i];
      if (wordStart >= sStart && wordStart < sEnd && startWord === null) startWord = i;
      if (wordStart < sEnd) endWord = i;
    }
    if (startWord !== null && endWord !== null) {
      sentenceRanges.push({ startIndex: startWord, endIndex: endWord });
    }
  }

  range.deleteContents();
  range.insertNode(wrapper);
  return { wrapper, wordSpans, wordOffsets, sentenceRanges };
}

function unwrapTtsWrapper(wrapper, text) {
  if (!wrapper || !wrapper.parentNode) return;
  const textNode = document.createTextNode(text);
  wrapper.parentNode.replaceChild(textNode, wrapper);
}
