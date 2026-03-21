import { getCurrentTtsConfig } from './chat.js';

let voiceCache = [];
let calibrationMultiplier = 1;

function loadVoices() {
  voiceCache = window.speechSynthesis?.getVoices?.() || [];
}

function resolveVoice(voiceLabel) {
  if (!voiceCache.length) loadVoices();
  if (!voiceCache.length) return null;

  const label = (voiceLabel || '').toLowerCase();
  const isFemale = label.includes('female');
  const isMale = label.includes('male');
  const requestedIndex = parseInt(label.replace(/[^0-9]/g, ''), 10);

  const matches = voiceCache.filter((voice) => {
    const name = (voice.name || '').toLowerCase();
    if (isFemale && !name.includes('female') && !name.includes('woman')) return false;
    if (isMale && !name.includes('male') && !name.includes('man')) return false;
    return true;
  });

  if (matches.length) {
    if (!Number.isNaN(requestedIndex) && requestedIndex > 0) {
      return matches[(requestedIndex - 1) % matches.length];
    }
    return matches[0];
  }

  return voiceCache[0];
}

export function speakText(text) {
  if (!text || !window.speechSynthesis) return;

  const { voiceLabel, rate } = getCurrentTtsConfig();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(voiceLabel);
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  utterance.lang = 'en-US';

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function initTts() {
  if (!window.speechSynthesis) return;
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function clearWordHighlights(wordSpans) {
  if (!wordSpans || !wordSpans.length) return;
  wordSpans.forEach((span) => span.classList.remove('tts-active'));
}


function estimateWordDurations(wordSpans, rate) {
  // Chrome docs: default rate ~180–220 WPM; use 200 WPM as baseline.
  const baseWpm = 200;
  const wpm = baseWpm * rate;
  const basePerWordMs = Math.max((60 / wpm) * 1000, 70) * calibrationMultiplier;
  return wordSpans.map((span) => {
    const text = span.textContent || '';
    const core = text.replace(/[)\]\}"']+$/g, '');
    const lengthBoost = Math.min(text.length / 8, 1) * basePerWordMs * 0.25;
    let pauseBoost = 0;
    if (/[.!?]$/.test(core)) pauseBoost += basePerWordMs * 1.0;
    else if (/[,;:]$/.test(core)) pauseBoost += basePerWordMs * 0.6;
    return Math.max(basePerWordMs + lengthBoost + pauseBoost, 70);
  });
}

function getCalibrationKey(voiceLabel, rate) {
  return `tts_calibration_${(voiceLabel || 'default').toLowerCase()}_${rate}`;
}

export function getCalibrationMultiplier() {
  return calibrationMultiplier;
}

export function setCalibrationMultiplier(value) {
  if (Number.isFinite(value) && value > 0.3 && value < 3) {
    calibrationMultiplier = value;
  }
}

export function loadCalibration(voiceLabel, rate) {
  try {
    const key = getCalibrationKey(voiceLabel, rate);
    const stored = localStorage.getItem(key);
    if (stored) {
      const value = parseFloat(stored);
      setCalibrationMultiplier(value);
      return value;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export function saveCalibration(voiceLabel, rate, multiplier) {
  try {
    const key = getCalibrationKey(voiceLabel, rate);
    localStorage.setItem(key, String(multiplier));
  } catch (err) {
    // ignore
  }
}

function estimateDurationSeconds(wordCount, rate) {
  const baseWpm = 180;
  const wpm = baseWpm * rate;
  if (!wpm) return 1;
  return Math.max((wordCount / wpm) * 60, 0.5);
}

export function speakWithHighlights(text, wordSpans, wordOffsets, sentenceRanges, onDone) {
  if (!text || !window.speechSynthesis) return;
  const { voiceLabel, rate, highlightColor } = getCurrentTtsConfig();
  loadCalibration(voiceLabel, rate);
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(voiceLabel);
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  utterance.lang = 'en-US';

  if (wordSpans && wordSpans.length) {
    let container = wordSpans[0].closest('[data-tts-container]');
    if (!container) container = wordSpans[0].closest('.tts-container');
    if (container) container.style.setProperty('--tts-highlight', highlightColor);
  }

  let lastWordIndex = -1;
  let boundarySeen = false;
  let wordTimerId = null;
  let wordTimerStart = 0;
  let wordTimerRemaining = null;
  let wordDurations = wordSpans ? estimateWordDurations(wordSpans, rate) : [];
  let currentWordIndex = 0;
  let paused = false;
  let stopped = false;

  const clearTimers = () => {
    if (wordTimerId) clearTimeout(wordTimerId);
    wordTimerId = null;
  };

  const finalize = () => {
    clearTimers();
    clearWordHighlights(wordSpans);
    if (onDone) onDone();
    if (controller && controller._onEnd) controller._onEnd();
  };

  const startWordFallback = () => {
    if (!wordSpans || !wordSpans.length) return;
    clearWordHighlights(wordSpans);
    currentWordIndex = 0;
    const tick = () => {
      if (stopped || paused) return;
      if (wordSpans[lastWordIndex]) wordSpans[lastWordIndex].classList.remove('tts-active');
      if (!wordSpans[currentWordIndex]) return;
      wordSpans[currentWordIndex].classList.add('tts-active');
      lastWordIndex = currentWordIndex;
      const duration = wordDurations[currentWordIndex] || 120;
      currentWordIndex += 1;
      if (currentWordIndex >= wordSpans.length) return;
      wordTimerStart = Date.now();
      wordTimerRemaining = duration;
      wordTimerId = setTimeout(tick, duration);
    };
    tick();
  };

  const boundaryFallbackTimer = setTimeout(() => {
    if (!boundarySeen) startWordFallback();
  }, 800);

  utterance.onboundary = (event) => {
    if (!wordOffsets || !wordOffsets.length) return;
    if (event.name && event.name !== 'word') return;
    boundarySeen = true;
    clearTimers();
    const charIndex = event.charIndex || 0;
    let low = 0;
    let high = wordOffsets.length - 1;
    let current = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (wordOffsets[mid] <= charIndex) {
        current = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (current !== lastWordIndex && wordSpans[current]) {
      if (wordSpans[lastWordIndex]) wordSpans[lastWordIndex].classList.remove('tts-active');
      wordSpans[current].classList.add('tts-active');
      lastWordIndex = current;
    }
  };

  utterance.onend = () => {
    clearTimeout(boundaryFallbackTimer);
    if (!stopped) finalize();
  };

  utterance.onerror = () => {
    clearTimeout(boundaryFallbackTimer);
    if (!stopped) finalize();
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);

  const wordCount = wordSpans ? wordSpans.length : text.trim().split(/\s+/).length;
  const durationSeconds = estimateDurationSeconds(wordCount, rate);

  const controller = {
    durationSeconds,
    _onEnd: null,
    _rate: rate,
    _voiceLabel: voiceLabel,
    pause() {
      paused = true;
      if (wordTimerId) {
        const elapsed = Date.now() - wordTimerStart;
        wordTimerRemaining = Math.max((wordTimerRemaining || 0) - elapsed, 0);
        clearTimeout(wordTimerId);
        wordTimerId = null;
      }
      window.speechSynthesis.pause();
    },
    resume() {
      paused = false;
      if (!boundarySeen && wordTimerRemaining !== null && wordTimerRemaining > 0) {
        wordTimerStart = Date.now();
        wordTimerId = setTimeout(() => {
          wordTimerRemaining = null;
          if (!stopped) startWordFallback();
        }, wordTimerRemaining);
      }
      window.speechSynthesis.resume();
    },
    stop() {
      stopped = true;
      window.speechSynthesis.cancel();
      finalize();
    },
    isSpeaking() {
      return window.speechSynthesis.speaking;
    },
    onEnd(cb) {
      this._onEnd = cb;
    },
  };
  return controller;
}

export function prepareContainerTts(container) {
  if (!container) return null;
  const originalHtml = container.innerHTML;
  const originalClass = container.className;
  const originalData = container.dataset.ttsContainer;
  container.dataset.ttsContainer = 'true';
  if (!container.classList.contains('tts-container')) {
    container.classList.add('tts-container');
  }
  const wordSpans = [];
  const wordOffsets = [];
  const sentenceRanges = [];
  let combinedText = '';
  let offset = 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  textNodes.forEach((node) => {
    const text = node.nodeValue;
    if (!text) return;
    const wordRegex = /\S+/g;
    let match;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();

    while ((match = wordRegex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > lastIndex) {
        const space = text.slice(lastIndex, start);
        fragment.appendChild(document.createTextNode(space));
        combinedText += space;
        offset += space.length;
      }
      const span = document.createElement('span');
      span.className = 'tts-word';
      span.textContent = match[0];
      fragment.appendChild(span);
      wordSpans.push(span);
      wordOffsets.push(offset);
      combinedText += match[0];
      offset += match[0].length;
      lastIndex = end;
    }

    if (lastIndex < text.length) {
      const tail = text.slice(lastIndex);
      fragment.appendChild(document.createTextNode(tail));
      combinedText += tail;
      offset += tail.length;
    }

    node.parentNode.replaceChild(fragment, node);
  });

  const sentenceRegex = /[^.!?]+[.!?]*/g;
  let sentenceMatch;
  while ((sentenceMatch = sentenceRegex.exec(combinedText)) !== null) {
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

  return {
    text: combinedText,
    wordSpans,
    wordOffsets,
    sentenceRanges,
    restore() {
      container.innerHTML = originalHtml;
      if (originalData === undefined) {
        delete container.dataset.ttsContainer;
      } else {
        container.dataset.ttsContainer = originalData;
      }
      container.className = originalClass;
    },
  };
}

export function calibrateTts(text, rate, voiceLabel, onDone) {
  if (!text || !window.speechSynthesis) return;
  const sampleWords = text.trim().split(/\s+/);
  const fakeSpans = sampleWords.map((word) => ({ textContent: word }));
  const previousMultiplier = calibrationMultiplier;
  calibrationMultiplier = 1;
  const expectedMs = estimateWordDurations(fakeSpans, rate).reduce((a, b) => a + b, 0);
  calibrationMultiplier = previousMultiplier;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(voiceLabel);
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  utterance.lang = 'en-US';

  const start = performance.now();

  utterance.onend = () => {
    const actualMs = performance.now() - start;
    const multiplier = actualMs / (expectedMs || 1);
    setCalibrationMultiplier(multiplier);
    saveCalibration(voiceLabel, rate, multiplier);
    if (onDone) onDone(multiplier);
  };

  utterance.onerror = () => {
    if (onDone) onDone(null);
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function calibrateAllSpeeds(text, voiceLabel, onDone) {
  const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  let index = 0;
  const runNext = () => {
    if (index >= rates.length) {
      if (onDone) onDone();
      return;
    }
    const rate = rates[index];
    index += 1;
    calibrateTts(text, rate, voiceLabel, () => runNext());
  };
  runNext();
}
