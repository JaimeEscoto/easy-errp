import { requireSession } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para administrar los almacenes.');
}

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

const buildUrl = (path) => {
  if (!backendBaseUrl) {
    return path;
  }

  return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
};

const tableBody = document.getElementById('warehouse-table-body');
const loadingIndicator = document.getElementById('warehouse-loading');
const errorBanner = document.getElementById('warehouse-error');
const emptyState = document.getElementById('warehouse-empty');
const refreshButton = document.getElementById('refresh-warehouses');
const form = document.getElementById('warehouse-form');
const formMessage = document.getElementById('warehouse-form-message');
const formTitle = document.getElementById('warehouse-form-title');
const formDescription = document.getElementById('warehouse-form-description');
const submitButton = document.getElementById('warehouse-submit');
const cancelEditButton = document.getElementById('cancel-warehouse-edit');

const defaultFormTitle = formTitle?.textContent?.trim() || 'Nuevo almacén';
const defaultFormDescription =
  formDescription?.textContent?.trim() || 'Completa el formulario para agregar un nuevo punto de resguardo.';
const defaultSubmitLabel = submitButton?.textContent?.trim() || 'Guardar almacén';
const editFormTitle = 'Editar almacén';
const editFormDescription = 'Actualiza los datos del almacén seleccionado y guarda los cambios.';
const editSubmitLabel = 'Actualizar almacén';

const setHidden = (element, hidden) => {
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', hidden);
};

const showError = (message) => {
  if (!errorBanner) {
    return;
  }

  errorBanner.textContent = message;
  setHidden(errorBanner, false);
};

const hideError = () => {
  if (!errorBanner) {
    return;
  }

  errorBanner.textContent = '';
  setHidden(errorBanner, true);
};

const formatDateTime = (value) => {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const interpretBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) {
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

    if (['true', '1', 'si', 'sí', 'activo', 'habilitado'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'inactivo', 'deshabilitado'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const toIdentifierString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed ? trimmed : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }

    return String(Math.trunc(value));
  }

  return String(value);
};

const getWarehousePrimaryId = (warehouse = {}) => {
  const candidates = [
    warehouse?.id,
    warehouse?.almacen_id,
    warehouse?.almacenId,
    warehouse?.warehouse_id,
    warehouse?.warehouseId,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();

      if (!trimmed) {
        continue;
      }

      return trimmed;
    }

    return candidate;
  }

  return null;
};

const getWarehouseDisplayKey = (warehouse = {}) => {
  const candidates = [
    warehouse?.id,
    warehouse?.almacen_id,
    warehouse?.almacenId,
    warehouse?.warehouse_id,
    warehouse?.warehouseId,
    warehouse?.codigo,
    warehouse?.code,
    warehouse?.nombre,
    warehouse?.name,
  ];

  for (const candidate of candidates) {
    const identifier = toIdentifierString(candidate);

    if (identifier) {
      return identifier;
    }
  }

  return null;
};

const warehousesState = {
  items: [],
  loading: false,
};

const editingState = {
  id: null,
  displayKey: null,
};

const exitEditMode = ({ preserveMessage = false } = {}) => {
  editingState.id = null;
  editingState.displayKey = null;

  if (form) {
    form.reset();

    const activeCheckbox = form.querySelector('#warehouse-active');

    if (activeCheckbox) {
      activeCheckbox.checked = true;
    }
  }

  if (!preserveMessage) {
    resetFormMessage();
  }

  if (formTitle) {
    formTitle.textContent = defaultFormTitle;
  }

  if (formDescription) {
    formDescription.textContent = defaultFormDescription;
  }

  if (submitButton) {
    submitButton.textContent = defaultSubmitLabel;
  }

  if (cancelEditButton) {
    cancelEditButton.classList.add('hidden');
  }
};

const startEditingWarehouse = (warehouse) => {
  if (!form) {
    return;
  }

  const primaryId = getWarehousePrimaryId(warehouse);

  if (primaryId === null || primaryId === undefined) {
    if (formMessage) {
      formMessage.textContent = 'No es posible editar este almacén porque no se encontró un identificador válido.';
      formMessage.className = 'text-sm font-medium text-red-600';
    }

    return;
  }

  const displayKey = getWarehouseDisplayKey(warehouse);

  editingState.id = primaryId;
  editingState.displayKey = displayKey;

  if (formTitle) {
    formTitle.textContent = editFormTitle;
  }

  if (formDescription) {
    formDescription.textContent = editFormDescription;
  }

  if (submitButton) {
    submitButton.textContent = editSubmitLabel;
  }

  if (cancelEditButton) {
    cancelEditButton.classList.remove('hidden');
  }

  const codeInput = form.querySelector('#warehouse-code');

  if (codeInput) {
    codeInput.value = warehouse?.codigo ?? warehouse?.code ?? '';
  }

  const nameInput = form.querySelector('#warehouse-name');

  if (nameInput) {
    nameInput.value = warehouse?.nombre ?? warehouse?.name ?? '';
  }

  const locationInput = form.querySelector('#warehouse-location');

  if (locationInput) {
    locationInput.value = warehouse?.ubicacion ?? warehouse?.location ?? '';
  }

  const notesInput = form.querySelector('#warehouse-notes');

  if (notesInput) {
    notesInput.value = warehouse?.notas ?? warehouse?.descripcion ?? warehouse?.notes ?? '';
  }

  const activeCheckbox = form.querySelector('#warehouse-active');

  if (activeCheckbox) {
    activeCheckbox.checked = interpretBoolean(
      warehouse?.activo ?? warehouse?.active ?? warehouse?.estado ?? warehouse?.status,
      true
    );
  }

  if (formMessage) {
    formMessage.textContent = 'Editando almacén seleccionado. Actualiza y guarda los cambios.';
    formMessage.className = 'text-sm text-blue-600';
  }

  renderWarehouses();
  nameInput?.focus();
};

