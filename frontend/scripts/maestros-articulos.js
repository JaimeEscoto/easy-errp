import { requireSession } from './session.js';

const session = requireSession();
const currentAdminId = session?.adminId ?? session?.id ?? session?.userId ?? null;

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

const articleBasePath = '/api/articulos';

const articleTableBody = document.getElementById('articles-table-body');
const emptyState = document.getElementById('articles-empty-state');
const loadingIndicator = document.getElementById('articles-loading');
const errorBanner = document.getElementById('articles-error');
const searchInput = document.getElementById('article-search');
const addButton = document.getElementById('add-article-button');
const refreshButton = document.getElementById('refresh-articles-button');
const toggleInactiveButton = document.getElementById('toggle-inactive-articles-button');
const totalLabel = document.getElementById('articles-total');
const toastContainer = document.getElementById('toast-container');

const modal = document.getElementById('article-modal');
const modalForm = document.getElementById('article-form');
const modalTitle = document.getElementById('article-modal-title');
const modalSubtitle = document.getElementById('article-modal-subtitle');
const modalCloseButton = document.getElementById('close-article-modal');
const modalCancelButton = document.getElementById('cancel-article-modal');
const modalSubmitButton = document.getElementById('article-submit-button');

const fieldCodigo = document.getElementById('article-codigo');
const fieldNombre = document.getElementById('article-nombre');
const fieldDescripcion = document.getElementById('article-descripcion');
const fieldPrecio = document.getElementById('article-precio');
const fieldExistencia = document.getElementById('article-existencia');
const fieldUnidad = document.getElementById('article-unidad');
const fieldActivo = document.getElementById('article-activo');

let articles = [];
let currentArticleId = null;
let isSubmitting = false;
let showOnlyInactive = false;

const getArticleStateRawValue = (article) => {
  if (!article) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(article, 'activo')) {
    return article.activo;
  }

  return getFieldValue(article, ['active', 'habilitado', 'enabled']);
};

const interpretActiveState = (stateValue) => {
  if (typeof stateValue === 'string') {
    const normalized = stateValue.trim().toLowerCase();
    if (['false', '0', 'no', 'inactivo', 'inactive'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'si', 'sí', 'activo', 'active'].includes(normalized)) {
      return true;
    }
  }

  if (typeof stateValue === 'number') {
    return stateValue !== 0;
  }

  if (typeof stateValue === 'boolean') {
    return stateValue;
  }

  return true;
};

const isArticleActive = (article) => interpretActiveState(getArticleStateRawValue(article));
const isArticleInactive = (article) => !isArticleActive(article);

