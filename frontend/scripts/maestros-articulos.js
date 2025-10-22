import { requireSession, getDisplayName } from './session.js';

const session = requireSession();
const currentAdminId = session?.adminId ?? session?.id ?? session?.userId ?? null;
const currentAdminName = getDisplayName(session);

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

const historyModal = document.getElementById('article-history-modal');
const historyCloseButton = document.getElementById('close-article-history-modal');
const historyTitle = document.getElementById('article-history-title');
const historySubtitle = document.getElementById('article-history-subtitle');
const historyTimeline = document.getElementById('article-history-timeline');
const historyLoading = document.getElementById('article-history-loading');
const historyError = document.getElementById('article-history-error');
const historyEmpty = document.getElementById('article-history-empty');

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
let includeInactive = false;
let currentHistoryArticleId = null;
let historyRequestToken = 0;

const updateBodyScrollLock = () => {
  const articleModalOpen = modal?.classList.contains('flex');
  const historyModalOpen = historyModal?.classList.contains('flex');

  if (articleModalOpen || historyModalOpen) {
    document.body.classList.add('overflow-hidden');
  } else {
    document.body.classList.remove('overflow-hidden');
  }
};

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

  toggleInactiveButton.innerHTML = '';

  const wrapper = document.createElement('span');
  wrapper.className = 'flex items-center gap-3';

  const indicator = document.createElement('span');
  indicator.className = `relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
    includeInactive ? 'bg-blue-600/90' : 'bg-gray-300'
  }`;

  const handle = document.createElement('span');
  handle.className = `inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-blue-600 shadow transition-transform duration-200 transform ${
    includeInactive ? 'translate-x-4 opacity-100' : 'translate-x-0 opacity-0'
  }`;
  handle.innerHTML =
    '<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.414 0l-3.2-3.2a1 1 0 011.414-1.414l2.493 2.493 6.493-6.493a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';

  indicator.appendChild(handle);

  const label = document.createElement('span');
  label.className = 'text-sm font-medium';
  label.textContent = includeInactive ? 'Mostrando también desactivados' : 'Mostrar artículos desactivados';

  wrapper.appendChild(indicator);
  wrapper.appendChild(label);

  toggleInactiveButton.appendChild(wrapper);

  toggleInactiveButton.setAttribute('aria-checked', includeInactive ? 'true' : 'false');
  toggleInactiveButton.setAttribute(
    'aria-label',
    includeInactive ? 'Ocultar artículos desactivados' : 'Mostrar artículos desactivados'
  );
  toggleInactiveButton.classList.toggle('bg-blue-50', includeInactive);
  toggleInactiveButton.classList.toggle('bg-white', !includeInactive);
  toggleInactiveButton.classList.toggle('border-blue-200', includeInactive);
  toggleInactiveButton.classList.toggle('border-gray-300', !includeInactive);
  toggleInactiveButton.classList.toggle('text-blue-700', includeInactive);
  toggleInactiveButton.classList.toggle('text-gray-700', !includeInactive);
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

  if (currentAdminName) {
    options.headers['X-Admin-Name'] = currentAdminName;
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

const isMissingJsonbLengthSupportError = (result) => {
  if (!result || typeof result !== 'object') {
    return false;
  }

  if (result?.data?.code === '42883') {
    return true;
  }

  const fieldsToCheck = [result?.data?.message, result?.data?.details, result?.data?.hint, result?.error];

  return fieldsToCheck.some((field) => {
    if (typeof field !== 'string') {
      return false;
    }

    return field.toLowerCase().includes('jsonb_object_length');
  });
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

const getHistoryTimestamp = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidates = [
    'created_at',
    'creado_en',
    'inserted_at',
    'createdAt',
    'creadoEn',
    'fecha',
    'fecha_creacion',
    'fechaCreacion',
    'timestamp',
    'registrado_en',
  ];

  for (const key of candidates) {
    const value = entry[key];
    if (!value) {
      continue;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

const formatHistoryValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return String(value);
    }
  }

  return String(value);
};

const formatHistoryFieldValue = (field, value) => {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  if (field === 'activo') {
    const interpreted = interpretActiveState(value);
    return interpreted ? 'Activo' : 'Inactivo';
  }

  if (['precio', 'price', 'costo', 'cost'].includes(field)) {
    return formatCurrency(value);
  }

  if (['existencia', 'stock', 'cantidad', 'quantity'].includes(field)) {
    return formatNumber(value);
  }

  return formatHistoryValue(value);
};

const extractHistoryActor = (entry) => {
  const candidates = [
    'realizado_por_nombre',
    'realizado_por_label',
    'realizado_por',
    'actor_id',
    'updated_by',
    'modificado_por',
    'created_by',
    'admin_id',
    'usuario',
    'user_id',
  ];

  for (const key of candidates) {
    const value = entry?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const normalizeHistoryChanges = (entry) => {
  const rawChanges = entry?.cambios ?? entry?.changes ?? null;
  let parsedChanges = rawChanges;

  if (typeof rawChanges === 'string') {
    try {
      parsedChanges = JSON.parse(rawChanges);
    } catch (_err) {
      parsedChanges = null;
    }
  }

  if (!parsedChanges || typeof parsedChanges !== 'object') {
    return [];
  }

  return Object.entries(parsedChanges).map(([field, detail]) => {
    if (detail && typeof detail === 'object') {
      const before = detail.before ?? detail.antes ?? detail.prev ?? detail.previous ?? null;
      const after = detail.after ?? detail.despues ?? detail.next ?? detail.nuevo ?? null;
      return { field, before, after };
    }

    return { field, before: null, after: detail };
  });
};

const describeHistoryAction = (action) => {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';

  switch (normalized) {
    case 'create':
    case 'crear':
    case 'creado':
      return { label: 'Creación', className: 'bg-emerald-100 text-emerald-700' };
    case 'update':
    case 'actualizar':
    case 'updated':
      return { label: 'Actualización', className: 'bg-blue-100 text-blue-700' };
    case 'disable':
    case 'desactivar':
    case 'inactive':
      return { label: 'Desactivación', className: 'bg-red-100 text-red-700' };
    case 'enable':
    case 'activar':
    case 'active':
      return { label: 'Activación', className: 'bg-amber-100 text-amber-700' };
    default:
      return { label: action ? action : 'Evento', className: 'bg-gray-100 text-gray-600' };
  }
};

const renderArticles = () => {
  if (!articleTableBody) {
    return;
  }

  const query = searchInput?.value?.trim().toLowerCase() ?? '';
  const filteredArticles = articles.filter((article) => {
    if (!includeInactive && isArticleInactive(article)) {
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
    row.className = 'transition';
    if (hasIdentifier) {
      row.classList.add('hover:bg-gray-50/60', 'cursor-pointer');
      row.dataset.identifier = identifier;
      row.title = 'Haz clic para ver el historial de cambios';
    } else {
      row.classList.add('opacity-60');
    }

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
            class="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabledClass}"
            data-action="history"
            data-id="${identifier}"
            ${hasIdentifier ? '' : 'disabled'}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5a1 1 0 10-2 0v5a1 1 0 00.293.707l3 3a1 1 0 101.414-1.414L13 11.586V7z" />
            </svg>
            Historial
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
  updateBodyScrollLock();
  fieldCodigo.focus();
};

const closeModal = () => {
  if (!modal || !modalForm || isSubmitting) {
    return;
  }

  modal.classList.add('hidden');
  modal.classList.remove('flex');
  updateBodyScrollLock();
  modalForm.reset();
  currentArticleId = null;
};

const resetHistoryModalState = () => {
  if (historyTimeline) {
    historyTimeline.innerHTML = '';
  }

  setHidden(historyLoading, true);
  setHidden(historyError, true);
  setHidden(historyEmpty, true);
};

const renderHistoryEntries = (entries) => {
  if (!historyTimeline) {
    return;
  }

  historyTimeline.innerHTML = '';

  if (!Array.isArray(entries) || !entries.length) {
    setHidden(historyEmpty, false);
    return;
  }

  setHidden(historyEmpty, true);

  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = getHistoryTimestamp(a);
    const dateB = getHistoryTimestamp(b);
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    return timeB - timeA;
  });

  const fragment = document.createDocumentFragment();

  sortedEntries.forEach((entry) => {
    const actionInfo = describeHistoryAction(entry?.accion ?? entry?.action);
    const timestamp = getHistoryTimestamp(entry);
    const actor = extractHistoryActor(entry);
    const note =
      entry?.descripcion ?? entry?.detalle ?? entry?.nota ?? entry?.comentario ?? entry?.comment ?? null;
    const changes = normalizeHistoryChanges(entry);

    const item = document.createElement('li');
    item.className = 'relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm';

    const header = document.createElement('div');
    header.className = 'flex flex-wrap items-center justify-between gap-3';

    const badge = document.createElement('span');
    badge.className = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${actionInfo.className}`;
    badge.textContent = actionInfo.label;

    const timeLabel = document.createElement('span');
    timeLabel.className = 'text-xs text-gray-500';
    timeLabel.textContent = timestamp ? formatDateTime(timestamp) : 'Fecha no disponible';

    header.appendChild(badge);
    header.appendChild(timeLabel);
    item.appendChild(header);

    const actorLabel = document.createElement('p');
    actorLabel.className = 'mt-2 text-sm text-gray-600';
    actorLabel.textContent = actor ? `Registrado por ${String(actor)}.` : 'Usuario no identificado.';
    item.appendChild(actorLabel);

    if (note) {
      const noteParagraph = document.createElement('p');
      noteParagraph.className = 'mt-2 text-sm text-gray-700';
      noteParagraph.textContent = String(note);
      item.appendChild(noteParagraph);
    }

    if (changes.length) {
      const changeList = document.createElement('ul');
      changeList.className = 'mt-3 space-y-1 text-xs text-gray-600';

      changes.forEach(({ field, before, after }) => {
        const changeItem = document.createElement('li');
        changeItem.innerHTML = `
          <span class="font-medium text-gray-700">${field}</span>
          <span class="text-gray-500">${formatHistoryFieldValue(field, before)}</span>
          <span class="px-1 text-gray-400">→</span>
          <span class="text-gray-700">${formatHistoryFieldValue(field, after)}</span>
        `;
        changeList.appendChild(changeItem);
      });

      item.appendChild(changeList);
    } else {
      const noChanges = document.createElement('p');
      noChanges.className = 'mt-3 text-xs text-gray-500';
      noChanges.textContent = 'No se registraron cambios específicos en este evento.';
      item.appendChild(noChanges);
    }

    fragment.appendChild(item);
  });

  historyTimeline.appendChild(fragment);
};

const openHistoryModalForArticle = (article) => {
  if (!historyModal) {
    return;
  }

  const identifier = getArticleIdentifier(article);

  if (!identifier) {
    showToast('No se encontró la información del artículo seleccionado.', 'error');
    return;
  }

  const codigo = getFieldValue(article, ['codigo', 'code', 'sku', 'clave']);
  const nombre = getFieldValue(article, ['nombre', 'name']);
  const subtitleParts = [codigo, nombre].filter(Boolean);

  historyTitle.textContent = 'Historial de cambios';
  historySubtitle.textContent = subtitleParts.length
    ? subtitleParts.join(' · ')
    : `ID de artículo: ${identifier}`;

  currentHistoryArticleId = identifier;
  resetHistoryModalState();
  setHidden(historyLoading, false);

  historyModal.classList.remove('hidden');
  historyModal.classList.add('flex');
  updateBodyScrollLock();

  const requestId = ++historyRequestToken;

  loadArticleHistory(identifier, requestId);
};

const closeHistoryModal = () => {
  if (!historyModal) {
    return;
  }

  historyModal.classList.add('hidden');
  historyModal.classList.remove('flex');
  resetHistoryModalState();
  currentHistoryArticleId = null;
  if (historySubtitle) {
    historySubtitle.textContent = '';
  }
  updateBodyScrollLock();
};

const loadArticleHistory = async (identifier, requestId) => {
  const result = await request('GET', `/${encodeURIComponent(identifier)}/historial`);

  if (requestId !== historyRequestToken) {
    return;
  }

  setHidden(historyLoading, true);

  if (!result.ok) {
    const message =
      result?.data?.message ||
      result?.error ||
      'No fue posible obtener el historial de este artículo. Intenta nuevamente más tarde.';

    if (historyError) {
      historyError.textContent = message;
      setHidden(historyError, false);
    }

    return;
  }

  const entries = Array.isArray(result.data) ? result.data : [];
  renderHistoryEntries(entries);
};

const openHistoryForIdentifier = (identifier) => {
  if (!identifier) {
    showToast('No fue posible determinar el artículo seleccionado.', 'error');
    return;
  }

  const article = articles.find((item) => getArticleIdentifier(item) === identifier);

  if (!article) {
    showToast('No se encontró la información del artículo seleccionado.', 'error');
    return;
  }

  openHistoryModalForArticle(article);
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
    if (isMissingJsonbLengthSupportError(result)) {
      console.warn(
        'Supabase devolvió un error por jsonb_object_length durante la actualización, pero se intentará continuar con la operación.'
      );
      showToast('Artículo actualizado. Se ignoró la advertencia de Supabase y se recargará el catálogo.', 'info');
      closeModal();
      fetchArticles();
      return;
    }

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
historyCloseButton?.addEventListener('click', closeHistoryModal);

modal?.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

historyModal?.addEventListener('click', (event) => {
  if (event.target === historyModal) {
    closeHistoryModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (historyModal?.classList.contains('flex')) {
      closeHistoryModal();
      return;
    }

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
  includeInactive = !includeInactive;
  updateToggleInactiveButton();
  renderArticles();
});

articleTableBody?.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
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
    } else if (action === 'history') {
      openHistoryForIdentifier(identifier);
    }

    return;
  }

  const row = event.target.closest('tr');

  if (!row) {
    return;
  }

  const identifier = row.dataset.identifier;

  if (!identifier) {
    return;
  }

  openHistoryForIdentifier(identifier);
});

updateToggleInactiveButton();
fetchArticles();
