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

const thirdPartyBasePath = '/api/terceros';

const tableBody = document.getElementById('third-parties-table-body');
const emptyState = document.getElementById('third-parties-empty-state');
const loadingIndicator = document.getElementById('third-parties-loading');
const errorBanner = document.getElementById('third-parties-error');
const searchInput = document.getElementById('third-party-search');
const typeFilter = document.getElementById('third-party-type-filter');
const statusFilter = document.getElementById('third-party-status-filter');
const filtersForm = document.getElementById('third-party-filters-form');
const addButton = document.getElementById('add-third-party-button');
const refreshButton = document.getElementById('refresh-third-parties-button');
const toggleInactiveButton = document.getElementById('toggle-inactive-third-parties-button');
const totalLabel = document.getElementById('third-parties-total');
const toastContainer = document.getElementById('toast-container');

const historyModal = document.getElementById('third-party-history-modal');
const historyCloseButton = document.getElementById('close-third-party-history-modal');
const historyTitle = document.getElementById('third-party-history-title');
const historySubtitle = document.getElementById('third-party-history-subtitle');
const historyTimeline = document.getElementById('third-party-history-timeline');
const historyLoading = document.getElementById('third-party-history-loading');
const historyError = document.getElementById('third-party-history-error');
const historyEmpty = document.getElementById('third-party-history-empty');

const modal = document.getElementById('third-party-modal');
const modalForm = document.getElementById('third-party-form');
const modalTitle = document.getElementById('third-party-modal-title');
const modalSubtitle = document.getElementById('third-party-modal-subtitle');
const modalCloseButton = document.getElementById('close-third-party-modal');
const modalCancelButton = document.getElementById('cancel-third-party-modal');
const modalSubmitButton = document.getElementById('third-party-submit-button');

const fieldIdentificacion = document.getElementById('third-party-identificacion');
const fieldNombre = document.getElementById('third-party-nombre');
const fieldRazonSocial = document.getElementById('third-party-razon-social');
const fieldCorreo = document.getElementById('third-party-correo');
const fieldTelefono = document.getElementById('third-party-telefono');
const fieldRelacion = document.getElementById('third-party-relacion');
const fieldActivo = document.getElementById('third-party-activo');
const fieldNotas = document.getElementById('third-party-notas');

let thirdParties = [];
let isSubmitting = false;
let includeInactive = true;
let currentHistoryThirdPartyId = null;
let historyRequestToken = 0;
let isEditMode = false;
let currentEditingIdentifier = null;
let currentEditingThirdParty = null;

const setHidden = (element, hidden) => {
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', hidden);
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

const interpretBoolean = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', '1', 'si', 'sí', 'active', 'activo', 'habilitado', 'enabled', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', 'f', '0', 'no', 'inactive', 'inactivo', 'deshabilitado', 'disabled', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback ?? Boolean(value);
};

const getFieldValue = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const getThirdPartyIdentification = (thirdParty) =>
  getFieldValue(thirdParty, [
    'identificacion_fiscal',
    'identificacion',
    'nit',
    'numero_identificacion',
    'documento',
    'ruc',
    'tax_id',
  ]);

const getThirdPartyName = (thirdParty) =>
  getFieldValue(thirdParty, [
    'nombre_comercial',
    'nombre',
    'razon_social',
    'display_name',
    'nombre_cliente',
  ]);

const getThirdPartySubtitle = (thirdParty, name) => {
  const razonSocial = getFieldValue(thirdParty, ['razon_social', 'legal_name', 'nombre_legal']);
  if (razonSocial && razonSocial !== name) {
    return razonSocial;
  }

  const description = getFieldValue(thirdParty, ['descripcion', 'descripcion_corta', 'notas', 'nota', 'detalle']);
  if (description) {
    return description;
  }

  return null;
};

const getThirdPartyPhone = (thirdParty) =>
  getFieldValue(thirdParty, ['telefono_principal', 'telefono', 'telefono1', 'telefono_contacto', 'phone', 'mobile']);

const getThirdPartyEmail = (thirdParty) =>
  getFieldValue(thirdParty, ['correo_principal', 'correo', 'correo_electronico', 'email', 'mail']);

const getThirdPartyRecordId = (thirdParty) =>
  getFieldValue(thirdParty, [
    'id',
    'tercero_id',
    'terceroId',
    'third_party_id',
    'thirdPartyId',
    'uuid',
  ]);

