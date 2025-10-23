import {
  palettes,
  getTheme,
  setPalette,
  setMode,
  onThemeChange,
  getPaletteDefinition,
} from './theme.js';

let feedbackTimer;

const paletteGrid = document.querySelector('[data-theme-palette-grid]');
const feedbackElement = document.querySelector('[data-theme-feedback]');
const currentNameElement = document.querySelector('[data-theme-current-name]');
const modeButtons = Array.from(document.querySelectorAll('[data-theme-mode-choice]'));

const createSwatch = (color) => {
  const span = document.createElement('span');
  span.className = 'h-8 w-8 rounded-full border border-white/40 shadow-sm';
  span.style.backgroundColor = color;
  span.setAttribute('aria-hidden', 'true');
  return span;
};

const showFeedback = (message) => {
  if (!feedbackElement) {
    return;
  }

  feedbackElement.textContent = message;
  feedbackElement.classList.add('is-visible');

  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
  }

  feedbackTimer = setTimeout(() => {
    feedbackElement.classList.remove('is-visible');
  }, 2200);
};

const updatePaletteCards = (activePaletteId) => {
  if (!paletteGrid) {
    return;
  }

  paletteGrid.querySelectorAll('[data-palette-option]').forEach((button) => {
    const isActive = button.dataset.paletteOption === activePaletteId;
    button.dataset.active = isActive ? 'true' : 'false';
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
};

const updateModeButtons = (mode) => {
  modeButtons.forEach((button) => {
    const isActive = button.dataset.themeModeChoice === mode;
    button.dataset.active = isActive ? 'true' : 'false';
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
};

const updateCurrentPaletteName = (paletteId) => {
  if (!currentNameElement) {
    return;
  }

  const palette = getPaletteDefinition(paletteId);
  currentNameElement.textContent = palette.name;
};

const renderPaletteCards = () => {
  if (!paletteGrid) {
    return;
  }

  palettes.forEach((palette) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'palette-card w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/20';
    button.dataset.paletteOption = palette.id;
    button.setAttribute('aria-pressed', 'false');

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-start justify-between gap-4';

    const info = document.createElement('div');
    info.className = 'space-y-2';

    const title = document.createElement('h3');
    title.className = 'palette-name text-base font-semibold text-gray-900';
    title.textContent = palette.name;

    const description = document.createElement('p');
    description.className = 'text-sm text-gray-500';
    description.textContent = palette.description;

    info.appendChild(title);
    info.appendChild(description);

    const preview = document.createElement('div');
    preview.className = 'flex items-center gap-2';
    palette.preview.forEach((color) => {
      preview.appendChild(createSwatch(color));
    });

    wrapper.appendChild(info);
    wrapper.appendChild(preview);
    button.appendChild(wrapper);

    button.addEventListener('click', () => {
      setPalette(palette.id);
      showFeedback(`Estilo "${palette.name}" activado.`);
    });

    paletteGrid.appendChild(button);
  });
};

const bindModeButtons = () => {
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const choice = button.dataset.themeModeChoice === 'dark' ? 'dark' : 'light';
      setMode(choice);
      showFeedback(choice === 'dark' ? 'Modo oscuro activado.' : 'Modo claro activado.');
    });
  });
};

const syncWithTheme = () => {
  const theme = getTheme();
  updatePaletteCards(theme.paletteId);
  updateModeButtons(theme.mode);
  updateCurrentPaletteName(theme.paletteId);
};

renderPaletteCards();
bindModeButtons();
syncWithTheme();

onThemeChange(({ theme }) => {
  updatePaletteCards(theme.paletteId);
  updateModeButtons(theme.mode);
  updateCurrentPaletteName(theme.paletteId);
});
