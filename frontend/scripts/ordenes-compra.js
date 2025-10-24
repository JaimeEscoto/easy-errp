import { requireSession, getDisplayName } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para acceder a la pantalla de órdenes de compra.');
}

const currentAdminId = session?.adminId ?? session?.id ?? session?.userId ?? null;
const currentAdminName = getDisplayName(session);

const backendBaseUrl = window.APP_CONFIG?.backendUrl ?? '';

const buildUrl = (path) => {
  if (!backendBaseUrl) {
    return path;
  }

  return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
};

const purchaseForm = document.getElementById('purchase-order-form');
const purchaseSupplierSelect = document.getElementById('purchase-supplier');
const purchaseOrderDateInput = document.getElementById('purchase-order-date');
const purchaseDeliveryDateInput = document.getElementById('purchase-delivery-date');
const purchasePaymentTermsInput = document.getElementById('purchase-payment-terms');
const purchaseShippingMethodInput = document.getElementById('purchase-shipping-method');
const purchaseDeliveryLocationInput = document.getElementById('purchase-delivery-location');
const purchaseNotesInput = document.getElementById('purchase-notes');
const purchaseLinesBody = document.getElementById('purchase-lines-body');
const purchaseLinesEmpty = document.getElementById('purchase-lines-empty');
const purchaseLoading = document.getElementById('purchase-loading');
const purchaseFeedback = document.getElementById('purchase-feedback');
const purchaseSuccess = document.getElementById('purchase-success');
const purchaseResultCard = document.getElementById('purchase-result-card');
const addLineButton = document.getElementById('add-purchase-line');
const refreshButton = document.getElementById('refresh-purchase-catalogs');
const clearButton = document.getElementById('purchase-clear-button');
const purchaseSubtotalLabel = document.getElementById('purchase-subtotal');
const purchaseTaxesLabel = document.getElementById('purchase-taxes');
const purchaseTotalLabel = document.getElementById('purchase-total');
const purchaseSubmitButton = document.getElementById('purchase-submit-button');

let suppliers = [];
let articles = [];
const articleMap = new Map();
const lines = [];
const lineElements = new Map();
let isLoadingCatalogs = false;
let isSubmitting = false;

const setLoading = (value) => {
  isLoadingCatalogs = Boolean(value);

  if (!purchaseLoading) {
    return;
  }

  purchaseLoading.classList.toggle('hidden', !isLoadingCatalogs);
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'si', 'sí', 'activo', 'activa', 'habilitado', 'habilitada'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'inactivo', 'inactiva', 'deshabilitado', 'deshabilitada'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const interpretActiveState = (record = {}) => {
  const candidates = [record.activo, record.active, record.is_active, record.estado, record.status];

  for (const candidate of candidates) {
    const normalized = normalizeBoolean(candidate);

    if (normalized !== null) {
      return normalized;
    }

    if (typeof candidate === 'string') {
      const lowered = candidate.trim().toLowerCase();

      if (['activo', 'activa', 'active', 'habilitado', 'habilitada'].includes(lowered)) {
        return true;
      }

      if (['inactivo', 'inactiva', 'inactive', 'deshabilitado', 'deshabilitada'].includes(lowered)) {
        return false;
      }
    }
  }

  return true;
};

const interpretSupplierRelation = (record = {}) => {
  const relationRaw = record.tipo_relacion ?? record.relacion ?? record.tipo ?? '';
  const normalized = typeof relationRaw === 'string' ? relationRaw.trim().toLowerCase() : '';

  if (!normalized) {
    return null;
  }

  if (normalized.includes('proveedor') || normalized.includes('supplier') || normalized.includes('ambos')) {
    return true;
  }

  if (normalized.includes('cliente')) {
    return false;
  }

  return null;
};

const isSupplierRecord = (record = {}) => {
  const relation = interpretSupplierRelation(record);

  if (relation !== null) {
    return relation;
  }

  const candidate = normalizeBoolean(record.es_proveedor ?? record.is_supplier ?? record.proveedor);

  if (candidate !== null) {
    return candidate;
  }

  return false;
};

const getSupplierIdentifier = (supplier = {}) => {
  const candidates = [
    supplier.id,
    supplier.tercero_id,
    supplier.terceroId,
    supplier.identificacion_fiscal,
    supplier.identificacion,
    supplier.nit,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
      return candidate;
    }
  }

  return null;
};

const parseIdentifier = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const asNumber = Number(trimmed);

    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }

    return trimmed;
  }

  return value;
};

