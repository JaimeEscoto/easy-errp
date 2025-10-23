import { requireSession, getDisplayName } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para acceder a la pantalla de facturas.');
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

const invoiceForm = document.getElementById('invoice-form');
const invoiceClientSelect = document.getElementById('invoice-client');
const invoiceDateInput = document.getElementById('invoice-date');
const invoicePaymentTermsInput = document.getElementById('invoice-payment-terms');
const invoiceNotesInput = document.getElementById('invoice-notes');
const invoiceLinesBody = document.getElementById('invoice-lines-body');
const invoiceLinesEmpty = document.getElementById('invoice-lines-empty');
const invoiceLoading = document.getElementById('invoice-loading');
const invoiceFeedback = document.getElementById('invoice-feedback');
const invoiceSuccess = document.getElementById('invoice-success');
const invoiceResultCard = document.getElementById('invoice-result-card');
const addLineButton = document.getElementById('add-invoice-line');
const refreshButton = document.getElementById('refresh-invoice-catalogs');
const clearButton = document.getElementById('invoice-clear-button');
const invoiceSubtotalLabel = document.getElementById('invoice-subtotal');
const invoiceTaxesLabel = document.getElementById('invoice-taxes');
const invoiceTotalLabel = document.getElementById('invoice-total');
const invoiceSubmitButton = document.getElementById('invoice-submit-button');

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'si', 'sí', 'activo', 'activa', 'active', 'habilitado'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'inactivo', 'inactiva', 'inactive', 'deshabilitado'].includes(normalized)) {
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

      if (['activo', 'activa', 'active'].includes(lowered)) {
        return true;
      }

      if (['inactivo', 'inactiva', 'inactive', 'deshabilitado'].includes(lowered)) {
        return false;
      }
    }
  }

  return true;
};

const interpretClientRelation = (record = {}) => {
  const relationRaw = record.tipo_relacion ?? record.relacion ?? '';
  const normalized = typeof relationRaw === 'string' ? relationRaw.trim().toLowerCase() : '';

  if (!normalized) {
    return null;
  }

  if (normalized.includes('cliente') || normalized.includes('customer') || normalized.includes('ambos')) {
    return true;
  }

  if (normalized.includes('proveedor')) {
    return false;
  }

  return null;
};

const isClientRecord = (record = {}) => {
  const relation = interpretClientRelation(record);

  if (relation !== null) {
    return relation;
  }

  const candidate = normalizeBoolean(record.es_cliente ?? record.is_client ?? record.client);

  if (candidate !== null) {
    return candidate;
  }

  return false;
};