const getThirdPartyStatus = (thirdParty) => {
  const explicit = getFieldValue(thirdParty, ['estado', 'status']);
  if (typeof explicit === 'string') {
    const normalized = explicit.trim().toLowerCase();
    if (['activo', 'activa', 'active', 'habilitado', 'enabled'].includes(normalized)) {
      return 'activo';
    }
    if (['inactivo', 'inactive', 'deshabilitado', 'disabled'].includes(normalized)) {
      return 'inactivo';
    }
  }

  const active = interpretBoolean(getFieldValue(thirdParty, ['activo', 'active', 'habilitado', 'enabled']), true);
  return active === false ? 'inactivo' : 'activo';
};

const normalizeRelation = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (['cliente · proveedor', 'cliente proveedor', 'cliente y proveedor', 'cliente proveedor', 'ambos', 'both'].includes(normalized)) {
    return 'ambos';
  }

  if (['cliente', 'client'].includes(normalized)) {
    return 'cliente';
  }

  if (['proveedor', 'supplier'].includes(normalized)) {
    return 'proveedor';
  }

  return null;
};

const getThirdPartyRelation = (thirdParty) => {
  const relationField = normalizeRelation(getFieldValue(thirdParty, ['tipo_relacion', 'relacion', 'relation_type', 'tipo']));

  let isClient = interpretBoolean(getFieldValue(thirdParty, ['es_cliente', 'cliente', 'is_client', 'cliente_flag']), null);
  let isSupplier = interpretBoolean(
    getFieldValue(thirdParty, ['es_proveedor', 'proveedor', 'is_supplier', 'proveedor_flag']),
    null
  );

  if (relationField === 'cliente') {
    isClient = true;
    isSupplier = false;
  } else if (relationField === 'proveedor') {
    isClient = false;
    isSupplier = true;
  } else if (relationField === 'ambos') {
    isClient = true;
    isSupplier = true;
  }

  if (isClient === true && isSupplier === true) {
    return 'ambos';
  }

  if (isClient === true) {
    return 'cliente';
  }

  if (isSupplier === true) {
    return 'proveedor';
  }

  return relationField ?? 'desconocido';
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
    const interpreted = interpretBoolean(value, null);
    if (interpreted === null) {
      return formatHistoryValue(value);
    }
    return interpreted ? 'Activo' : 'Inactivo';
  }

  if (['es_cliente', 'es_proveedor'].includes(field)) {
    const interpreted = interpretBoolean(value, null);
    if (interpreted === null) {
      return formatHistoryValue(value);
    }
    return interpreted ? 'Sí' : 'No';
  }

  if (['tipo_relacion', 'relacion'].includes(field)) {
    const normalized = normalizeRelation(value);
    if (normalized === 'cliente') {
      return 'Cliente';
    }
    if (normalized === 'proveedor') {
      return 'Proveedor';
    }
    if (normalized === 'ambos') {
      return 'Cliente · Proveedor';
    }
  }

  if (field === 'estado') {
    const label = String(value).trim();
    if (!label) {
      return '—';
    }
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  return formatHistoryValue(value);
};

