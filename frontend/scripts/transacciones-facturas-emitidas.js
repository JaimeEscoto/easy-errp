import { requireSession } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para visualizar las facturas emitidas.');
}

const backendBaseUrl = window.APP_CONFIG?.backendUrl ?? '';

const buildUrl = (path) => {
  if (!backendBaseUrl) {
    return path;
  }

  return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
};

const invoiceTableBody = document.getElementById('invoice-table-body');
const invoiceEmpty = document.getElementById('invoice-empty');
const invoiceLoading = document.getElementById('invoice-loading');
const invoiceError = document.getElementById('invoice-error');
const summaryCount = document.getElementById('invoice-summary-count');
const summaryAmount = document.getElementById('invoice-summary-amount');
const summaryUpdated = document.getElementById('invoice-summary-updated');
const refreshButton = document.getElementById('refresh-invoices');

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

const getInvoiceFolio = (invoice = {}) => {
  const value = pickField(invoice, [
    'folio',
    'numero_factura',
    'numeroFactura',
    'numero',
    'consecutivo',
    'codigo',
    'id',
    'factura_id',
  ]);

  return value !== null && value !== undefined ? String(value) : '—';
};

const getInvoiceDateValue = (invoice = {}) =>
  pickField(invoice, [
    'fecha',
    'fecha_emision',
    'fechaFactura',
    'fecha_factura',
    'creado_en',
    'created_at',
    'modificado_en',
    'updated_at',
  ]);

const getInvoiceSubtotalValue = (invoice = {}) =>
  pickField(invoice, ['sub_total', 'subtotal', 'base', 'valor_base', 'total_base']) ?? 0;

const getInvoiceTaxesValue = (invoice = {}) =>
  pickField(invoice, ['total_impuestos', 'totalImpuestos', 'impuestos', 'taxes', 'total_iva']) ?? 0;

const getInvoiceTotalValue = (invoice = {}) =>
  pickField(invoice, ['total', 'total_factura', 'monto_total', 'importe_total', 'gran_total']) ?? 0;

const getInvoiceClientRecord = (invoice = {}) =>
  invoice.cliente ?? invoice.customer ?? invoice.tercero ?? invoice.client ?? null;

const getInvoiceClientIdentifier = (invoice = {}) => {
  const client = getInvoiceClientRecord(invoice);
  const identifier =
    pickField(client, [
      'identificacion_fiscal',
      'identificacion',
      'nit',
      'rfc',
      'codigo',
      'id',
      'tercero_id',
    ]) ??
    pickField(invoice, [
      'id_cliente',
      'cliente_id',
      'clienteId',
      'client_id',
      'clientId',
      'tercero_id',
      'terceroId',
    ]);

  if (identifier === null || identifier === undefined || identifier === '') {
    return '';
  }

  return String(identifier);
};

const getInvoiceClientName = (invoice = {}) => {
  const client = getInvoiceClientRecord(invoice);

  const clientName =
    pickField(client, [
      'nombre_comercial',
      'razon_social',
      'nombre',
      'denominacion',
      'display_name',
      'contacto',
    ]) ?? pickField(invoice, ['cliente_nombre', 'clienteNombre', 'nombre_cliente', 'cliente']);

  if (typeof clientName === 'string' && clientName.trim()) {
    return clientName.trim();
  }

  const identifier = getInvoiceClientIdentifier(invoice);

  if (identifier) {
    return `Cliente ${identifier}`;
  }

  return 'Cliente sin nombre';
};