const getClientIdentifier = (client = {}) => {
  const candidates = [client.id, client.tercero_id, client.terceroId, client.identificacion_fiscal, client.identificacion, client.nit];

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

const getClientDisplayName = (client = {}) => {
  const candidates = [
    client.nombre_comercial,
    client.razon_social,
    client.nombre,
    client.contacto,
    client.display_name,
  ];

  const name = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim();
  const identifier =
    client.identificacion_fiscal ??
    client.identificacion ??
    client.nit ??
    client.id ??
    client.tercero_id ??
    client.terceroId ??
    '';

  if (name && identifier) {
    return `${name} · ${identifier}`;
  }

  if (name) {
    return name;
  }

  if (identifier) {
    return `Cliente ${identifier}`;
  }

  return 'Cliente sin nombre';
};

const roundCurrency = (value) => {
  const normalized = Number.isFinite(value) ? value : Number(value);

  if (Number.isNaN(normalized)) {
    return 0;
  }

  return Math.round((normalized + Number.EPSILON) * 100) / 100;
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => currencyFormatter.format(roundCurrency(value));

const clients = [];
let articles = [];
const articleMap = new Map();
const lines = [];
const lineElements = new Map();
let isSubmitting = false;
let isLoadingCatalogs = false;

const clearMessages = () => {
  if (invoiceFeedback) {
    invoiceFeedback.textContent = '';
    invoiceFeedback.classList.add('hidden');
  }

  if (invoiceSuccess) {
    invoiceSuccess.textContent = '';
    invoiceSuccess.classList.add('hidden');
  }

  if (invoiceResultCard) {
    invoiceResultCard.textContent = '';
    invoiceResultCard.classList.add('hidden');
  }
};

const showError = (message) => {
  if (!invoiceFeedback) {
    return;
  }

  invoiceFeedback.textContent = message ?? 'Ocurrió un error inesperado.';
  invoiceFeedback.classList.remove('hidden');
};

const showSuccess = (message) => {
  if (!invoiceSuccess) {
    return;
  }

  invoiceSuccess.textContent = message ?? 'Operación realizada correctamente.';
  invoiceSuccess.classList.remove('hidden');
};

const setLoading = (value) => {
  isLoadingCatalogs = Boolean(value);

  if (invoiceLoading) {
    invoiceLoading.classList.toggle('hidden', !isLoadingCatalogs);
  }

  if (refreshButton) {
    refreshButton.disabled = isLoadingCatalogs;
    refreshButton.classList.toggle('opacity-60', isLoadingCatalogs);
    refreshButton.classList.toggle('cursor-not-allowed', isLoadingCatalogs);
  }

  if (addLineButton) {
    addLineButton.disabled = isLoadingCatalogs;
    addLineButton.classList.toggle('opacity-60', isLoadingCatalogs);
    addLineButton.classList.toggle('cursor-not-allowed', isLoadingCatalogs);
  }
};

const setSubmitting = (value) => {
  isSubmitting = Boolean(value);

  if (!invoiceSubmitButton) {
    return;
  }

  invoiceSubmitButton.disabled = isSubmitting;
  invoiceSubmitButton.classList.toggle('opacity-60', isSubmitting);
  invoiceSubmitButton.classList.toggle('cursor-not-allowed', isSubmitting);
  invoiceSubmitButton.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
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

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ensureDefaultDate = () => {
  if (invoiceDateInput && !invoiceDateInput.value) {
    invoiceDateInput.value = getTodayDate();
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

const renderClientOptions = () => {
  if (!invoiceClientSelect) {
    return;
  }

  const previousValue = invoiceClientSelect.value;

  invoiceClientSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona un cliente activo…';
  invoiceClientSelect.appendChild(placeholder);

  const sortedClients = [...clients].sort((a, b) => {
    const nameA = getClientDisplayName(a).toLocaleLowerCase('es');
    const nameB = getClientDisplayName(b).toLocaleLowerCase('es');
    return nameA.localeCompare(nameB, 'es');
  });

  for (const client of sortedClients) {
    const option = document.createElement('option');
    const identifier = getClientIdentifier(client);
    const value = parseIdentifier(identifier);

    option.value = value !== null && value !== undefined ? String(value) : '';
    option.textContent = getClientDisplayName(client);
    invoiceClientSelect.appendChild(option);
  }

  if (previousValue && Array.from(invoiceClientSelect.options).some((option) => option.value === previousValue)) {
    invoiceClientSelect.value = previousValue;
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

  if (invoiceSubtotalLabel) {
    invoiceSubtotalLabel.textContent = formatCurrency(totals.subtotal);
  }

  if (invoiceTaxesLabel) {
    invoiceTaxesLabel.textContent = formatCurrency(totals.taxes);
  }

  if (invoiceTotalLabel) {
    invoiceTotalLabel.textContent = formatCurrency(totals.total);
  }

  return totals;
};

const renderLines = () => {
  if (!invoiceLinesBody || !invoiceLinesEmpty) {
    return;
  }

  invoiceLinesBody.innerHTML = '';
  lineElements.clear();

  if (!lines.length) {
    invoiceLinesEmpty.classList.remove('hidden');
    updateTotals();
    return;
  }

  invoiceLinesEmpty.classList.add('hidden');

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
          article.precio ?? article.precio_venta ?? article.valor_unitario ?? article.precioUnitario ?? null;

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
    descriptionInput.placeholder = 'Detalle visible en la factura';
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

    invoiceLinesBody.appendChild(row);

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

  if (invoiceForm) {
    invoiceForm.reset();
  }

  if (invoiceClientSelect) {
    invoiceClientSelect.value = '';
  }

  if (invoicePaymentTermsInput) {
    invoicePaymentTermsInput.value = '';
  }

  if (invoiceNotesInput) {
    invoiceNotesInput.value = '';
  }

  if (invoiceDateInput) {
    invoiceDateInput.value = getTodayDate();
  }

  lines.length = 0;
  addLine();
};

const getClientDisplayNameById = (identifier) => {
  if (identifier === undefined || identifier === null) {
    return '';
  }

  const normalized = String(parseIdentifier(identifier));

  const match = clients.find((client) => {
    const clientIdentifier = getClientIdentifier(client);

    if (clientIdentifier === undefined || clientIdentifier === null) {
      return false;
    }

    return String(parseIdentifier(clientIdentifier)) === normalized;
  });

  return match ? getClientDisplayName(match) : '';
};

const renderInvoiceResult = (payload, context = {}) => {
  if (!invoiceResultCard) {
    return;
  }

  const factura = payload?.factura ?? {};
  const cliente = payload?.cliente ?? null;
  const totales = payload?.totales ?? computeTotals();
  const lineas = Array.isArray(payload?.lineas) ? payload.lineas.length : lines.length;
  const invoiceId = factura?.id ?? factura?.factura_id ?? factura?.numero ?? null;
  const clientName =
    context.clientName ??
    getClientDisplayName(cliente ?? {}) ??
    getClientDisplayNameById(factura?.id_cliente ?? factura?.cliente_id ?? context.clientId);

  const parts = [];

  parts.push('<div class="flex flex-col gap-3">');
  parts.push('<div>');
  parts.push('<p class="text-sm font-semibold text-blue-900">Factura emitida correctamente</p>');

  if (invoiceId) {
    parts.push(
      `<p class="text-xs text-blue-700">Consecutivo interno: <span class="font-medium">${invoiceId}</span></p>`
    );
  }

  parts.push('</div>');
  parts.push('<dl class="grid gap-2 text-xs text-blue-700 sm:grid-cols-2">');

  if (clientName) {
    parts.push(
      `<div><dt class="font-medium text-blue-900">Cliente</dt><dd>${clientName}</dd></div>`
    );
  }

  parts.push(
    `<div><dt class="font-medium text-blue-900">Líneas registradas</dt><dd>${lineas}</dd></div>`
  );
  parts.push(
    `<div><dt class="font-medium text-blue-900">Subtotal</dt><dd>${formatCurrency(
      totales.subtotal
    )}</dd></div>`
  );
  parts.push(
    `<div><dt class="font-medium text-blue-900">Total</dt><dd>${formatCurrency(totales.total)}</dd></div>`
  );
  parts.push('</dl>');
  parts.push('</div>');

  invoiceResultCard.innerHTML = parts.join('');
  invoiceResultCard.classList.remove('hidden');
};

const loadClients = async () => {
  const response = await request('GET', '/api/terceros');
  const items = Array.isArray(response) ? response : [];

  clients.length = 0;

  for (const client of items) {
    if (!isClientRecord(client)) {
      continue;
    }

    if (!interpretActiveState(client)) {
      continue;
    }

    clients.push(client);
  }

  renderClientOptions();
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
    await Promise.all([loadClients(), loadArticles()]);

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

  const clientValue = invoiceClientSelect?.value ?? '';

  if (!clientValue) {
    showError('Selecciona un cliente antes de emitir la factura.');
    return;
  }

  if (!lines.length) {
    showError('Debes agregar al menos una línea a la factura.');
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
  const clientId = parseIdentifier(clientValue);
  const clientName = getClientDisplayNameById(clientId);

  const payload = {
    id_cliente: clientId,
    fecha: invoiceDateInput?.value ?? null,
    condiciones_pago: invoicePaymentTermsInput?.value?.trim() || null,
    notas: invoiceNotesInput?.value?.trim() || null,
    estado: 'Emitida',
    sub_total: totals.subtotal,
    total_impuestos: totals.taxes,
    total: totals.total,
    lineas_factura: lines.map((line) => {
      const detalle = {
        tipo: line.tipo ?? 'Producto',
        descripcion: line.descripcion || null,
        cantidad: Number(line.cantidad) || 0,
        precio_unitario: Number(line.precioUnitario) || 0,
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

  setSubmitting(true);

  try {
    const response = await request('POST', '/api/facturas/emitir', payload);
    showSuccess('Factura emitida correctamente.');
    renderInvoiceResult(response, { clientName, clientId });
    resetForm({ preserveMessages: true });
  } catch (error) {
    console.error('Error al emitir la factura:', error);
    const message = error?.data?.message ?? error?.message ?? 'No fue posible emitir la factura.';
    showError(message);
  } finally {
    setSubmitting(false);
  }
};

ensureDefaultDate();
addLine();

loadCatalogs({ showMessage: false }).catch(() => {
  /* Los errores se muestran desde loadCatalogs */
});

addLineButton?.addEventListener('click', () => {
  addLine();
});

refreshButton?.addEventListener('click', () => {
  loadCatalogs({ showMessage: true }).catch(() => {
    /* Los errores ya se reportan */
  });
});

clearButton?.addEventListener('click', () => {
  resetForm();
});

invoiceForm?.addEventListener('submit', handleSubmit);