const extractHistoryActor = (entry) => {
  const candidates = [
    'realizado_por_nombre',
    'realizado_por_label',
    'realizado_por',
    'actor_id',
    'modificado_por_nombre',
    'modificado_por',
    'creado_por_nombre',
    'creado_por',
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

const updateTotalLabel = (count) => {
  if (!totalLabel) {
    return;
  }

  const label = count === 1 ? '1 tercero' : `${count} terceros`;
  totalLabel.textContent = label;
};

const createRelationBadge = (relation) => {
  const badge = document.createElement('span');
  let className = 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold';
  let label = 'Sin definir';

  if (relation === 'cliente') {
    className += ' bg-blue-50 text-blue-600';
    label = 'Cliente';
  } else if (relation === 'proveedor') {
    className += ' bg-amber-50 text-amber-600';
    label = 'Proveedor';
  } else if (relation === 'ambos') {
    className += ' bg-emerald-50 text-emerald-600';
    label = 'Cliente · Proveedor';
  } else {
    className += ' bg-gray-100 text-gray-600';
  }

  badge.className = className;
  badge.textContent = label;
  return badge;
};

const createStatusBadge = (status) => {
  const badge = document.createElement('span');
  badge.className = 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold';

  if (status === 'activo') {
    badge.classList.add('bg-green-50', 'text-green-600');
    badge.innerHTML = '<span class="h-2 w-2 rounded-full bg-green-500"></span>Activo';
  } else {
    badge.classList.add('bg-red-50', 'text-red-500');
    badge.innerHTML = '<span class="h-2 w-2 rounded-full bg-red-400"></span>Inactivo';
  }

  return badge;
};

const renderThirdParties = (items) => {
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!Array.isArray(items) || !items.length) {
    setHidden(emptyState, false);
    updateTotalLabel(0);
    return;
  }

  setHidden(emptyState, true);

  const fragment = document.createDocumentFragment();

  items.forEach((thirdParty) => {
    const recordId = getThirdPartyRecordId(thirdParty);
    const rawIdentificacion = getThirdPartyIdentification(thirdParty);
    const identificacion = rawIdentificacion ?? '—';
    const identifier = recordId ?? rawIdentificacion;
    const nombre = getThirdPartyName(thirdParty) ?? '—';
    const subtitle = getThirdPartySubtitle(thirdParty, nombre);
    const telefono = getThirdPartyPhone(thirdParty) ?? '—';
    const correo = getThirdPartyEmail(thirdParty) ?? null;
    const status = getThirdPartyStatus(thirdParty);
    const relation = getThirdPartyRelation(thirdParty);

    const hasIdentifier = identifier !== null && identifier !== undefined && identifier !== '';
    const disabledClass = hasIdentifier ? '' : 'opacity-60 cursor-not-allowed pointer-events-none';

    const row = document.createElement('tr');
    row.className = 'transition-colors';
    if (hasIdentifier) {
      row.classList.add('hover:bg-blue-50/40', 'cursor-pointer');
      row.dataset.identifier = String(identifier);
      row.title = 'Haz clic para ver el historial de cambios';
    } else {
      row.classList.add('opacity-60');
    }

    row.innerHTML = `
      <td class="px-4 py-4 font-medium text-gray-900">${identificacion}</td>
      <td class="px-4 py-4">
        <div class="font-medium text-gray-900">${nombre}</div>
        ${subtitle ? `<p class="text-xs text-gray-500">${subtitle}</p>` : ''}
      </td>
      <td class="px-4 py-4">${telefono || '—'}</td>
      <td class="px-4 py-4">
        ${
          correo
            ? `<a href="mailto:${correo}" class="text-blue-600 hover:underline">${correo}</a>`
            : '<span class="text-gray-500">—</span>'
        }
      </td>
      <td class="px-4 py-4"></td>
      <td class="px-4 py-4"></td>
      <td class="px-4 py-4 text-right">
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 ${disabledClass}"
            data-action="edit"
            data-id="${hasIdentifier ? String(identifier) : ''}"
            ${hasIdentifier ? '' : 'disabled'}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 4h14a1 1 0 011 1v2H4V5a1 1 0 011-1zm-1 6h16l-1.2 9.6a1 1 0 01-.99.9H6.19a1 1 0 01-.99-.9L4 10zm7 2v6h2v-6h-2z" />
            </svg>
            Editar
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 ${disabledClass}"
            data-action="history"
            data-id="${hasIdentifier ? String(identifier) : ''}"
            ${hasIdentifier ? '' : 'disabled'}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5a1 1 0 10-2 0v5a1 1 0 00.293.707l3 3a1 1 0 101.414-1.414L13 11.586V7z" />
            </svg>
            Historial
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-xl border border-transparent bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 ${disabledClass}"
            disabled
          >
            ${status === 'activo' ? 'Inactivar' : 'Activar'}
          </button>
        </div>
      </td>
    `;

    row.children[4]?.appendChild(createRelationBadge(relation));
    row.children[5]?.appendChild(createStatusBadge(status));

    fragment.appendChild(row);
  });

  tableBody.appendChild(fragment);
  updateTotalLabel(items.length);
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

const openHistoryModalForThirdParty = (thirdParty) => {
  if (!historyModal) {
    return;
  }

  if (!thirdParty) {
    showToast('No se encontró la información del tercero seleccionado.', 'error');
    return;
  }

  const recordId = getThirdPartyRecordId(thirdParty);
  const identificacion = getThirdPartyIdentification(thirdParty);
  const nombre = getThirdPartyName(thirdParty);
  const subtitleParts = [identificacion, nombre].filter(Boolean);

  if (!recordId && !identificacion) {
    showToast('No fue posible determinar el identificador del tercero.', 'error');
    return;
  }

  if (historyTitle) {
    historyTitle.textContent = 'Historial de cambios';
  }

  if (historySubtitle) {
    historySubtitle.textContent = subtitleParts.length
      ? subtitleParts.join(' · ')
      : `ID interno: ${recordId ?? identificacion}`;
  }

  currentHistoryThirdPartyId = String(recordId ?? identificacion);
  resetHistoryModalState();
  setHidden(historyLoading, false);

  historyModal?.classList.remove('hidden');
  historyModal?.classList.add('flex');
  updateBodyScrollLock();

  const requestId = ++historyRequestToken;
  loadThirdPartyHistory(currentHistoryThirdPartyId, requestId);
};

const findThirdPartyLocally = (identifier) => {
  if (!identifier) {
    return null;
  }

  return thirdParties.find((item) => {
    const recordId = getThirdPartyRecordId(item);
    if (recordId !== undefined && recordId !== null && String(recordId) === String(identifier)) {
      return true;
    }

    const taxId = getThirdPartyIdentification(item);
    if (taxId !== undefined && taxId !== null && String(taxId) === String(identifier)) {
      return true;
    }

    return false;
  });
};

const closeHistoryModal = () => {
  if (!historyModal) {
    return;
  }

  historyModal.classList.add('hidden');
  historyModal.classList.remove('flex');
  resetHistoryModalState();
  currentHistoryThirdPartyId = null;

  if (historySubtitle) {
    historySubtitle.textContent = '';
  }

  updateBodyScrollLock();
};

const loadThirdPartyHistory = async (identifier, requestId) => {
  const result = await request('GET', `/${encodeURIComponent(identifier)}/historial`);

  if (requestId !== historyRequestToken) {
    return;
  }

  setHidden(historyLoading, true);

  if (!result.ok) {
    const message =
      result?.data?.message ||
      result?.error ||
      'No fue posible obtener el historial de este tercero. Intenta nuevamente más tarde.';

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
    showToast('No fue posible determinar el tercero seleccionado.', 'error');
    return;
  }

  const target = findThirdPartyLocally(identifier);

  if (!target) {
    showToast('No se encontró la información del tercero seleccionado.', 'error');
    return;
  }

  openHistoryModalForThirdParty(target);
};

const openEditModalForThirdParty = (thirdParty) => {
  if (!modal || !modalForm) {
    return;
  }

  if (!thirdParty) {
    showToast('No se encontró la información del tercero seleccionado.', 'error');
    return;
  }

  const recordId = getThirdPartyRecordId(thirdParty);
  const taxId = getThirdPartyIdentification(thirdParty);
  const identifier = recordId ?? taxId;
  const normalizedIdentifier =
    typeof identifier === 'string' ? identifier.trim() : identifier;

  if (normalizedIdentifier === null || normalizedIdentifier === undefined || normalizedIdentifier === '') {
    showToast('No fue posible determinar el tercero a editar.', 'error');
    return;
  }

  isEditMode = true;
  currentEditingIdentifier = normalizedIdentifier;
  currentEditingThirdParty = thirdParty;

  modalForm.reset();

  const nombre = getThirdPartyName(thirdParty) ?? '';
  const razonSocial =
    getFieldValue(thirdParty, ['razon_social', 'legal_name', 'nombre_legal', 'razonSocial']) ?? '';
  const correo = getThirdPartyEmail(thirdParty) ?? '';
  const telefono = getThirdPartyPhone(thirdParty) ?? '';
  const relation = getThirdPartyRelation(thirdParty);
  const status = getThirdPartyStatus(thirdParty);
  const notes =
    getFieldValue(thirdParty, ['notas_internas', 'notas', 'nota', 'comentario', 'comentarios']) ?? '';

  if (fieldIdentificacion) {
    const trimmedTaxId = taxId ? String(taxId).trim() : '';
    fieldIdentificacion.value = trimmedTaxId;
  }

  if (fieldNombre) {
    fieldNombre.value = nombre;
  }

  if (fieldRazonSocial) {
    fieldRazonSocial.value = razonSocial;
  }

  if (fieldCorreo) {
    fieldCorreo.value = correo;
  }

  if (fieldTelefono) {
    fieldTelefono.value = telefono;
  }

  if (fieldRelacion) {
    if (relation === 'proveedor') {
      fieldRelacion.value = 'proveedor';
    } else if (relation === 'ambos') {
      fieldRelacion.value = 'ambos';
    } else {
      fieldRelacion.value = 'cliente';
    }
  }

  if (fieldActivo) {
    fieldActivo.checked = status !== 'inactivo';
  }

  if (fieldNotas) {
    fieldNotas.value = notes;
  }

  if (modalTitle) {
    modalTitle.textContent = 'Editar tercero';
  }

  if (modalSubtitle) {
    const subtitleParts = [];
    if (taxId) {
      subtitleParts.push(`ID fiscal: ${taxId}`);
    }
    if (nombre) {
      subtitleParts.push(nombre);
    }

    modalSubtitle.textContent = subtitleParts.length
      ? subtitleParts.join(' · ')
      : 'Actualiza la información del cliente o proveedor seleccionado.';
  }

  if (modalSubmitButton) {
    modalSubmitButton.dataset.defaultLabel = 'Guardar cambios';
    modalSubmitButton.textContent = 'Guardar cambios';
  }

  isSubmitting = false;
  setSubmitButtonLoading(false);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  updateBodyScrollLock();

  fieldNombre?.focus();
};

const openEditForIdentifier = (identifier) => {
  if (!identifier) {
    showToast('No fue posible determinar el tercero seleccionado.', 'error');
    return;
  }

  const target = findThirdPartyLocally(identifier);

  if (!target) {
    showToast('No se encontró la información del tercero seleccionado.', 'error');
    return;
  }

  openEditModalForThirdParty(target);
};

const updateBodyScrollLock = () => {
  const modalOpen = modal?.classList.contains('flex');
  const historyOpen = historyModal?.classList.contains('flex');

  if (modalOpen || historyOpen) {
    document.body.classList.add('overflow-hidden');
  } else {
    document.body.classList.remove('overflow-hidden');
  }
};

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
  label.textContent = includeInactive ? 'Mostrando activos e inactivos' : 'Solo terceros activos';

  wrapper.appendChild(indicator);
  wrapper.appendChild(label);

  toggleInactiveButton.appendChild(wrapper);

  toggleInactiveButton.setAttribute('aria-checked', includeInactive ? 'true' : 'false');
  toggleInactiveButton.classList.toggle('bg-blue-50', includeInactive);
  toggleInactiveButton.classList.toggle('bg-white', !includeInactive);
  toggleInactiveButton.classList.toggle('border-blue-200', includeInactive);
  toggleInactiveButton.classList.toggle('border-gray-300', !includeInactive);
  toggleInactiveButton.classList.toggle('text-blue-700', includeInactive);
  toggleInactiveButton.classList.toggle('text-gray-700', !includeInactive);
};

const applyFilters = () => {
  if (!Array.isArray(thirdParties)) {
    thirdParties = [];
  }

  const searchTerm = (searchInput?.value ?? '').trim().toLowerCase();
  const typeValue = typeFilter?.value ?? 'todos';
  const statusValue = statusFilter?.value ?? 'todos';

  const filtered = thirdParties.filter((thirdParty) => {
    const status = getThirdPartyStatus(thirdParty);
    if (!includeInactive && status !== 'activo') {
      return false;
    }

    if (statusValue === 'activo' && status !== 'activo') {
      return false;
    }

    if (statusValue === 'inactivo' && status !== 'inactivo') {
      return false;
    }

    const relation = getThirdPartyRelation(thirdParty);

    if (typeValue === 'cliente' && !['cliente', 'ambos'].includes(relation)) {
      return false;
    }

    if (typeValue === 'proveedor' && !['proveedor', 'ambos'].includes(relation)) {
      return false;
    }

    if (typeValue === 'ambos' && relation !== 'ambos') {
      return false;
    }

    if (searchTerm) {
      const values = [
        getThirdPartyIdentification(thirdParty),
        getThirdPartyName(thirdParty),
        getFieldValue(thirdParty, ['razon_social', 'legal_name']),
        getThirdPartyPhone(thirdParty),
        getThirdPartyEmail(thirdParty),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      const matches = values.some((value) => value.includes(searchTerm));
      if (!matches) {
        return false;
      }
    }

    return true;
  });

  renderThirdParties(filtered);
};

const request = async (method, pathSuffix = '', body) => {
  const url = buildUrl(`${thirdPartyBasePath}${pathSuffix}`);
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
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : data?.message || response.statusText,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error?.message || 'Network error',
    };
  }
};

