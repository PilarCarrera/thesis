import { loadPage } from './leftPanel.js';

const menuBtn = document.querySelector('.menu-btn');
const pageDrawerOverlay = document.getElementById('pageDrawerOverlay');
const pageDrawer = document.getElementById('pageDrawer');
const pageDrawerItems = document.querySelectorAll('[data-page-drawer]');
const textSettingsBtn = document.getElementById('textSettingsBtn');
const textSettingsPanel = document.getElementById('textSettingsPanel');
const globalFontType = document.getElementById('globalFontType');
const globalFontSize = document.getElementById('globalFontSize');

export function applyGlobalStyle() {
  const fontType = globalFontType ? globalFontType.value : 'Lexend';
  const fontSize = globalFontSize ? globalFontSize.value : '16';
  document.documentElement.style.setProperty('--global-font-family', fontType);
  document.documentElement.style.setProperty('--global-font-size', `${fontSize}px`);
}

function openPageDrawer() {
  if (!pageDrawer) return;
  if (pageDrawerOverlay) pageDrawerOverlay.hidden = false;
  pageDrawer.setAttribute('aria-hidden', 'false');
}

export function closePageDrawer() {
  if (!pageDrawer) return;
  if (pageDrawerOverlay) pageDrawerOverlay.hidden = true;
  pageDrawer.setAttribute('aria-hidden', 'true');
}

export function closeTextSettings() {
  if (textSettingsPanel) textSettingsPanel.classList.remove('open');
}

export function initPageDrawer() {
  if (menuBtn && pageDrawerOverlay && pageDrawer) {
    menuBtn.addEventListener('click', () => {
      const isOpen = pageDrawer.getAttribute('aria-hidden') === 'false';
      if (isOpen) closePageDrawer();
      else openPageDrawer();
    });

    pageDrawerOverlay.addEventListener('click', () => closePageDrawer());

    pageDrawerItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pageKey = btn.dataset.pageDrawer;
        loadPage(pageKey);
        closePageDrawer();
      });
    });
  }

  if (textSettingsBtn && textSettingsPanel) {
    textSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      textSettingsPanel.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!textSettingsBtn.contains(e.target) && !textSettingsPanel.contains(e.target)) {
        closeTextSettings();
      }
    });
  }

  if (globalFontType) {
    globalFontType.value = 'Lexend';
    globalFontType.addEventListener('change', applyGlobalStyle);
  }
  if (globalFontSize) {
    globalFontSize.value = '16';
    globalFontSize.addEventListener('change', applyGlobalStyle);
  }
  applyGlobalStyle();
}
