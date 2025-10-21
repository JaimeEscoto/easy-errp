const sidebar = document.getElementById('sidebar');
const toggleButton = document.getElementById('sidebar-toggle');
const overlay = document.getElementById('sidebar-overlay');

const closeSidebar = () => {
  sidebar?.classList.add('-translate-x-full');
  overlay?.classList.add('hidden');
};

const openSidebar = () => {
  sidebar?.classList.remove('-translate-x-full');
  overlay?.classList.remove('hidden');
};

toggleButton?.addEventListener('click', () => {
  if (sidebar?.classList.contains('-translate-x-full')) {
    openSidebar();
  } else {
    closeSidebar();
  }
});

overlay?.addEventListener('click', closeSidebar);

const backendBaseUrl = window.APP_CONFIG?.backendUrl ?? '';
const backendLabel = document.getElementById('backend-url-label');

if (backendLabel) {
  backendLabel.textContent = backendBaseUrl || 'Mismo origen (no configurado)';
}

const buildUrl = (path) => {
  if (!backendBaseUrl) {
    return path;
  }

  return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
};

const articleBasePath = '/api/articles';

const formatPayload = (payload) => {
  if (payload === undefined || payload === null) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(payload);
  }
};

const setResult = (element, { status, ok, data, error }) => {
  if (!element) {
    return;
  }

  if (error) {
    element.textContent = `Error: ${error}`;
    return;
  }

  const statusLabel = status !== undefined && status !== null ? `Estado: ${status}` : 'Estado: sin respuesta';
  const outcomeLabel = ok === true ? ' (éxito)' : ok === false ? ' (error)' : '';
  const payload = formatPayload(data);

  element.textContent = `${statusLabel}${outcomeLabel}${payload ? `\n\n${payload}` : ''}`;
};

const setLoading = (element) => {
  if (!element) {
    return;
  }

  element.textContent = 'Cargando…';
};

const parseJsonInput = (inputValue) => {
  const trimmed = inputValue.trim();

  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed);
};

const request = async (method, pathSuffix = '', body) => {
  const url = buildUrl(`${articleBasePath}${pathSuffix}`);
  const options = {
    method,
    headers: {},
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('Content-Type') ?? '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else if (contentType.includes('text/')) {
      data = await response.text();
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const listButton = document.getElementById('list-articles');
const listResult = document.getElementById('list-result');
const getForm = document.getElementById('get-article-form');
const getResult = document.getElementById('get-result');
const createForm = document.getElementById('create-article-form');
const createPayloadField = document.getElementById('create-article-payload');
const createResult = document.getElementById('create-result');
const updateForm = document.getElementById('update-article-form');
const updateIdField = document.getElementById('update-article-id');
const updatePayloadField = document.getElementById('update-article-payload');
const updateResult = document.getElementById('update-result');
const deleteForm = document.getElementById('delete-article-form');
const deleteIdField = document.getElementById('delete-article-id');
const deleteResult = document.getElementById('delete-result');

listButton?.addEventListener('click', async () => {
  setLoading(listResult);
  const result = await request('GET');
  setResult(listResult, result);
});

getForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(getForm);
  const articleId = formData.get('articleId');

  if (!articleId) {
    setResult(getResult, { status: null, ok: false, error: 'Debes indicar un identificador.' });
    return;
  }

  setLoading(getResult);
  const result = await request('GET', `/${encodeURIComponent(articleId)}`);
  setResult(getResult, result);
});

createForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const body = parseJsonInput(createPayloadField?.value ?? '');
    setLoading(createResult);
    const result = await request('POST', '', body);
    setResult(createResult, result);
  } catch (error) {
    setResult(createResult, {
      status: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

updateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const articleId = updateIdField?.value?.trim();

  if (!articleId) {
    setResult(updateResult, { status: null, ok: false, error: 'Debes indicar un identificador.' });
    return;
  }

  try {
    const body = parseJsonInput(updatePayloadField?.value ?? '');
    setLoading(updateResult);
    const result = await request('PUT', `/${encodeURIComponent(articleId)}`, body);
    setResult(updateResult, result);
  } catch (error) {
    setResult(updateResult, {
      status: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

deleteForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const articleId = deleteIdField?.value?.trim();

  if (!articleId) {
    setResult(deleteResult, { status: null, ok: false, error: 'Debes indicar un identificador.' });
    return;
  }

  setLoading(deleteResult);
  const result = await request('DELETE', `/${encodeURIComponent(articleId)}`);
  setResult(deleteResult, result);
});