const sanitizePayload = (payload) => {
  const cleaned = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      cleaned[key] = trimmed.length ? trimmed : null;
      return;
    }

    cleaned[key] = value;
  });

  return cleaned;
};

const fetchThirdParties = async () => {
  setHidden(loadingIndicator, false);
  setHidden(errorBanner, true);
  setHidden(emptyState, true);

  if (tableBody) {
    tableBody.innerHTML = '';
  }

  const result = await request('GET');

  setHidden(loadingIndicator, true);

  if (!result.ok) {
    if (errorBanner) {
      errorBanner.textContent =
        result?.data?.message || result?.error || 'No fue posible obtener los terceros. Intenta nuevamente.';
      setHidden(errorBanner, false);
    }

    showToast('No se pudo cargar la información de terceros. Verifica tu conexión o configuración.', 'error');
    return;
  }

  thirdParties = Array.isArray(result.data) ? result.data : [];
  applyFilters();
};

const setSubmitButtonLoading = (loading) => {
  if (!modalSubmitButton) {
    return;
  }

  const defaultLabel = modalSubmitButton.dataset.defaultLabel ?? modalSubmitButton.textContent.trim();
  modalSubmitButton.dataset.defaultLabel = defaultLabel;

  if (loading) {
    modalSubmitButton.disabled = true;
    modalSubmitButton.classList.add('opacity-80', 'cursor-not-allowed');
    modalSubmitButton.innerHTML = `
      <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h4z"></path>
      </svg>
      Guardando…
    `;
  } else {
    modalSubmitButton.disabled = false;
    modalSubmitButton.classList.remove('opacity-80', 'cursor-not-allowed');
    modalSubmitButton.innerHTML = defaultLabel;
  }
};

