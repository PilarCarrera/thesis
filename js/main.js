import { initChat, hideChatContextBubble, closeFloatingMenu } from './chat.js';
import { initLeftPanel, loadPage, hideAllFloatingMenus } from './leftPanel.js';
import { initRightPanel, closeSettingsPanel } from './rightPanel.js';
import { initPageDrawer, closePageDrawer, closeTextSettings } from './pageDrawer.js';

const pagePickerBtn = document.querySelector('[data-page-picker-btn="true"]');
const pagePickerMenu = document.querySelector('[data-page-picker-menu="true"]');

function initPagePicker() {
  if (!pagePickerBtn || !pagePickerMenu) return;
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

function closeAllPopups() {
  hideAllFloatingMenus();
  hideChatContextBubble();
  closeFloatingMenu();
  closeSettingsPanel();
  closePageDrawer();
  closeTextSettings();
}

initLeftPanel();
initRightPanel();
initChat();
initPageDrawer();
initPagePicker();

loadPage('pageBook1');
closeAllPopups();
window.addEventListener('load', () => closeAllPopups());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllPopups();
});
