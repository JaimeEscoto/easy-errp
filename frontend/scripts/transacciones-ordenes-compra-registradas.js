import { requireSession } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para visualizar las órdenes de compra.');
}

const backendBaseUrl = window.APP_CONFIG?.backendUrl ?? '';

const buildUrl = (path) => {
  if (!backendBaseUrl) {
    return path;
  }

  return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
};

const tableBody = document.getElementById('purchase-table-body');
const emptyState = document.getElementById('purchase-empty');
const loadingIndicator = document.getElementById('purchase-loading');
const errorBanner = document.getElementById('purchase-error');
const summaryCount = document.getElementById('purchase-summary-count');
const summaryAmount = document.getElementById('purchase-summary-amount');
const summaryUpdated = document.getElementById('purchase-summary-updated');
const refreshButton = document.getElementById('refresh-purchase-orders');

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

const formatCurrency = (value) => {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return currencyFormatter.format(number);
};

const toNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const pickField = (record = {}, keys = []) => {
  for (const key of keys) {
    const value = record?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
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

const formatDateOnly = (value) => {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('es-MX', { dateStyle: 'medium' });
};

const formatTimeOnly = (value) => {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const getOrderFolio = (order = {}) => {
  const value = pickField(order, [
    'folio',
    'numero_orden',
    'numeroOrden',
    'numero',
    'consecutivo',
    'codigo',
    'id',
    'orden_id',
  ]);

  return value !== null && value !== undefined ? String(value) : '—';
};

const getOrderDateValue = (order = {}) =>
  pickField(order, [
    'fecha_orden',
    'fechaOrden',
    'fecha',
    'creado_en',
    'created_at',
    'modificado_en',
    'updated_at',
  ]);

const getOrderDeliveryDateValue = (order = {}) =>
  pickField(order, [
    'fecha_entrega_estimada',
    'fechaEntregaEstimada',
    'fecha_compromiso',
    'fechaEntrega',
    'entrega_estimada',
  ]);

const getOrderSubtotalValue = (order = {}) =>
  pickField(order, ['sub_total', 'subtotal', 'base', 'total_base']) ?? 0;

const getOrderTaxesValue = (order = {}) =>
  pickField(order, ['total_impuestos', 'totalImpuestos', 'impuestos', 'taxes']) ?? 0;

const getOrderTotalValue = (order = {}) =>
  pickField(order, ['total', 'monto_total', 'gran_total', 'importe_total']) ?? 0;

const getOrderSupplierRecord = (order = {}) =>
  order.proveedor ?? order.supplier ?? order.tercero ?? order.vendor ?? null;

const getOrderSupplierIdentifier = (order = {}) => {
  const supplier = getOrderSupplierRecord(order);

  const identifier =
    pickField(supplier, [
      'identificacion_fiscal',
      'identificacion',
      'nit',
      'rfc',
      'codigo',
      'id',
      'tercero_id',
    ]) ??
    pickField(order, [
      'id_proveedor',
      'proveedor_id',
      'proveedorId',
      'supplier_id',
      'supplierId',
    ]);

  if (identifier === null || identifier === undefined || identifier === '') {
    return '';
  }

  return String(identifier);
};

const getOrderSupplierName = (order = {}) => {
  const supplier = getOrderSupplierRecord(order);

  const supplierName =
    pickField(supplier, [
      'display_name',
      'nombre_comercial',
      'razon_social',
      'nombre',
      'denominacion',
      'contacto',
    ]) ?? pickField(order, ['proveedor_nombre', 'proveedor', 'supplier_name']);

  if (typeof supplierName === 'string' && supplierName.trim()) {
    return supplierName.trim();
  }

  const identifier = getOrderSupplierIdentifier(order);

  if (identifier) {
    return `Proveedor ${identifier}`;
  }

  return 'Proveedor sin nombre';
};

const getOrderStatus = (order = {}) => {
  const status = pickField(order, ['estado', 'status', 'situacion']);

  if (typeof status === 'string' && status.trim()) {
    const trimmed = status.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  if (status !== null && status !== undefined) {
    return String(status);
  }

  return 'Sin estado';
};

const getStatusBadgeClass = (status) => {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';

  if (['pendiente', 'registrada', 'registrado', 'abierta', 'abierto'].includes(normalized)) {
    return 'bg-amber-100 text-amber-800';
  }

  if (['aprobada', 'aprobado', 'confirmada', 'confirmado', 'en proceso'].includes(normalized)) {
    return 'bg-blue-100 text-blue-800';
  }

  if (['recibida', 'recibido', 'completada', 'completado', 'cerrada', 'cerrado'].includes(normalized)) {
    return 'bg-green-100 text-green-800';
  }

  if (['cancelada', 'cancelado', 'anulada', 'anulado', 'rechazada', 'rechazado'].includes(normalized)) {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-gray-100 text-gray-700';
};

let hasLoadedOnce = false;

const setLoadingState = (isLoading) => {
  if (isLoading) {
    loadingIndicator?.classList.remove('hidden');
    refreshButton?.setAttribute('disabled', 'true');
    refreshButton?.classList.add('cursor-not-allowed', 'opacity-60');
  } else {
    loadingIndicator?.classList.add('hidden');
    refreshButton?.removeAttribute('disabled');
    refreshButton?.classList.remove('cursor-not-allowed', 'opacity-60');
  }
};

const renderOrders = (orders = [], fetchedAt = null) => {
  tableBody.innerHTML = '';

  if (!Array.isArray(orders) || !orders.length) {
    emptyState?.classList.remove('hidden');
    summaryCount.textContent = '0';
    summaryAmount.textContent = formatCurrency(0);
    summaryUpdated.textContent = fetchedAt ? formatDateTime(fetchedAt) : '—';
    return;
  }

  emptyState?.classList.add('hidden');

  let totalComprometido = 0;

  for (const order of orders) {
    const row = document.createElement('tr');

    const folioCell = document.createElement('td');
    folioCell.className = 'whitespace-nowrap px-4 py-3 text-sm text-gray-500';
    folioCell.textContent = getOrderFolio(order);
    row.appendChild(folioCell);

    const dateCell = document.createElement('td');
    dateCell.className = 'whitespace-nowrap px-4 py-3 text-sm text-gray-500';
    const orderDateValue = getOrderDateValue(order);
    const dateLabel = document.createElement('div');
    dateLabel.className = 'font-medium text-gray-900';
    dateLabel.textContent = formatDateOnly(orderDateValue);
    dateCell.appendChild(dateLabel);
    const timeLabel = formatTimeOnly(orderDateValue);

    if (timeLabel) {
      const timeElement = document.createElement('div');
      timeElement.className = 'text-xs text-gray-500';
      timeElement.textContent = timeLabel;
      dateCell.appendChild(timeElement);
    }

    row.appendChild(dateCell);

    const supplierCell = document.createElement('td');
    supplierCell.className = 'px-4 py-3 text-sm';
    const supplierName = document.createElement('div');
    supplierName.className = 'font-medium text-gray-900';
    supplierName.textContent = getOrderSupplierName(order);
    supplierCell.appendChild(supplierName);
    const supplierIdentifier = getOrderSupplierIdentifier(order);

    if (supplierIdentifier) {
      const supplierMeta = document.createElement('div');
      supplierMeta.className = 'text-xs text-gray-500';
      supplierMeta.textContent = supplierIdentifier;
      supplierCell.appendChild(supplierMeta);
    }

    row.appendChild(supplierCell);

    const statusCell = document.createElement('td');
    statusCell.className = 'whitespace-nowrap px-4 py-3 text-sm';
    const statusLabel = getOrderStatus(order);
    const statusBadge = document.createElement('span');
    statusBadge.className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
      statusLabel
    )}`;
    statusBadge.textContent = statusLabel;
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    const deliveryCell = document.createElement('td');
    deliveryCell.className = 'whitespace-nowrap px-4 py-3 text-sm text-gray-500';
    const deliveryValue = getOrderDeliveryDateValue(order);
    deliveryCell.textContent = formatDateOnly(deliveryValue);
    row.appendChild(deliveryCell);

    const subtotalCell = document.createElement('td');
    subtotalCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600';
    const subtotalValue = getOrderSubtotalValue(order);
    subtotalCell.textContent = formatCurrency(subtotalValue);
    row.appendChild(subtotalCell);

    const taxesCell = document.createElement('td');
    taxesCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600';
    const taxesValue = getOrderTaxesValue(order);
    taxesCell.textContent = formatCurrency(taxesValue);
    row.appendChild(taxesCell);

    const totalCell = document.createElement('td');
    totalCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-900';
    const totalValue = getOrderTotalValue(order);
    totalComprometido += toNumber(totalValue, 0);
    totalCell.textContent = formatCurrency(totalValue);
    row.appendChild(totalCell);

    tableBody.appendChild(row);
  }

  summaryCount.textContent = orders.length.toString();
  summaryAmount.textContent = formatCurrency(totalComprometido);
  summaryUpdated.textContent = fetchedAt ? formatDateTime(fetchedAt) : formatDateTime(new Date());
};

const loadPurchaseOrders = async () => {
  setLoadingState(true);
  errorBanner?.classList.add('hidden');

  try {
    const response = await fetch(buildUrl('/api/ordenes-compra'));

    if (!response.ok) {
      throw new Error(`Error al consultar órdenes de compra: ${response.status}`);
    }

    const payload = await response.json();
    const ordenes = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.ordenes)
      ? payload.ordenes
      : [];
    const fetchedAt = payload?.fetched_at ?? new Date().toISOString();

    hasLoadedOnce = true;
    renderOrders(ordenes, fetchedAt);
  } catch (err) {
    console.error('Error al cargar órdenes de compra registradas:', err);
    errorBanner?.classList.remove('hidden');

    if (!hasLoadedOnce) {
      renderOrders([], null);
      summaryUpdated.textContent = '—';
    }
  } finally {
    setLoadingState(false);
  }
};

refreshButton?.addEventListener('click', () => {
  loadPurchaseOrders();
});

loadPurchaseOrders();
