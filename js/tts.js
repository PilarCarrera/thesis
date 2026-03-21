import { getCurrentTtsConfig } from './chat.js';

let voiceCache = [];

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

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function initTts() {
  if (!window.speechSynthesis) return;
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}