const openCreateModal = () => {
  if (!modal || !modalForm) {
    return;
  }

  isEditMode = false;
  currentEditingIdentifier = null;
  currentEditingThirdParty = null;

  modalForm.reset();
  if (fieldRelacion) {
    fieldRelacion.value = 'cliente';
  }
  if (fieldActivo) {
    fieldActivo.checked = true;
  }

  if (modalTitle) {
    modalTitle.textContent = 'Registrar tercero';
  }

  if (modalSubtitle) {
    modalSubtitle.textContent = 'Completa la información del cliente o proveedor para añadirlo al maestro.';
  }

  if (modalSubmitButton) {
    modalSubmitButton.dataset.defaultLabel = 'Registrar tercero';
    modalSubmitButton.textContent = 'Registrar tercero';
  }

  isSubmitting = false;
  setSubmitButtonLoading(false);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  updateBodyScrollLock();

  fieldIdentificacion?.focus();
};

const closeModal = () => {
  if (!modal || !modalForm) {
    return;
  }

  if (isSubmitting) {
    return;
  }

  modal.classList.add('hidden');
  modal.classList.remove('flex');
  updateBodyScrollLock();
  modalForm.reset();
  isEditMode = false;
  currentEditingIdentifier = null;
  currentEditingThirdParty = null;

  if (modalSubtitle) {
    modalSubtitle.textContent = '';
  }

  if (modalSubmitButton) {
    modalSubmitButton.dataset.defaultLabel = 'Registrar tercero';
    modalSubmitButton.textContent = 'Registrar tercero';
  }

  setSubmitButtonLoading(false);
};

