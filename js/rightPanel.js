import { openChatView, closeFloatingMenu, appendAssistantMessage } from './chat.js';

const rightPanel = document.querySelector('.panel.right');
const viewSwitchers = document.querySelectorAll('[data-switch]');
const settingsToggle = document.querySelector('[data-settings="toggle"]');
const settingsPanel = document.querySelector('.settings-panel');
const settingsTabs = document.querySelectorAll('[data-settings-tab]');
const settingsBodies = document.querySelectorAll('[data-settings-body]');
const floatingMenu = document.querySelector('.floating-menu');
const floatingMenuItems = document.querySelectorAll('[data-menu-action]');
const welcomeActionButtons = document.querySelectorAll('[data-welcome-action]');
const summaryHelpHtml =
  '<p><mark style="background-color:#E2ABE24D;">Select and highlight a part of the text on the left</mark>, then press <strong>Summary</strong> to get a summary of that part.</p>';
const chatHelpHtml =
  '<p>You can ask any question here. You can also <strong>highlight a specific part on the left</strong> and press <strong>Chat</strong> to ask about only that part.</p>';

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
  activateTab('responses');
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

  if (welcomeActionButtons.length) {
    welcomeActionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.welcomeAction;
        if (action === 'summary') {
          openChatView();
          appendAssistantMessage(summaryHelpHtml, { allowHtml: true, className: 'chat-info-note' });
          return;
        }
        if (action === 'chat') {
          openChatView();
          appendAssistantMessage(chatHelpHtml, { allowHtml: true, className: 'chat-info-note' });
        }
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

  if (floatingMenu && floatingMenuItems.length) {
    floatingMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-menu-action]');
      if (!btn) return;
      const action = btn.dataset.menuAction;
      if (action === 'summary') {
        openChatView();
        appendAssistantMessage(summaryHelpHtml, { allowHtml: true, className: 'chat-info-note' });
        closeFloatingMenu();
        return;
      }
      if (action === 'chat') {
        openChatView();
        appendAssistantMessage(chatHelpHtml, { allowHtml: true, className: 'chat-info-note' });
        closeFloatingMenu();
      }
    });
  }
}
