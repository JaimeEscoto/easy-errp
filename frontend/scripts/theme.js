const STORAGE_KEY = 'easy-erp-theme';

export const palettes = [
  {
    id: 'oceano',
    name: 'Océano corporativo',
    description: 'Azules intensos inspirados en el tono original del panel.',
    preview: ['#bfdbfe', '#3b82f6', '#1d4ed8'],
  },
  {
    id: 'esmeralda',
    name: 'Esmeralda brillante',
    description: 'Verdes energizantes ideales para operaciones financieras.',
    preview: ['#a7f3d0', '#34d399', '#047857'],
  },
  {
    id: 'ambar',
    name: 'Ámbar cálido',
    description: 'Matices dorados que evocan seguimiento comercial.',
    preview: ['#fde68a', '#f59e0b', '#b45309'],
  },
  {
    id: 'violeta',
    name: 'Violeta moderno',
    description: 'Gradientes púrpura con enfoque tecnológico y creativo.',
    preview: ['#ddd6fe', '#8b5cf6', '#6d28d9'],
  },
  {
    id: 'cerezo',
    name: 'Cerezo vibrante',
    description: 'Rojos elegantes para resaltar indicadores críticos.',
    preview: ['#fecdd3', '#f43f5e', '#be123c'],
  },
  {
    id: 'turquesa',
    name: 'Turquesa fresco',
    description: 'Tonos acuáticos que transmiten claridad y orden.',
    preview: ['#99f6e4', '#14b8a6', '#0f766e'],
  },
  {
    id: 'cielo',
    name: 'Cielo digital',
    description: 'Azules celestes para experiencias ligeras y modernas.',
    preview: ['#bae6fd', '#0ea5e9', '#0369a1'],
  },
  {
    id: 'indigo',
    name: 'Índigo profundo',
    description: 'Una identidad sobria con matices azul violáceos.',
    preview: ['#c7d2fe', '#6366f1', '#4338ca'],
  },
  {
    id: 'lima',
    name: 'Lima dinámica',
    description: 'Verdes cítricos para dashboards de alto contraste.',
    preview: ['#d9f99d', '#84cc16', '#4d7c0f'],
  },
  {
    id: 'grafito',
    name: 'Grafito ejecutivo',
    description: 'Una paleta neutra que maximiza la lectura de datos.',
    preview: ['#e2e8f0', '#64748b', '#334155'],
  },
];

const DEFAULT_THEME = {
  paletteId: palettes[0].id,
  mode: 'light',
};

const listeners = new Set();
let cachedTheme = { ...DEFAULT_THEME };

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getPalette = (paletteId) => palettes.find((item) => item.id === paletteId) || palettes[0];

const sanitizeTheme = (value) => {
  const theme = { ...DEFAULT_THEME };

  if (value && typeof value === 'object') {
    if (typeof value.paletteId === 'string' && getPalette(value.paletteId)) {
      theme.paletteId = value.paletteId;
    }

    if (value.mode === 'dark') {
      theme.mode = 'dark';
    }
  }

  return theme;
};

const readStoredTheme = () => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('No se pudo interpretar la configuración de tema almacenada.', error);
  }

  return null;
};

const persistTheme = (theme) => {
  cachedTheme = { ...theme };

  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch (error) {
    console.warn('No se pudo guardar la configuración de tema.', error);
  }
};

export const getTheme = () => {
  const stored = readStoredTheme();
  if (stored) {
    cachedTheme = sanitizeTheme(stored);
  }

  return { ...cachedTheme };
};

const notify = (theme) => {
  const palette = getPalette(theme.paletteId);
  listeners.forEach((listener) => {
    try {
      listener({ theme: { ...theme }, palette });
    } catch (error) {
      console.error('Error al ejecutar un listener de tema.', error);
    }
  });
};

export const onThemeChange = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const applyTheme = (theme = getTheme()) => {
  const normalized = sanitizeTheme(theme);
  const palette = getPalette(normalized.paletteId);
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const body = typeof document !== 'undefined' ? document.body : null;

  if (!root) {
    return normalized;
  }

  cachedTheme = { ...normalized };

  root.dataset.themePalette = palette.id;
  root.dataset.themeMode = normalized.mode;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(normalized.mode === 'dark' ? 'theme-dark' : 'theme-light');

  if (body) {
    body.dataset.themePalette = palette.id;
    body.dataset.themeMode = normalized.mode;
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(normalized.mode === 'dark' ? 'theme-dark' : 'theme-light');
  }

  notify(normalized);
  return normalized;
};

export const setTheme = (updates) => {
  const current = getTheme();
  const next = sanitizeTheme({ ...current, ...updates });
  persistTheme(next);
  return applyTheme(next);
};

export const setPalette = (paletteId) => setTheme({ paletteId });

export const setMode = (mode) => setTheme({ mode: mode === 'dark' ? 'dark' : 'light' });

export const initializeTheme = () => applyTheme(getTheme());

export const getPaletteDefinition = (paletteId) => getPalette(paletteId);