const handleFormSubmit = async (event) => {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  const identificacion = fieldIdentificacion?.value?.trim() ?? '';
  const nombre = fieldNombre?.value?.trim() ?? '';

  if (!identificacion || !nombre) {
    showToast('Debes completar la identificación fiscal y el nombre comercial.', 'error');
    return;
  }

  const relationValue = fieldRelacion?.value ?? 'cliente';
  const normalizedRelation = relationValue === 'ambos' ? 'ambos' : relationValue === 'proveedor' ? 'proveedor' : 'cliente';
  const activo = fieldActivo?.checked ?? true;
  const notas = fieldNotas?.value ?? '';

  const payload = {
    identificacion_fiscal: identificacion,
    nit: identificacion,
    nombre_comercial: nombre,
    razon_social: fieldRazonSocial?.value,
    correo_principal: fieldCorreo?.value,
    telefono_principal: fieldTelefono?.value,
    tipo_relacion: normalizedRelation,
    relacion: normalizedRelation,
    es_cliente: normalizedRelation === 'cliente' || normalizedRelation === 'ambos',
    es_proveedor: normalizedRelation === 'proveedor' || normalizedRelation === 'ambos',
    activo,
    estado: activo ? 'activo' : 'inactivo',
    notas,
    notas_internas: notas,
  };

  if (isEditMode) {
    if (
      currentEditingIdentifier === null ||
      currentEditingIdentifier === undefined ||
      currentEditingIdentifier === ''
    ) {
      showToast('No se pudo determinar el tercero a actualizar.', 'error');
      return;
    }

    if (currentAdminId !== null && currentAdminId !== undefined) {
      payload.modificado_por = currentAdminId;
    }

    if (currentAdminName) {
      payload.modificado_por_nombre = currentAdminName;
    }
  } else {
    if (currentAdminId !== null && currentAdminId !== undefined) {
      payload.creado_por = currentAdminId;
    }

    if (currentAdminName) {
      payload.creado_por_nombre = currentAdminName;
    }
  }

  const sanitizedPayload = sanitizePayload(payload);

  isSubmitting = true;
  setSubmitButtonLoading(true);

  let requestSucceeded = false;
  const method = isEditMode ? 'PUT' : 'POST';
  const identifierForRequest = isEditMode ? String(currentEditingIdentifier).trim() : '';
  const pathSuffix = isEditMode ? `/${encodeURIComponent(identifierForRequest)}` : '';
  const successMessage = isEditMode
    ? 'Tercero actualizado correctamente.'
    : 'Tercero registrado correctamente.';
  const failureMessage = isEditMode
    ? 'No fue posible actualizar el tercero. Intenta nuevamente.'
    : 'No fue posible registrar el tercero. Intenta nuevamente.';
  const unexpectedErrorMessage = isEditMode
    ? 'Ocurrió un error inesperado al actualizar el tercero.'
    : 'Ocurrió un error inesperado al registrar el tercero.';

  try {
    const result = await request(method, pathSuffix, sanitizedPayload);

    if (!result.ok) {
      const message = result?.data?.message || result?.error || failureMessage;
      showToast(message, 'error');
      return;
    }

    showToast(successMessage, 'success');
    requestSucceeded = true;
  } catch (error) {
    showToast(unexpectedErrorMessage, 'error');
  } finally {
    isSubmitting = false;
    setSubmitButtonLoading(false);

    if (requestSucceeded) {
      closeModal();
      fetchThirdParties();
    }
  }
};

