const STORAGE_KEY = 'easy-erp-session';

const parseSession = (value) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('Invalid session payload, ignoring.', error);
  }

  return null;
};

export const getSession = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  return parseSession(raw);
};

export const clearSession = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
};

const getDisplayNameFromSession = (session) => {
  if (!session) {
    return '';
  }

  const candidates = [session.displayName, session.name, session.email, session.username];
  const value = candidates.find((item) => typeof item === 'string' && item.trim().length > 0);

  if (value) {
    return value;
  }

  if (session.adminId !== undefined && session.adminId !== null) {
    return `Usuario ${session.adminId}`;
  }

  return '';
};

const applySessionToDom = (session) => {
  const displayName = getDisplayNameFromSession(session) || 'Usuario';
  const elements = document.querySelectorAll('[data-user-display]');

  elements.forEach((element) => {
    element.textContent = displayName;
  });
};

const attachLogoutHandlers = () => {
  const logoutElements = document.querySelectorAll('[data-logout]');

  logoutElements.forEach((element) => {
    if (element.dataset.sessionLogoutBound === 'true') {
      return;
    }

    element.dataset.sessionLogoutBound = 'true';
    element.addEventListener('click', () => {
      clearSession();
    });
  });
};

export const saveSession = (session) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  const normalized = session && typeof session === 'object' ? { ...session } : {};

  if (normalized.adminId === undefined && normalized.id !== undefined) {
    normalized.adminId = normalized.id;
  }

  if (!normalized.displayName) {
    normalized.displayName = getDisplayNameFromSession(normalized);
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  applySessionToDom(normalized);
  attachLogoutHandlers();
};

export const requireSession = () => {
  const session = getSession();

  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  applySessionToDom(session);
  attachLogoutHandlers();
  return session;
};

export const ensureSessionUi = () => {
  const session = getSession();

  if (session) {
    applySessionToDom(session);
  }

  attachLogoutHandlers();

  return session;
};

export const getDisplayName = (session = getSession()) => getDisplayNameFromSession(session);
