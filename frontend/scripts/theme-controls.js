import { getTheme, onThemeChange, toggleMode } from './theme.js';

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
  const handleToggle = () => {
    const theme = toggleMode();
    updateToggleButton(button, theme);
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    handleToggle();
  });

  button.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    handleToggle();
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