addButton?.addEventListener('click', openCreateModal);
modalCloseButton?.addEventListener('click', closeModal);
modalCancelButton?.addEventListener('click', closeModal);
modal?.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

historyCloseButton?.addEventListener('click', closeHistoryModal);

historyModal?.addEventListener('click', (event) => {
  if (event.target === historyModal) {
    closeHistoryModal();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (historyModal?.classList.contains('flex')) {
      closeHistoryModal();
      return;
    }

    closeModal();
  }
});

modalForm?.addEventListener('submit', handleFormSubmit);

searchInput?.addEventListener('input', applyFilters);
typeFilter?.addEventListener('change', applyFilters);

statusFilter?.addEventListener('change', () => {
  const value = statusFilter.value;
  if (value === 'activo') {
    includeInactive = false;
  } else {
    includeInactive = true;
  }
  updateToggleInactiveButton();
  applyFilters();
});

filtersForm?.addEventListener('reset', (event) => {
  event.preventDefault();
  if (searchInput) {
    searchInput.value = '';
  }
  if (typeFilter) {
    typeFilter.value = 'todos';
  }
  if (statusFilter) {
    statusFilter.value = 'todos';
  }
  includeInactive = true;
  updateToggleInactiveButton();
  applyFilters();
});

refreshButton?.addEventListener('click', fetchThirdParties);

toggleInactiveButton?.addEventListener('click', () => {
  includeInactive = !includeInactive;

  if (statusFilter) {
    if (includeInactive) {
      if (statusFilter.value === 'activo') {
        statusFilter.value = 'todos';
      }
    } else {
      if (statusFilter.value !== 'activo') {
        statusFilter.value = 'activo';
      }
    }
  }

  updateToggleInactiveButton();
  applyFilters();
});

tableBody?.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.getAttribute('data-action');
    const identifier = actionButton.getAttribute('data-id');

    if (action === 'edit') {
      openEditForIdentifier(identifier);
      return;
    }

    if (action === 'history') {
      openHistoryForIdentifier(identifier);
      return;
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
updateTotalLabel(0);
fetchThirdParties();
