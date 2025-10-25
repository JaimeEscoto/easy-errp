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
const invoiceFeedback = document.getElementById('invoice-feedback');
const summaryCount = document.getElementById('invoice-summary-count');
const summaryAmount = document.getElementById('invoice-summary-amount');
const summaryUpdated = document.getElementById('invoice-summary-updated');
const refreshButton = document.getElementById('refresh-invoices');
const paymentModal = document.getElementById('payment-modal');
const paymentModalBackdrop = document.getElementById('payment-modal-backdrop');
const paymentForm = document.getElementById('payment-form');
const paymentAmountInput = document.getElementById('payment-amount');
const paymentDateInput = document.getElementById('payment-date');
const paymentMethodInput = document.getElementById('payment-method');
const paymentReferenceInput = document.getElementById('payment-reference');
const paymentNotesInput = document.getElementById('payment-notes');
const paymentError = document.getElementById('payment-error');
const paymentCancelButton = document.getElementById('payment-cancel');
const paymentModalClose = document.getElementById('payment-modal-close');
const paymentInvoiceLabel = document.getElementById('payment-invoice-label');
const paymentClientName = document.getElementById('payment-client-name');
const paymentClientId = document.getElementById('payment-client-id');
const paymentInvoiceTotal = document.getElementById('payment-invoice-total');
const paymentInvoiceBalance = document.getElementById('payment-invoice-balance');
const paymentSubmitButton = paymentForm?.querySelector('[data-payment-submit]');

let currentInvoices = [];
let selectedInvoiceForPayment = null;
const paymentSubmitOriginalLabel = paymentSubmitButton?.textContent ?? '';

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

const getInvoiceIdValue = (invoice = {}) =>
  pickField(invoice, [
    'id',
    'factura_id',
    'facturaId',
    'invoice_id',
    'invoiceId',
    'venta_id',
    'ventaId',
  ]);

const getInvoiceClientIdValue = (invoice = {}) =>
  pickField(invoice, [
    'id_cliente',
    'cliente_id',
    'clienteId',
    'client_id',
    'clientId',
    'tercero_id',
    'terceroId',
  ]) ?? pickField(getInvoiceClientRecord(invoice), ['id', 'tercero_id']);

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

const getInvoicePaidAmountValue = (invoice = {}) =>
  pickField(invoice, [
    'monto_pagado',
    'total_pagado',
    'pagado',
    'monto_total_pagado',
    'total_abonos',
    'total_abonado',
  ]) ?? 0;

const getInvoicePendingAmountValue = (invoice = {}) => {
  const explicitPending = pickField(invoice, [
    'saldo_pendiente',
    'saldoPendiente',
    'saldo',
    'balance',
    'pendiente_por_cobrar',
    'amount_due',
  ]);

  if (explicitPending !== null && explicitPending !== undefined && explicitPending !== '') {
    return toNumber(explicitPending, 0);
  }

  const total = toNumber(getInvoiceTotalValue(invoice), 0);
  const paid = toNumber(getInvoicePaidAmountValue(invoice), 0);
  const pending = total - paid;

  return pending > 0 ? pending : 0;
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

const hideInvoiceFeedback = () => {
  if (!invoiceFeedback) {
    return;
  }

  invoiceFeedback.classList.add('hidden');
  invoiceFeedback.textContent = '';
  invoiceFeedback.classList.remove('bg-red-50', 'text-red-800', 'border-red-200');
  invoiceFeedback.classList.add('bg-green-50', 'text-green-800', 'border-transparent');
};

const showInvoiceFeedback = (message, { tone = 'success' } = {}) => {
  if (!invoiceFeedback) {
    return;
  }

  invoiceFeedback.textContent = message;
  invoiceFeedback.classList.remove('hidden');

  if (tone === 'error') {
    invoiceFeedback.classList.remove('bg-green-50', 'text-green-800', 'border-transparent');
    invoiceFeedback.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
  } else {
    invoiceFeedback.classList.remove('bg-red-50', 'text-red-800', 'border-red-200');
    invoiceFeedback.classList.add('bg-green-50', 'text-green-800', 'border-transparent');
  }
};

const setPaymentError = (message) => {
  if (!paymentError) {
    return;
  }

  if (!message) {
    paymentError.classList.add('hidden');
    paymentError.textContent = '';
    return;
  }

  paymentError.textContent = message;
  paymentError.classList.remove('hidden');
};

const setPaymentSubmitting = (isSubmitting) => {
  if (!paymentSubmitButton) {
    return;
  }

  if (isSubmitting) {
    paymentSubmitButton.disabled = true;
    paymentSubmitButton.textContent = 'Registrando…';
  } else {
    paymentSubmitButton.disabled = false;
    paymentSubmitButton.textContent = paymentSubmitOriginalLabel;
  }
};

const resetPaymentForm = () => {
  if (!paymentForm) {
    return;
  }

  paymentForm.reset();
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);

  if (paymentDateInput) {
    paymentDateInput.value = isoDate;
  }

  setPaymentError('');
  setPaymentSubmitting(false);
};

const closePaymentModal = () => {
  if (paymentModal) {
    paymentModal.classList.add('hidden');
  }

  if (paymentModalBackdrop) {
    paymentModalBackdrop.classList.add('hidden');
  }

  document.body.classList.remove('overflow-hidden');
  selectedInvoiceForPayment = null;
  resetPaymentForm();
};