const updateToggleInactiveButton = () => {
  if (!toggleInactiveButton) {
    return;
  }

  toggleInactiveButton.textContent = '';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'h-4 w-4');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'currentColor');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 5c3.86 0 7 3.14 7 7s-3.14 7-7 7a6.98 6.98 0 01-5.65-2.83 1 1 0 10-1.7 1.06A8.98 8.98 0 0012 21c4.97 0 9-4.03 9-9s-4.03-9-9-9c-3.15 0-5.92 1.61-7.51 4.05a1 1 0 101.69 1.07A6.98 6.98 0 0112 5zm0 4a3 3 0 11-.001 6.001A3 3 0 0112 9z'
  );

  icon.appendChild(path);
  toggleInactiveButton.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'text-sm font-medium';
  label.textContent = showOnlyInactive ? 'Ver activos' : 'Ver desactivados';
  toggleInactiveButton.appendChild(label);

  toggleInactiveButton.setAttribute('aria-pressed', showOnlyInactive ? 'true' : 'false');
  toggleInactiveButton.classList.toggle('bg-blue-600', showOnlyInactive);
  toggleInactiveButton.classList.toggle('text-white', showOnlyInactive);
  toggleInactiveButton.classList.toggle('border-transparent', showOnlyInactive);
  toggleInactiveButton.classList.toggle('hover:bg-blue-700', showOnlyInactive);
  toggleInactiveButton.classList.toggle('hover:bg-gray-50', !showOnlyInactive);
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

  if (currentAdminId !== null && currentAdminId !== undefined) {
    options.headers['X-Admin-Id'] = currentAdminId;
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

const setHidden = (element, hidden) => {
  if (!element) {
    return;
  }

  if (hidden) {
    element.classList.add('hidden');
  } else {
    element.classList.remove('hidden');
  }
};

const pluralizeArticles = (count) => {
  if (!totalLabel) {
    return;
  }

  const label = count === 1 ? '1 artículo' : `${count} artículos`;
  totalLabel.textContent = label;
};

const getArticleIdentifier = (article) => {
  const identifier = article?.id ?? article?.codigo ?? article?.code;
  return identifier !== undefined && identifier !== null ? String(identifier) : '';
};

const getFieldValue = (article, keys) => {
  for (const key of keys) {
    const value = article?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const formatCurrency = (value) => {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(number);
};

const formatNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(number);
};

const formatDateTime = (value) => {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const renderArticles = () => {
  if (!articleTableBody) {
    return;
  }

  const query = searchInput?.value?.trim().toLowerCase() ?? '';
  const filteredArticles = articles.filter((article) => {
    if (showOnlyInactive && !isArticleInactive(article)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const valuesToSearch = [
      getFieldValue(article, ['codigo', 'code', 'sku', 'clave']),
      getFieldValue(article, ['nombre', 'name']),
      getFieldValue(article, ['descripcion', 'description']),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return valuesToSearch.some((value) => value.includes(query));
  });

  articleTableBody.innerHTML = '';

  if (!filteredArticles.length) {
    setHidden(emptyState, false);
    pluralizeArticles(filteredArticles.length);
    return;
  }

  setHidden(emptyState, true);

  const fragment = document.createDocumentFragment();

  filteredArticles.forEach((article) => {
    const identifier = getArticleIdentifier(article);
    const hasIdentifier = Boolean(identifier);
    const codigo = getFieldValue(article, ['codigo', 'code', 'sku', 'clave']) ?? '—';
    const nombre = getFieldValue(article, ['nombre', 'name']) ?? '—';
    const precio = formatCurrency(getFieldValue(article, ['precio', 'price', 'costo', 'cost']));
    const existencia = formatNumber(getFieldValue(article, ['existencia', 'stock', 'cantidad', 'quantity']));
    const activeRawValue = getArticleStateRawValue(article);
    const activeState =
      activeRawValue === undefined || activeRawValue === null || activeRawValue === ''
        ? null
        : interpretActiveState(activeRawValue);
    const actualizado = formatDateTime(getFieldValue(article, ['updated_at', 'updatedAt', 'fecha_actualizacion']));
    const estadoBadge = document.createElement('span');
    const estadoConfig =
      activeState === false
        ? { className: 'bg-red-100 text-red-700', label: 'Inactivo' }
        : activeState === true
        ? { className: 'bg-emerald-100 text-emerald-700', label: 'Activo' }
        : { className: 'bg-gray-100 text-gray-600', label: 'Sin estado' };

    estadoBadge.className = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${estadoConfig.className}`;
    estadoBadge.textContent = estadoConfig.label;

    const row = document.createElement('tr');
    row.className = 'hover:bg-gray-50/60 transition';
    const disabledClass = hasIdentifier ? '' : 'opacity-60 cursor-not-allowed pointer-events-none';

    row.innerHTML = `
      <td class="px-4 py-3 text-sm font-medium text-gray-900">${codigo}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${nombre}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${precio}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${existencia}</td>
      <td class="px-4 py-3 text-sm text-gray-700">
        <span class="sr-only">${estadoConfig.label}</span>
      </td>
      <td class="px-4 py-3 text-sm text-gray-500">${actualizado}</td>
      <td class="px-4 py-3 text-sm text-gray-700">
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabledClass}"
            data-action="edit"
            data-id="${identifier}"
            ${hasIdentifier ? '' : 'disabled'}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 18.5V21h2.5l7.37-7.37-2.5-2.5L5 18.5zm13.71-7.79a1 1 0 000-1.41l-2-2a1 1 0 00-1.41 0l-1.58 1.59 3.46 3.46 1.53-1.64z" />
            </svg>
            Editar
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 ${disabledClass}"
            data-action="delete"
            data-id="${identifier}"
            ${hasIdentifier ? '' : 'disabled'}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 3a1 1 0 00-.993.883L8 4H4a1 1 0 000 2h16a1 1 0 000-2h-4l-.007-.117A1 1 0 0015 3H9zm-3 6a1 1 0 011 1v8a1 1 0 102 0v-8a1 1 0 112 0v8a1 1 0 102 0v-8a1 1 0 012 0v8a3 3 0 01-2.824 2.995L14 20H10a3 3 0 01-2.995-2.824L7 17V10a1 1 0 011-1z" />
            </svg>
            Desactivar
          </button>
        </div>
      </td>
    `;

    const estadoCell = row.children[4];
    estadoCell.appendChild(estadoBadge);
    fragment.appendChild(row);
  });

  articleTableBody.appendChild(fragment);
  pluralizeArticles(filteredArticles.length);
};

const showToast = (message, variant = 'success') => {
  if (!toastContainer) {
    return;
  }

  const variants = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-blue-600 text-white',
  };

  const toast = document.createElement('div');
  toast.className = `flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg transition-all duration-200 ${
    variants[variant] ?? variants.info
  }`;
  toast.innerHTML = `
    <span class="text-sm font-medium">${message}</span>
    <button type="button" class="ml-auto text-sm font-semibold underline decoration-white/60 decoration-2 underline-offset-4">
      Cerrar
    </button>
  `;

  let closed = false;

  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 200);
  };

  toast.querySelector('button')?.addEventListener('click', close);

  toastContainer.appendChild(toast);

  const timeoutId = setTimeout(close, 4500);
  let hoverTimeoutId = null;

  toast.addEventListener('mouseenter', () => {
    clearTimeout(timeoutId);
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }
  });

  toast.addEventListener('mouseleave', () => {
    if (!closed) {
      hoverTimeoutId = setTimeout(close, 1500);
    }
  });
};

const fetchArticles = async () => {
  setHidden(loadingIndicator, false);
  setHidden(errorBanner, true);
  setHidden(emptyState, true);
  articleTableBody.innerHTML = '';

  const result = await request('GET');

  setHidden(loadingIndicator, true);

  if (!result.ok) {
    if (errorBanner) {
      errorBanner.textContent =
        result?.data?.message || result?.error || 'No fue posible obtener la lista de artículos. Intenta nuevamente.';
      setHidden(errorBanner, false);
    }

    showToast('No se pudo cargar el catálogo. Verifica tu conexión o configuración.', 'error');
    return;
  }

  const payload = Array.isArray(result.data) ? result.data : [];
  articles = payload;
  renderArticles();
};

const openModal = ({ mode, article }) => {
  if (!modal || !modalForm) {
    return;
  }

  currentArticleId = mode === 'edit' ? getArticleIdentifier(article) : null;

  if (mode === 'edit') {
    modalTitle.textContent = 'Editar artículo';
    modalSubtitle.textContent = 'Actualiza los datos y guarda para mantener la información sincronizada.';
  } else {
    modalTitle.textContent = 'Nuevo artículo';
    modalSubtitle.textContent = 'Completa la información para agregarlo al catálogo.';
  }

  fieldCodigo.value = getFieldValue(article, ['codigo', 'code', 'sku', 'clave']) ?? '';
  fieldNombre.value = getFieldValue(article, ['nombre', 'name']) ?? '';
  fieldDescripcion.value = getFieldValue(article, ['descripcion', 'description']) ?? '';

  const precioValue = getFieldValue(article, ['precio', 'price', 'costo', 'cost']);
  if (precioValue !== undefined && precioValue !== null && precioValue !== '') {
    const precioNumber = Number(precioValue);
    fieldPrecio.value = Number.isNaN(precioNumber) ? '' : precioNumber;
  } else {
    fieldPrecio.value = '';
  }

  const existenciaValue = getFieldValue(article, ['existencia', 'stock', 'cantidad', 'quantity']);
  if (existenciaValue !== undefined && existenciaValue !== null && existenciaValue !== '') {
    const existenciaNumber = Number(existenciaValue);
    fieldExistencia.value = Number.isNaN(existenciaNumber) ? '' : existenciaNumber;
  } else {
    fieldExistencia.value = '';
  }

  fieldUnidad.value = getFieldValue(article, ['unidad', 'unidad_medida', 'unit']) ?? '';

  const activeValue = getFieldValue(article, ['activo', 'active', 'habilitado', 'enabled']);
  fieldActivo.checked = activeValue !== false;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  fieldCodigo.focus();
};

const closeModal = () => {
  if (!modal || !modalForm || isSubmitting) {
    return;
  }

  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
  modalForm.reset();
  currentArticleId = null;
};

const getFormPayload = () => {
  const rawData = new FormData(modalForm);
  const payload = {};

  const entries = {
    codigo: rawData.get('codigo'),
    nombre: rawData.get('nombre'),
    descripcion: rawData.get('descripcion'),
    precio: rawData.get('precio'),
    existencia: rawData.get('existencia'),
    unidad: rawData.get('unidad'),
    activo: rawData.get('activo') === 'on',
  };

  payload.codigo = entries.codigo?.trim() ?? '';
  payload.nombre = entries.nombre?.trim() ?? '';
  payload.descripcion = entries.descripcion?.trim() ?? '';
  payload.unidad = entries.unidad?.trim() ?? '';
  payload.activo = entries.activo;

  if (entries.precio !== null && entries.precio !== '') {
    const precioNumber = Number(entries.precio);
    if (!Number.isNaN(precioNumber)) {
      payload.precio = precioNumber;
    }
  }

  if (entries.existencia !== null && entries.existencia !== '') {
    const existenciaNumber = Number(entries.existencia);
    if (!Number.isNaN(existenciaNumber)) {
      payload.existencia = existenciaNumber;
    }
  }

  if (currentAdminId !== null && currentAdminId !== undefined) {
    const numericAdminId = Number(currentAdminId);
    const adminIdValue = Number.isNaN(numericAdminId) ? currentAdminId : numericAdminId;

    payload.updated_by = adminIdValue;

    if (!currentArticleId) {
      payload.created_by = adminIdValue;
    }
  }

  return payload;
};

const setSubmittingState = (state) => {
  isSubmitting = state;

  if (modalSubmitButton) {
    modalSubmitButton.disabled = state;
    modalSubmitButton.classList.toggle('opacity-70', state);
    modalSubmitButton.classList.toggle('cursor-not-allowed', state);
    modalSubmitButton.innerHTML = state
      ? '<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h4z"></path></svg> Guardando…'
      : 'Guardar cambios';
  }
};

const handleFormSubmit = async (event) => {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  const payload = getFormPayload();

  if (!payload.codigo || !payload.nombre) {
    showToast('Debes completar al menos el código y el nombre.', 'error');
    return;
  }

  if (currentAdminId === null || currentAdminId === undefined) {
    showToast('No se pudo identificar al usuario actual. Vuelve a iniciar sesión.', 'error');
    return;
  }

  setSubmittingState(true);

  const method = currentArticleId ? 'PUT' : 'POST';
  const path = currentArticleId ? `/${encodeURIComponent(currentArticleId)}` : '';
  const result = await request(method, path, payload);

  setSubmittingState(false);

  if (!result.ok) {
    const message = result?.data?.message || result?.error || 'Ocurrió un error al guardar el artículo.';
    showToast(message, 'error');
    return;
  }

  showToast(currentArticleId ? 'Artículo actualizado correctamente.' : 'Artículo creado con éxito.', 'success');
  closeModal();
  fetchArticles();
};

const handleDelete = async (identifier) => {
  if (!identifier) {
    showToast('No fue posible determinar el artículo seleccionado.', 'error');
    return;
  }

  if (currentAdminId === null || currentAdminId === undefined) {
    showToast('No se pudo identificar al usuario actual. Vuelve a iniciar sesión.', 'error');
    return;
  }

  const article = articles.find((item) => getArticleIdentifier(item) === identifier);
  const displayName = getFieldValue(article, ['nombre', 'name']) ?? identifier;

  const confirmDelete = window.confirm(
    `¿Deseas desactivar el artículo "${displayName}"? Podrás volver a activarlo desde el catálogo.`
  );

  if (!confirmDelete) {
    return;
  }

  const result = await request('DELETE', `/${encodeURIComponent(identifier)}`);

  if (!result.ok) {
    const message = result?.data?.message || result?.error || 'No se pudo desactivar el artículo.';
    showToast(message, 'error');
    return;
  }

  showToast('El artículo se desactivó correctamente.', 'success');
  fetchArticles();
};

addButton?.addEventListener('click', () => {
  modalForm?.reset();
  fieldActivo.checked = true;
  openModal({ mode: 'create', article: {} });
});

modalCloseButton?.addEventListener('click', closeModal);
modalCancelButton?.addEventListener('click', closeModal);

modal?.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal();
  }
});

modalForm?.addEventListener('submit', handleFormSubmit);

searchInput?.addEventListener('input', () => {
  renderArticles();
});

refreshButton?.addEventListener('click', () => {
  fetchArticles();
});

toggleInactiveButton?.addEventListener('click', () => {
  showOnlyInactive = !showOnlyInactive;
  updateToggleInactiveButton();
  renderArticles();
});

articleTableBody?.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    return;
  }

  const identifier = actionButton.getAttribute('data-id');
  const action = actionButton.getAttribute('data-action');

  if (action === 'edit') {
    const article = articles.find((item) => getArticleIdentifier(item) === identifier);

    if (!article) {
      showToast('No se encontró la información del artículo seleccionado.', 'error');
      return;
    }

    openModal({ mode: 'edit', article });
  } else if (action === 'delete') {
    handleDelete(identifier);
  }
});

updateToggleInactiveButton();
fetchArticles();
