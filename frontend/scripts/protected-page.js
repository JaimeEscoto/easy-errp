import { requireSession } from './session.js';
import { initializeTheme } from './theme.js';
import { initThemeControls } from './theme-controls.js';

requireSession();
initializeTheme();
initThemeControls();