const openPaymentModal = (invoice) => {
  if (!invoice || !paymentModal || !paymentModalBackdrop) {
    return;
  }

  selectedInvoiceForPayment = invoice;

  const invoiceIdValue = getInvoiceIdValue(invoice);
  const invoiceFolio = getInvoiceFolio(invoice);
  const clientNameValue = getInvoiceClientName(invoice);
  const clientIdentifier = getInvoiceClientIdentifier(invoice);
  const invoiceTotalValue = getInvoiceTotalValue(invoice);
  const pendingValue = getInvoicePendingAmountValue(invoice);

  if (paymentInvoiceLabel) {
    const labelParts = ['Factura'];
    if (invoiceFolio) {
      labelParts.push(String(invoiceFolio));
    } else if (invoiceIdValue !== null && invoiceIdValue !== undefined) {
      labelParts.push(String(invoiceIdValue));
    }
    paymentInvoiceLabel.textContent = labelParts.join(' ');
  }

  if (paymentClientName) {
    paymentClientName.textContent = clientNameValue;
  }

  if (paymentClientId) {
    paymentClientId.textContent = clientIdentifier || '—';
  }

  if (paymentInvoiceTotal) {
    paymentInvoiceTotal.textContent = formatCurrency(invoiceTotalValue);
  }

  if (paymentInvoiceBalance) {
    paymentInvoiceBalance.textContent = formatCurrency(pendingValue);
  }

  resetPaymentForm();

  if (paymentAmountInput) {
    paymentAmountInput.value = pendingValue > 0 ? pendingValue.toFixed(2) : '';
  }

  paymentModal.classList.remove('hidden');
  paymentModalBackdrop.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  setTimeout(() => {
    paymentAmountInput?.focus();
  }, 50);
};

const renderInvoices = (invoices = [], updateTimestamp = true) => {
  invoiceTableBody.innerHTML = '';

  currentInvoices = Array.isArray(invoices) ? invoices : [];

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

    const actionsCell = document.createElement('td');
    actionsCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm';
    const paymentButton = document.createElement('button');
    paymentButton.type = 'button';
    paymentButton.className =
      'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
    paymentButton.textContent = 'Registrar pago';

    const invoiceIdValue = getInvoiceIdValue(invoice);
    const clientIdValue = getInvoiceClientIdValue(invoice);
    const pendingAmount = getInvoicePendingAmountValue(invoice);

    const isPayable =
      invoiceIdValue !== null &&
      invoiceIdValue !== undefined &&
      clientIdValue !== null &&
      clientIdValue !== undefined &&
      pendingAmount > 0;

    if (isPayable) {
      paymentButton.addEventListener('click', () => openPaymentModal(invoice));
    } else {
      paymentButton.disabled = true;
      paymentButton.classList.add('cursor-not-allowed', 'opacity-60');
      paymentButton.textContent = pendingAmount <= 0 ? 'Sin saldo' : 'No disponible';
    }

    actionsCell.appendChild(paymentButton);
    row.appendChild(actionsCell);

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

paymentModalBackdrop?.addEventListener('click', () => {
  closePaymentModal();
});

paymentCancelButton?.addEventListener('click', () => {
  closePaymentModal();
});

paymentModalClose?.addEventListener('click', () => {
  closePaymentModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !paymentModal?.classList.contains('hidden')) {
    closePaymentModal();
  }
});

paymentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!selectedInvoiceForPayment) {
    setPaymentError('No se encontró la factura seleccionada.');
    return;
  }

  const invoiceIdValue = getInvoiceIdValue(selectedInvoiceForPayment);
  const clientIdValue = getInvoiceClientIdValue(selectedInvoiceForPayment);

  if (invoiceIdValue === null || invoiceIdValue === undefined) {
    setPaymentError('La factura seleccionada no es válida.');
    return;
  }

  if (clientIdValue === null || clientIdValue === undefined) {
    setPaymentError('No se encontró el cliente asociado a la factura.');
    return;
  }

  const paymentAmount = Number(paymentAmountInput?.value ?? 0);

  if (!(paymentAmount > 0)) {
    setPaymentError('Ingrese un monto de pago válido.');
    return;
  }

  const paymentDateValue = paymentDateInput?.value;

  if (!paymentDateValue) {
    setPaymentError('Seleccione la fecha del pago.');
    return;
  }

  const payload = {
    id_factura: invoiceIdValue,
    id_cliente: clientIdValue,
    monto_pago: paymentAmount,
    fecha_pago: paymentDateValue,
  };

  const methodValue = paymentMethodInput?.value?.trim();
  const referenceValue = paymentReferenceInput?.value?.trim();
  const notesValue = paymentNotesInput?.value?.trim();

  if (methodValue) {
    payload.metodo_pago = methodValue;
  }

  if (referenceValue) {
    payload.referencia_pago = referenceValue;
  }

  if (notesValue) {
    payload.notas = notesValue;
  }

  setPaymentError('');
  setPaymentSubmitting(true);

  try {
    const response = await fetch(buildUrl('/api/cxc/registrar_pago'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = result?.message ?? 'No fue posible registrar el pago. Inténtalo de nuevo.';
      throw new Error(message);
    }

    const successMessage =
      result?.message ?? 'El pago se registró correctamente y la factura fue actualizada.';

    closePaymentModal();
    showInvoiceFeedback(successMessage);
    await loadInvoices();
  } catch (err) {
    console.error('Error al registrar el pago:', err);
    setPaymentError(err?.message ?? 'Ocurrió un error inesperado al registrar el pago.');
    setPaymentSubmitting(false);
  }
});

hideInvoiceFeedback();
loadInvoices();
