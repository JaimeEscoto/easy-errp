import { getTheme, setMode, onThemeChange } from './theme.js';

const MODE_LABEL = {
  light: 'Modo: Claro',
  dark: 'Modo: Oscuro',
};

const MODE_TITLE = {
  light: 'Cambiar a modo oscuro',
  dark: 'Cambiar a modo claro',
};

const MODE_ICON = {
  light: '☀️',
  dark: '🌙',
};

const updateToggleButton = (button, theme) => {
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const mode = theme.mode === 'dark' ? 'dark' : 'light';
  const label = button.querySelector('[data-theme-mode-label]');
  const icon = button.querySelector('[data-theme-mode-icon]');

  if (label) {
    label.textContent = MODE_LABEL[mode];
  }

  if (icon) {
    icon.textContent = MODE_ICON[mode];
  }

  button.dataset.mode = mode;
  button.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
  button.setAttribute('aria-label', MODE_TITLE[mode]);
  button.setAttribute('title', MODE_TITLE[mode]);
};

const bindToggleButton = (button) => {
  button.addEventListener('click', () => {
    const current = getTheme();
    const nextMode = current.mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
  });
};

export const initThemeControls = () => {
  const toggleButtons = Array.from(document.querySelectorAll('[data-theme-mode-toggle]'));

  if (toggleButtons.length === 0) {
    return;
  }

  toggleButtons.forEach((button) => bindToggleButton(button));

  const applyState = (theme) => {
    toggleButtons.forEach((button) => updateToggleButton(button, theme));
  };

  applyState(getTheme());
  onThemeChange(({ theme }) => applyState(theme));
};