const getSupplierDisplayName = (supplier = {}) => {
  const candidates = [
    supplier.nombre_comercial,
    supplier.razon_social,
    supplier.nombre,
    supplier.contacto,
    supplier.display_name,
  ];

  const name = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim();
  const identifier =
    supplier.identificacion_fiscal ??
    supplier.identificacion ??
    supplier.nit ??
    supplier.id ??
    supplier.tercero_id ??
    supplier.terceroId ??
    '';

  if (name && identifier) {
    return `${name} · ${identifier}`;
  }

  if (name) {
    return name;
  }

  if (identifier) {
    return `Proveedor ${identifier}`;
  }

  return 'Proveedor sin nombre';
};

const request = async (method, path, body) => {
  const url = buildUrl(path);
  const headers = new Headers();

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (currentAdminId !== null && currentAdminId !== undefined) {
    headers.set('x-admin-id', currentAdminId);
    headers.set('x-actor-id', currentAdminId);
  }

  if (currentAdminName) {
    headers.set('x-admin-name', currentAdminName);
    headers.set('x-actor-name', currentAdminName);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') ?? '';
  let payload = null;

  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const errorMessage = payload?.message ?? (typeof payload === 'string' ? payload : null) ?? 'Error inesperado.';
    const error = new Error(errorMessage);
    error.response = response;
    error.data = payload;
    throw error;
  }

  return payload;
};

const roundCurrency = (value) => {
  return Math.round((Number(value) || 0) * 100) / 100;
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
};

const rebuildArticleMap = () => {
  articleMap.clear();

  for (const article of articles) {
    const key = getArticleKey(article);

    if (!key) {
      continue;
    }

    if (!articleMap.has(key)) {
      articleMap.set(key, article);
    }
  }
};

const getArticleKey = (article = {}) => {
  const candidates = [article.id, article.articulo_id, article.articuloId, article.codigo];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
      return String(candidate);
    }
  }

  return null;
};

const getArticleByKey = (key) => {
  if (!key) {
    return null;
  }

  return articleMap.get(String(key)) ?? null;
};

const getArticleDisplayLabel = (article = {}) => {
  const nameCandidates = [article.nombre, article.descripcion, article.descripcion_corta];
  const code = typeof article.codigo === 'string' ? article.codigo.trim() : '';
  const name = nameCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim();

  if (code && name && code.toLowerCase() !== name.toLowerCase()) {
    return `${code} · ${name}`;
  }

  if (name) {
    return name;
  }

  if (code) {
    return code;
  }

  const key = getArticleKey(article);

  if (key) {
    return `Artículo ${key}`;
  }

  return 'Artículo sin nombre';
};

const renderSupplierOptions = () => {
  if (!purchaseSupplierSelect) {
    return;
  }

  const previousValue = purchaseSupplierSelect.value;

  purchaseSupplierSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona un proveedor activo…';
  purchaseSupplierSelect.appendChild(placeholder);

  const sortedSuppliers = [...suppliers].sort((a, b) => {
    const nameA = getSupplierDisplayName(a).toLocaleLowerCase('es');
    const nameB = getSupplierDisplayName(b).toLocaleLowerCase('es');
    return nameA.localeCompare(nameB, 'es');
  });

  for (const supplier of sortedSuppliers) {
    const option = document.createElement('option');
    const identifier = getSupplierIdentifier(supplier);
    const value = parseIdentifier(identifier);

    option.value = value !== null && value !== undefined ? String(value) : '';
    option.textContent = getSupplierDisplayName(supplier);
    purchaseSupplierSelect.appendChild(option);
  }

  if (previousValue && Array.from(purchaseSupplierSelect.options).some((option) => option.value === previousValue)) {
    purchaseSupplierSelect.value = previousValue;
  }
};

const updateLineTotals = (line) => {
  if (!line) {
    return;
  }

  line.subtotal = roundCurrency(Number(line.cantidad) * Number(line.precioUnitario));
  line.total = roundCurrency(line.subtotal + Number(line.impuestos));

  const elements = lineElements.get(line.id);

  if (elements?.totalLabel) {
    elements.totalLabel.textContent = formatCurrency(line.total);
  }
};

const computeTotals = () => {
  return lines.reduce(
    (acc, line) => {
      updateLineTotals(line);

      return {
        subtotal: roundCurrency(acc.subtotal + (line.subtotal ?? 0)),
        taxes: roundCurrency(acc.taxes + Number(line.impuestos ?? 0)),
        total: roundCurrency(acc.total + (line.total ?? 0)),
      };
    },
    { subtotal: 0, taxes: 0, total: 0 }
  );
};