const renderWarehouses = () => {
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!warehousesState.items.length) {
    setHidden(emptyState, false);
    return;
  }

  setHidden(emptyState, true);

  for (const warehouse of warehousesState.items) {
    const row = document.createElement('tr');
    row.className = 'transition hover:bg-blue-50/40';

    const name = warehouse?.nombre ?? warehouse?.name ?? 'Sin nombre';
    const code = warehouse?.codigo ?? warehouse?.code ?? '—';
    const location = warehouse?.ubicacion ?? warehouse?.location ?? '—';
    const active = interpretBoolean(
      warehouse?.activo ?? warehouse?.active ?? warehouse?.estado ?? warehouse?.status,
      true
    );
    const displayKey = getWarehouseDisplayKey(warehouse);
    const primaryId = getWarehousePrimaryId(warehouse);
    const updatedAt =
      warehouse?.actualizado_en ??
      warehouse?.modificado_en ??
      warehouse?.updated_at ??
      warehouse?.updatedAt ??
      warehouse?.created_at ??
      warehouse?.creado_en ??
      null;

    row.innerHTML = `
      <td class="px-4 py-3 font-mono text-xs text-gray-500">${code || '—'}</td>
      <td class="px-4 py-3 font-medium text-gray-900">${name}</td>
      <td class="px-4 py-3 text-gray-600">${location || '—'}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
          active
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-gray-100 text-gray-600'
        }">
          <span class="h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}"></span>
          ${active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td class="px-4 py-3 text-gray-500">${formatDateTime(updatedAt)}</td>
      <td class="px-4 py-3 text-right">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          data-action="edit"
        >
          Editar
        </button>
      </td>
    `;

    if (editingState.displayKey && displayKey && editingState.displayKey === displayKey) {
      row.classList.add('bg-blue-50/60', 'ring-1', 'ring-blue-300');
    }

    const editButton = row.querySelector('[data-action="edit"]');

    if (editButton) {
      if (primaryId === null || primaryId === undefined) {
        editButton.disabled = true;
        editButton.classList.add('cursor-not-allowed', 'opacity-60');
      } else {
        editButton.addEventListener('click', () => {
          startEditingWarehouse(warehouse);
        });
      }
    }

    tableBody.appendChild(row);
  }
};

const fetchWarehouses = async () => {
  if (!loadingIndicator) {
    return;
  }

  warehousesState.loading = true;
  setHidden(loadingIndicator, false);
  hideError();
  setHidden(emptyState, true);

  try {
    const response = await fetch(buildUrl('/api/almacenes'));

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.message || 'No fue posible obtener los almacenes.');
    }

    const result = await response.json();
    const items = Array.isArray(result?.almacenes) ? result.almacenes : Array.isArray(result) ? result : [];

    warehousesState.items = items;
    renderWarehouses();
  } catch (error) {
    console.error('Warehouse list error:', error);
    showError(error.message || 'Ocurrió un error al cargar los almacenes.');
    warehousesState.items = [];
    renderWarehouses();
  } finally {
    warehousesState.loading = false;
    setHidden(loadingIndicator, true);
  }
};

const resetFormMessage = () => {
  if (!formMessage) {
    return;
  }

  formMessage.textContent = '';
  formMessage.className = 'text-sm text-gray-600';
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form) {
    return;
  }

  resetFormMessage();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  payload.activo = form.querySelector('#warehouse-active')?.checked ?? true;

  const nombre = typeof payload.nombre === 'string' ? payload.nombre.trim() : '';

  if (!nombre) {
    formMessage.textContent = 'El nombre del almacén es obligatorio.';
    formMessage.className = 'text-sm font-medium text-red-600';
    return;
  }

  const isEditing = editingState.id !== null && editingState.id !== undefined;
  const normalizedEditingId = isEditing ? editingState.id : null;
  const requestUrl = isEditing
    ? buildUrl(`/api/almacenes/${encodeURIComponent(String(normalizedEditingId))}`)
    : buildUrl('/api/almacenes');
  const requestMethod = isEditing ? 'PUT' : 'POST';

  formMessage.textContent = isEditing ? 'Actualizando almacén…' : 'Guardando almacén…';
  formMessage.className = 'text-sm text-blue-600';

  try {
    const response = await fetch(requestUrl, {
      method: requestMethod,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result?.message || (isEditing ? 'No fue posible actualizar el almacén.' : 'No fue posible crear el almacén.'));
    }

    exitEditMode({ preserveMessage: true });
    renderWarehouses();
    formMessage.textContent = isEditing
      ? 'Almacén actualizado correctamente.'
      : 'Almacén registrado correctamente.';
    formMessage.className = 'text-sm font-medium text-emerald-600';

    await fetchWarehouses();
  } catch (error) {
    console.error('Warehouse save error:', error);
    formMessage.textContent = error.message || 'No se pudo guardar el almacén.';
    formMessage.className = 'text-sm font-medium text-red-600';
  }
});

refreshButton?.addEventListener('click', () => {
  fetchWarehouses();
});

cancelEditButton?.addEventListener('click', () => {
  exitEditMode();
  renderWarehouses();
});

fetchWarehouses();