const getInvoiceStatus = (invoice = {}) => {
  const status = pickField(invoice, ['estado', 'status']);

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

  if (['emitida', 'emitido', 'enviada', 'enviado'].includes(normalized)) {
    return 'bg-blue-100 text-blue-800';
  }

  if (['pagada', 'pagado', 'cobrada', 'cobrado', 'abonada', 'abonado'].includes(normalized)) {
    return 'bg-green-100 text-green-800';
  }

  if (['anulada', 'anulado', 'cancelada', 'cancelado'].includes(normalized)) {
    return 'bg-red-100 text-red-700';
  }

  if (['borrador', 'pendiente'].includes(normalized)) {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-gray-100 text-gray-700';
};

let hasLoadedOnce = false;

const setLoadingState = (isLoading) => {
  if (isLoading) {
    invoiceLoading?.classList.remove('hidden');
    refreshButton?.setAttribute('disabled', 'true');
    refreshButton?.classList.add('cursor-not-allowed', 'opacity-60');
  } else {
    invoiceLoading?.classList.add('hidden');
    refreshButton?.removeAttribute('disabled');
    refreshButton?.classList.remove('cursor-not-allowed', 'opacity-60');
  }
};

const renderInvoices = (invoices = [], updateTimestamp = true) => {
  invoiceTableBody.innerHTML = '';

  if (!Array.isArray(invoices) || !invoices.length) {
    invoiceEmpty?.classList.remove('hidden');
    summaryCount.textContent = '0';
    summaryAmount.textContent = formatCurrency(0);
    if (updateTimestamp) {
      summaryUpdated.textContent = formatDateTime(new Date());
    }
    return;
  }

  invoiceEmpty?.classList.add('hidden');

  let totalAcumulado = 0;

  for (const invoice of invoices) {
    const row = document.createElement('tr');

    const folioCell = document.createElement('td');
    folioCell.className = 'whitespace-nowrap px-4 py-3 text-sm text-gray-500';
    folioCell.textContent = getInvoiceFolio(invoice);
    row.appendChild(folioCell);

    const dateCell = document.createElement('td');
    dateCell.className = 'whitespace-nowrap px-4 py-3 text-sm text-gray-500';
    const invoiceDateValue = getInvoiceDateValue(invoice);
    const dateLabel = document.createElement('div');
    dateLabel.className = 'font-medium text-gray-900';
    dateLabel.textContent = formatDateOnly(invoiceDateValue);
    dateCell.appendChild(dateLabel);
    const timeLabel = formatTimeOnly(invoiceDateValue);

    if (timeLabel) {
      const timeElement = document.createElement('div');
      timeElement.className = 'text-xs text-gray-500';
      timeElement.textContent = timeLabel;
      dateCell.appendChild(timeElement);
    }

    row.appendChild(dateCell);

    const clientCell = document.createElement('td');
    clientCell.className = 'px-4 py-3 text-sm';
    const clientName = document.createElement('div');
    clientName.className = 'font-medium text-gray-900';
    clientName.textContent = getInvoiceClientName(invoice);
    clientCell.appendChild(clientName);
    const clientIdentifier = getInvoiceClientIdentifier(invoice);

    if (clientIdentifier) {
      const clientMeta = document.createElement('div');
      clientMeta.className = 'text-xs text-gray-500';
      clientMeta.textContent = clientIdentifier;
      clientCell.appendChild(clientMeta);
    }

    row.appendChild(clientCell);

    const statusCell = document.createElement('td');
    statusCell.className = 'whitespace-nowrap px-4 py-3 text-sm';
    const statusLabel = getInvoiceStatus(invoice);
    const statusBadge = document.createElement('span');
    statusBadge.className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
      statusLabel
    )}`;
    statusBadge.textContent = statusLabel;
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    const subtotalCell = document.createElement('td');
    subtotalCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600';
    const subtotalValue = getInvoiceSubtotalValue(invoice);
    subtotalCell.textContent = formatCurrency(subtotalValue);
    row.appendChild(subtotalCell);

    const taxesCell = document.createElement('td');
    taxesCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600';
    const taxesValue = getInvoiceTaxesValue(invoice);
    taxesCell.textContent = formatCurrency(taxesValue);
    row.appendChild(taxesCell);

    const totalCell = document.createElement('td');
    totalCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-900';
    const totalValue = getInvoiceTotalValue(invoice);
    totalAcumulado += toNumber(totalValue, 0);
    totalCell.textContent = formatCurrency(totalValue);
    row.appendChild(totalCell);

    invoiceTableBody.appendChild(row);
  }

  summaryCount.textContent = invoices.length.toString();
  summaryAmount.textContent = formatCurrency(totalAcumulado);

  if (updateTimestamp) {
    summaryUpdated.textContent = formatDateTime(new Date());
  }
};

const loadInvoices = async () => {
  setLoadingState(true);
  invoiceError?.classList.add('hidden');

  try {
    const response = await fetch(buildUrl('/api/facturas'));

    if (!response.ok) {
      throw new Error(`Error al consultar facturas: ${response.status}`);
    }

    const payload = await response.json();
    const facturas = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.facturas)
      ? payload.facturas
      : [];

    hasLoadedOnce = true;
    renderInvoices(facturas);
  } catch (err) {
    console.error('Error al cargar facturas emitidas:', err);
    invoiceError?.classList.remove('hidden');

    if (!hasLoadedOnce) {
      renderInvoices([], false);
      summaryUpdated.textContent = '—';
    }
  } finally {
    setLoadingState(false);
  }
};

refreshButton?.addEventListener('click', () => {
  loadInvoices();
});

loadInvoices();
