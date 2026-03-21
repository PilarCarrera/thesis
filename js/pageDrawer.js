import { loadPage } from './leftPanel.js';

const menuBtn = document.querySelector('.menu-btn');
const pageDrawerOverlay = document.getElementById('pageDrawerOverlay');
const pageDrawer = document.getElementById('pageDrawer');
const pageDrawerItems = document.querySelectorAll('[data-page-drawer]');
const contentEl = document.getElementById('reformattedContent');

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
}