const updateTotals = () => {
  const totals = computeTotals();

  if (purchaseSubtotalLabel) {
    purchaseSubtotalLabel.textContent = formatCurrency(totals.subtotal);
  }

  if (purchaseTaxesLabel) {
    purchaseTaxesLabel.textContent = formatCurrency(totals.taxes);
  }

  if (purchaseTotalLabel) {
    purchaseTotalLabel.textContent = formatCurrency(totals.total);
  }

  return totals;
};

const renderLines = () => {
  if (!purchaseLinesBody || !purchaseLinesEmpty) {
    return;
  }

  purchaseLinesBody.innerHTML = '';
  lineElements.clear();

  if (!lines.length) {
    purchaseLinesEmpty.classList.remove('hidden');
    updateTotals();
    return;
  }

  purchaseLinesEmpty.classList.add('hidden');

  const articleOptions = [...articleMap.values()].sort((a, b) => {
    const labelA = getArticleDisplayLabel(a).toLocaleLowerCase('es');
    const labelB = getArticleDisplayLabel(b).toLocaleLowerCase('es');
    return labelA.localeCompare(labelB, 'es');
  });

  for (const line of lines) {
    const row = document.createElement('tr');
    row.dataset.lineId = line.id;

    const articleCell = document.createElement('td');
    articleCell.className = 'px-4 py-3 align-top text-sm text-gray-700';
    const articleSelect = document.createElement('select');
    articleSelect.className =
      'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Selecciona artículo…';
    articleSelect.appendChild(placeholderOption);

    for (const article of articleOptions) {
      const option = document.createElement('option');
      const key = getArticleKey(article);

      if (!key) {
        continue;
      }

      option.value = key;
      option.textContent = getArticleDisplayLabel(article);
      option.dataset.existencia = article.existencia ?? '';
      articleSelect.appendChild(option);
    }

    articleSelect.value = line.articuloId ? String(line.articuloId) : '';
    articleSelect.addEventListener('change', () => {
      line.articuloId = articleSelect.value;
      const article = getArticleByKey(articleSelect.value);

      if (article) {
        const typeRaw = typeof article.tipo === 'string' ? article.tipo.toLowerCase() : '';

        if (typeRaw.includes('servicio')) {
          line.tipo = 'Servicio';
        } else if (typeRaw.includes('producto') || typeRaw) {
          line.tipo = 'Producto';
        }

        const suggestedName =
          article.descripcion ?? article.descripcion_corta ?? article.nombre ?? line.descripcion ?? '';

        if (!line.descripcion || !line.descripcion.trim()) {
          line.descripcion = suggestedName;
        }

        const suggestedPrice =
          article.costo ?? article.precio_compra ?? article.valor_unitario ?? article.precio ?? null;

        if ((Number(line.precioUnitario) ?? 0) === 0 && suggestedPrice !== null && suggestedPrice !== undefined) {
          line.precioUnitario = roundCurrency(Number(suggestedPrice));
        }
      }

      const elements = lineElements.get(line.id);

      if (elements?.descriptionInput) {
        elements.descriptionInput.value = line.descripcion ?? '';
      }

      if (elements?.typeSelect) {
        elements.typeSelect.value = line.tipo ?? 'Producto';
      }

      if (elements?.priceInput) {
        elements.priceInput.value = line.precioUnitario ?? 0;
      }

      updateLineTotals(line);
      updateTotals();
    });

    articleCell.appendChild(articleSelect);
    row.appendChild(articleCell);

    const descriptionCell = document.createElement('td');
    descriptionCell.className = 'px-4 py-3 align-top text-sm text-gray-700';
    const descriptionInput = document.createElement('input');
    descriptionInput.type = 'text';
    descriptionInput.className =
      'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
    descriptionInput.placeholder = 'Detalle visible en la orden';
    descriptionInput.value = line.descripcion ?? '';
    descriptionInput.addEventListener('input', () => {
      line.descripcion = descriptionInput.value;
    });
    descriptionCell.appendChild(descriptionInput);
    row.appendChild(descriptionCell);

    const typeCell = document.createElement('td');
    typeCell.className = 'px-4 py-3 align-top text-sm text-gray-700';
    const typeSelect = document.createElement('select');
    typeSelect.className =
      'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
    const optionProducto = document.createElement('option');
    optionProducto.value = 'Producto';
    optionProducto.textContent = 'Producto';
    const optionServicio = document.createElement('option');
    optionServicio.value = 'Servicio';
    optionServicio.textContent = 'Servicio';
    typeSelect.appendChild(optionProducto);
    typeSelect.appendChild(optionServicio);
    typeSelect.value = line.tipo ?? 'Producto';
    typeSelect.addEventListener('change', () => {
      line.tipo = typeSelect.value;
    });
    typeCell.appendChild(typeSelect);
    row.appendChild(typeCell);

    const quantityCell = document.createElement('td');
    quantityCell.className = 'px-4 py-3 align-top text-sm text-gray-700';
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.min = '0';
    quantityInput.step = '0.01';
    quantityInput.inputMode = 'decimal';
    quantityInput.className =
      'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
    quantityInput.value = line.cantidad ?? 0;
    quantityInput.addEventListener('input', () => {
      line.cantidad = Number(quantityInput.value) || 0;
      updateLineTotals(line);
      updateTotals();
    });
    quantityCell.appendChild(quantityInput);
    row.appendChild(quantityCell);

    const priceCell = document.createElement('td');
    priceCell.className = 'px-4 py-3 align-top text-sm text-gray-700';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.inputMode = 'decimal';
    priceInput.className =
      'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
    priceInput.value = line.precioUnitario ?? 0;
    priceInput.addEventListener('input', () => {
      line.precioUnitario = Number(priceInput.value) || 0;
      updateLineTotals(line);
      updateTotals();
    });
    priceCell.appendChild(priceInput);
    row.appendChild(priceCell);

    const taxesCell = document.createElement('td');
    taxesCell.className = 'px-4 py-3 align-top text-sm text-gray-700';
    const taxesInput = document.createElement('input');
    taxesInput.type = 'number';
    taxesInput.min = '0';
    taxesInput.step = '0.01';
    taxesInput.inputMode = 'decimal';
    taxesInput.className =
      'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
    taxesInput.value = line.impuestos ?? 0;
    taxesInput.addEventListener('input', () => {
      line.impuestos = Number(taxesInput.value) || 0;
      updateLineTotals(line);
      updateTotals();
    });
    taxesCell.appendChild(taxesInput);
    row.appendChild(taxesCell);

    const totalCell = document.createElement('td');
    totalCell.className = 'px-4 py-3 align-top text-sm font-semibold text-gray-900';
    const totalLabel = document.createElement('span');
    totalLabel.textContent = formatCurrency(line.total ?? 0);
    totalCell.appendChild(totalLabel);
    row.appendChild(totalCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'px-4 py-3 text-right text-sm';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className =
      'inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2';
    removeButton.innerHTML =
      '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg><span>Quitar</span>';
    removeButton.addEventListener('click', () => {
      const index = lines.findIndex((item) => item.id === line.id);

      if (index >= 0) {
        lines.splice(index, 1);
        renderLines();
      }
    });
    actionsCell.appendChild(removeButton);
    row.appendChild(actionsCell);

    purchaseLinesBody.appendChild(row);

    lineElements.set(line.id, {
      row,
      articleSelect,
      descriptionInput,
      typeSelect,
      quantityInput,
      priceInput,
      taxesInput,
      totalLabel,
    });

    updateLineTotals(line);
  }

  updateTotals();
};

const clearMessages = () => {
  if (purchaseFeedback) {
    purchaseFeedback.textContent = '';
    purchaseFeedback.classList.add('hidden');
  }

  if (purchaseSuccess) {
    purchaseSuccess.textContent = '';
    purchaseSuccess.classList.add('hidden');
  }

  if (purchaseResultCard) {
    purchaseResultCard.classList.add('hidden');
    purchaseResultCard.innerHTML = '';
  }
};

const showError = (message) => {
  if (!purchaseFeedback) {
    return;
  }

  purchaseFeedback.textContent = message;
  purchaseFeedback.classList.remove('hidden');
};

const showSuccess = (message) => {
  if (!purchaseSuccess) {
    return;
  }

  purchaseSuccess.textContent = message;
  purchaseSuccess.classList.remove('hidden');
};

const setSubmitting = (value) => {
  isSubmitting = Boolean(value);

  if (!purchaseSubmitButton) {
    return;
  }

  purchaseSubmitButton.disabled = isSubmitting;
  purchaseSubmitButton.classList.toggle('opacity-60', isSubmitting);
  purchaseSubmitButton.classList.toggle('cursor-not-allowed', isSubmitting);
  purchaseSubmitButton.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
};

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ensureDefaultDates = () => {
  const today = getTodayDate();

  if (purchaseOrderDateInput && !purchaseOrderDateInput.value) {
    purchaseOrderDateInput.value = today;
  }

  if (purchaseDeliveryDateInput && !purchaseDeliveryDateInput.value) {
    purchaseDeliveryDateInput.value = '';
  }
};

const addLine = (defaults = {}) => {
  const line = {
    id: `line-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    articuloId: defaults.articuloId ?? '',
    descripcion: defaults.descripcion ?? '',
    tipo: defaults.tipo ?? 'Producto',
    cantidad: defaults.cantidad ?? 1,
    precioUnitario: defaults.precioUnitario ?? 0,
    impuestos: defaults.impuestos ?? 0,
    subtotal: 0,
    total: 0,
  };

  lines.push(line);
  renderLines();
};

const resetForm = ({ preserveMessages = false } = {}) => {
  if (!preserveMessages) {
    clearMessages();
  }

  if (purchaseForm) {
    purchaseForm.reset();
  }

  if (purchaseSupplierSelect) {
    purchaseSupplierSelect.value = '';
  }

  ensureDefaultDates();

  if (purchasePaymentTermsInput) {
    purchasePaymentTermsInput.value = '';
  }

  if (purchaseShippingMethodInput) {
    purchaseShippingMethodInput.value = '';
  }

  if (purchaseDeliveryLocationInput) {
    purchaseDeliveryLocationInput.value = '';
  }

  if (purchaseNotesInput) {
    purchaseNotesInput.value = '';
  }

  lines.length = 0;
  addLine();
};

const getSupplierDisplayNameById = (identifier) => {
  if (identifier === undefined || identifier === null) {
    return '';
  }

  const normalized = String(parseIdentifier(identifier));

  const match = suppliers.find((supplier) => {
    const supplierIdentifier = getSupplierIdentifier(supplier);

    if (supplierIdentifier === undefined || supplierIdentifier === null) {
      return false;
    }

    return String(parseIdentifier(supplierIdentifier)) === normalized;
  });

  return match ? getSupplierDisplayName(match) : '';
};

const renderOrderResult = (payload, context = {}) => {
  if (!purchaseResultCard) {
    return;
  }

  const order = payload?.orden ?? payload ?? {};
  const proveedor = payload?.proveedor ?? null;
  const totales = payload?.totales ?? computeTotals();
  const lineas = Array.isArray(payload?.lineas) ? payload.lineas.length : lines.length;
  const supplierName = proveedor
    ? getSupplierDisplayName(proveedor)
    : getSupplierDisplayNameById(context.supplierId ?? order.id_proveedor);

  const parts = [];
  parts.push('<div class="space-y-2">');
  parts.push('<div class="flex items-center gap-2 text-blue-800">');
  parts.push(
    '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>'
  );
  parts.push('<span class="font-semibold">Orden registrada correctamente.</span>');
  parts.push('</div>');
  parts.push('<dl class="grid gap-2 text-sm text-blue-900 sm:grid-cols-2">');
  parts.push(`<div><dt class="font-medium text-blue-900">Proveedor</dt><dd>${supplierName || 'Sin proveedor'}</dd></div>`);
  parts.push(
    `<div><dt class="font-medium text-blue-900">Fecha de orden</dt><dd>${
      order.fecha_orden ?? purchaseOrderDateInput?.value ?? ''
    }</dd></div>`
  );
  parts.push(`<div><dt class="font-medium text-blue-900">Líneas</dt><dd>${lineas}</dd></div>`);
  parts.push(`<div><dt class="font-medium text-blue-900">Subtotal</dt><dd>${formatCurrency(totales.subtotal)}</dd></div>`);
  parts.push(`<div><dt class="font-medium text-blue-900">Impuestos</dt><dd>${formatCurrency(totales.taxes)}</dd></div>`);
  parts.push(`<div><dt class="font-medium text-blue-900">Total</dt><dd>${formatCurrency(totales.total)}</dd></div>`);
  parts.push('</dl>');
  parts.push('</div>');

  purchaseResultCard.innerHTML = parts.join('');
  purchaseResultCard.classList.remove('hidden');
};

const loadSuppliers = async () => {
  const response = await request('GET', '/api/terceros');
  const items = Array.isArray(response) ? response : [];

  suppliers = [];

  for (const supplier of items) {
    if (!isSupplierRecord(supplier)) {
      continue;
    }

    if (!interpretActiveState(supplier)) {
      continue;
    }

    suppliers.push(supplier);
  }

  renderSupplierOptions();
};

const loadArticles = async () => {
  const response = await request('GET', '/api/articulos');
  articles = Array.isArray(response) ? response : [];
  rebuildArticleMap();
  renderLines();
};

const loadCatalogs = async ({ showMessage = false } = {}) => {
  if (isLoadingCatalogs) {
    return;
  }

  setLoading(true);

  try {
    await Promise.all([loadSuppliers(), loadArticles()]);

    if (showMessage) {
      showSuccess('Catálogos actualizados correctamente.');
    }
  } catch (error) {
    console.error('Error al cargar catálogos:', error);
    showError(error?.message ?? 'No fue posible cargar los catálogos.');
    throw error;
  } finally {
    setLoading(false);
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  clearMessages();

  const supplierValue = purchaseSupplierSelect?.value ?? '';

  if (!supplierValue) {
    showError('Selecciona un proveedor antes de registrar la orden.');
    return;
  }

  if (!lines.length) {
    showError('Debes agregar al menos una línea a la orden de compra.');
    return;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line || Number(line.cantidad) <= 0) {
      showError(`La cantidad de la línea ${index + 1} debe ser mayor a cero.`);
      return;
    }

    if ((line.tipo ?? 'Producto') === 'Producto' && !line.articuloId) {
      showError(`La línea ${index + 1} es de tipo Producto y requiere un artículo asociado.`);
      return;
    }
  }

  const totals = updateTotals();
  const supplierId = parseIdentifier(supplierValue);
  const supplierName = getSupplierDisplayNameById(supplierId);

  const payload = {
    id_proveedor: supplierId,
    fecha_orden: purchaseOrderDateInput?.value ?? null,
    fecha_entrega_estimada: purchaseDeliveryDateInput?.value ?? null,
    condiciones_pago: purchasePaymentTermsInput?.value?.trim() || null,
    metodo_envio: purchaseShippingMethodInput?.value?.trim() || null,
    lugar_entrega: purchaseDeliveryLocationInput?.value?.trim() || null,
    notas: purchaseNotesInput?.value?.trim() || null,
    estado: 'Pendiente',
    sub_total: totals.subtotal,
    total_impuestos: totals.taxes,
    total: totals.total,
    lineas_orden: lines.map((line) => {
      const detalle = {
        tipo: line.tipo ?? 'Producto',
        descripcion: line.descripcion || null,
        cantidad: Number(line.cantidad) || 0,
        costo_unitario: Number(line.precioUnitario) || 0,
        total_impuestos: Number(line.impuestos) || 0,
        total_linea: Number(line.total) || 0,
      };

      if (line.articuloId) {
        const parsedId = parseIdentifier(line.articuloId);

        if (parsedId !== null && parsedId !== undefined && detalle.tipo === 'Producto') {
          detalle.id_articulo = parsedId;
        }
      }

      return detalle;
    }),
  };

  if (currentAdminId !== null && currentAdminId !== undefined) {
    payload.creado_por = currentAdminId;
    payload.modificado_por = currentAdminId;
  }

  if (currentAdminName) {
    payload.creado_por_nombre = currentAdminName;
    payload.modificado_por_nombre = currentAdminName;
  }

  try {
    setSubmitting(true);

    const response = await request('POST', '/api/ordenes-compra', payload);

    showSuccess('La orden de compra se registró correctamente.');
    renderOrderResult(response, { supplierId, supplierName });
    resetForm({ preserveMessages: true });
  } catch (error) {
    console.error('Error al registrar la orden de compra:', error);
    showError(error?.message ?? 'No fue posible registrar la orden de compra.');
  } finally {
    setSubmitting(false);
  }
};

loadCatalogs({ showMessage: false }).catch(() => {
  /* Los errores se muestran desde loadCatalogs */
});

resetForm({ preserveMessages: true });

purchaseForm?.addEventListener('submit', handleSubmit);
addLineButton?.addEventListener('click', () => addLine());
refreshButton?.addEventListener('click', () => {
  loadCatalogs({ showMessage: true }).catch(() => {
    /* Los errores se muestran desde loadCatalogs */
  });
});
clearButton?.addEventListener('click', () => resetForm({ preserveMessages: false }));

window.addEventListener('beforeunload', () => {
  if (isSubmitting && purchaseSubmitButton) {
    purchaseSubmitButton.setAttribute('aria-busy', 'false');
  }
});
