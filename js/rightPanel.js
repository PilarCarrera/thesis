import { openChatView, prefillChat, closeFloatingMenu } from './chat.js';

const rightPanel = document.querySelector('.panel.right');
const viewSwitchers = document.querySelectorAll('[data-switch]');
const settingsToggle = document.querySelector('[data-settings="toggle"]');
const settingsPanel = document.querySelector('.settings-panel');
const settingsTabs = document.querySelectorAll('[data-settings-tab]');
const settingsBodies = document.querySelectorAll('[data-settings-body]');
const mindMapBtn = document.querySelector('[data-mindmap="true"]');
const mindMapModal = document.getElementById('mindMapModal');
const mindMapCloseBtn = document.querySelector('[data-mindmap-close="true"]');
const floatingMenu = document.querySelector('.floating-menu');
const floatingMenuItems = document.querySelectorAll('[data-menu-action]');

function openMindMap() {
  if (!mindMapModal) return;
  mindMapModal.setAttribute('aria-hidden', 'false');
}

export function closeMindMap() {
  if (!mindMapModal) return;
  mindMapModal.setAttribute('aria-hidden', 'true');
}

export function closeSettingsPanel() {
  if (settingsPanel) settingsPanel.classList.remove('open');
}

function initSettingsTabs() {
  if (!settingsTabs.length || !settingsBodies.length) return;
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

export function initRightPanel() {
  if (rightPanel && viewSwitchers.length) {
    viewSwitchers.forEach((btn) => {
      btn.addEventListener('click', () => {
        rightPanel.dataset.view = btn.dataset.switch || 'chat';
      });
    });
  }

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

  initSettingsTabs();

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
        closeFloatingMenu();
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
        closeFloatingMenu();
      }
    });
  }
}
