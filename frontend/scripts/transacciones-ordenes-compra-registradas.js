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
const summaryPending = document.getElementById('purchase-summary-pending');
const summaryUpdated = document.getElementById('purchase-summary-updated');
const refreshButton = document.getElementById('refresh-purchase-orders');

const paymentModal = document.getElementById('payment-modal');
const paymentModalBackdrop = document.getElementById('payment-modal-backdrop');
const paymentForm = document.getElementById('payment-form');
const paymentAmountInput = document.getElementById('payment-amount');
const paymentDateInput = document.getElementById('payment-date');
const paymentMethodInput = document.getElementById('payment-method');
const paymentReferenceInput = document.getElementById('payment-reference');
const paymentNotesInput = document.getElementById('payment-notes');
const paymentFeedback = document.getElementById('payment-feedback');
const paymentCancelButton = document.getElementById('payment-cancel');
const paymentModalClose = document.getElementById('payment-modal-close');
const paymentOrderLabel = document.getElementById('payment-order-label');
const paymentSupplierName = document.getElementById('payment-supplier-name');
const paymentSupplierId = document.getElementById('payment-supplier-id');
const paymentOrderTotal = document.getElementById('payment-order-total');
const paymentOrderPaid = document.getElementById('payment-order-paid');
const paymentOrderBalance = document.getElementById('payment-order-balance');
const paymentSubmitButton = paymentForm?.querySelector('[data-payment-submit]');
const paymentHistoryList = document.getElementById('payment-history-list');
const paymentHistoryLoading = document.getElementById('payment-history-loading');
const paymentHistoryError = document.getElementById('payment-history-error');
const paymentHistoryEmpty = document.getElementById('payment-history-empty');
const paymentHistoryRefresh = document.getElementById('payment-history-refresh');

const setHidden = (element, hidden) => {
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', hidden);
};

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

const getOrderIdValue = (order = {}) =>
  pickField(order, [
    'id',
    'orden_id',
    'ordenId',
    'order_id',
    'orderId',
    'compra_id',
    'compraId',
    'purchase_id',
    'purchaseId',
  ]);

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

const getOrderRecord = (detail = {}, fallback = {}) => detail?.orden ?? detail?.order ?? fallback;

const getOrderPaymentSummary = (source = {}) => {
  const orderRecord = getOrderRecord(source, source);
  const paymentsRecord =
    source?.pagos_resumen ??
    source?.resumen_pagos ??
    source?.pagos ??
    source?.payments ??
    {};

  const totalValue = pickField(paymentsRecord, [
    'total_orden',
    'total',
    'total_compra',
    'totalOrden',
    'totalOrdenCompra',
  ]);
  const total = toNumber(totalValue, getOrderTotalValue(orderRecord));

  const paidValue = pickField(paymentsRecord, [
    'total_pagado',
    'pagado',
    'monto_pagado',
    'amount_paid',
    'totalPagado',
    'pagos_total',
  ]);
  const paid = toNumber(paidValue, 0);

  const pendingValue = pickField(paymentsRecord, [
    'saldo_pendiente',
    'pendiente',
    'saldoPendiente',
    'saldo',
  ]);

  const pending =
    pendingValue !== null && pendingValue !== undefined && pendingValue !== ''
      ? toNumber(pendingValue, Math.max(0, total - paid))
      : Math.max(0, total - paid);

  return {
    total,
    paid,
    pending: Math.max(0, pending),
  };
};

const getOrderPaymentsList = (detail = {}) => {
  if (Array.isArray(detail?.pagos_registrados)) {
    return detail.pagos_registrados;
  }

  if (Array.isArray(detail?.pagos?.registrados)) {
    return detail.pagos.registrados;
  }

  if (Array.isArray(detail?.pagos?.historial)) {
    return detail.pagos.historial;
  }

  if (Array.isArray(detail?.pagos)) {
    return detail.pagos;
  }

  return [];
};

const normalizePaymentText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const getPaymentAmountValue = (payment = {}) =>
  toNumber(pickField(payment, ['monto_pago', 'monto', 'importe', 'valor', 'amount', 'valor_pagado']), 0);

const getPaymentDateValue = (payment = {}) =>
  pickField(payment, ['fecha_pago', 'fecha', 'fechaPago', 'created_at', 'creado_en', 'modificado_en']);

const getPaymentMethodValue = (payment = {}) => {
  const method =
    pickField(payment, ['metodo_pago', 'metodo', 'forma_pago', 'formaPago', 'payment_method', 'metodoPago']) ?? '';

  return normalizePaymentText(method) || '—';
};

const getPaymentReferenceValue = (payment = {}) => {
  const reference =
    pickField(payment, ['referencia', 'referencia_pago', 'numero_referencia', 'reference', 'folio']) ?? '';

  return normalizePaymentText(reference) || '—';
};

const getPaymentNotesValue = (payment = {}) => {
  const notes =
    pickField(payment, ['notas', 'nota', 'comentarios', 'observaciones', 'descripcion', 'description']) ?? '';

  return normalizePaymentText(notes);
};

const getPaymentActorValue = (payment = {}) => {
  const actor =
    pickField(payment, [
      'registrado_por',
      'creado_por_nombre',
      'usuario',
      'capturado_por',
      'created_by',
      'autor',
    ]) ?? '';

  return normalizePaymentText(actor) || '—';
};

const findOrderInList = (orderId) => {
  if (orderId === null || orderId === undefined) {
    return null;
  }

  const targetId = String(orderId);

  return (
    currentOrders.find((item) => {
      const value = getOrderIdValue(item);

      if (value === null || value === undefined) {
        return false;
      }

      return String(value) === targetId;
    }) ?? null
  );
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

const paymentSubmitOriginalLabel = paymentSubmitButton?.textContent ?? '';
let hasLoadedOnce = false;
let currentOrders = [];
const orderDetailsCache = new Map();
let selectedOrderId = null;
let selectedOrderDetail = null;
let detailRequestToken = 0;
let selectedOrderSummary = { total: 0, paid: 0, pending: 0 };

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
  currentOrders = Array.isArray(orders) ? orders : [];

  if (!Array.isArray(orders) || !orders.length) {
    emptyState?.classList.remove('hidden');
    summaryCount.textContent = '0';
    summaryAmount.textContent = formatCurrency(0);
    summaryPending.textContent = formatCurrency(0);
    summaryUpdated.textContent = fetchedAt ? formatDateTime(fetchedAt) : '—';
    return;
  }

  emptyState?.classList.add('hidden');

  let totalComprometido = 0;
  let totalPendiente = 0;

  for (const order of orders) {
    const orderIdValue = getOrderIdValue(order);
    const row = document.createElement('tr');
    row.dataset.orderId = orderIdValue !== null && orderIdValue !== undefined ? String(orderIdValue) : '';

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

    const paymentSummary = getOrderPaymentSummary(order);
    totalPendiente += paymentSummary.pending;

    const balanceCell = document.createElement('td');
    balanceCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-blue-700';
    balanceCell.textContent = formatCurrency(paymentSummary.pending);
    row.appendChild(balanceCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm';
    const paymentButton = document.createElement('button');
    paymentButton.type = 'button';
    paymentButton.className =
      'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
    paymentButton.textContent = 'Registrar pago';

    const isPayable =
      orderIdValue !== null &&
      orderIdValue !== undefined &&
      paymentSummary.pending > 0.01;

    if (isPayable) {
      paymentButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openPaymentModal(order);
      });
    } else {
      paymentButton.disabled = true;
      paymentButton.classList.add('cursor-not-allowed', 'opacity-60');
      paymentButton.textContent = paymentSummary.pending <= 0.01 ? 'Sin saldo' : 'No disponible';
    }

    actionsCell.appendChild(paymentButton);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  }

  summaryCount.textContent = orders.length.toString();
  summaryAmount.textContent = formatCurrency(totalComprometido);
  summaryPending.textContent = formatCurrency(totalPendiente);
  summaryUpdated.textContent = fetchedAt ? formatDateTime(fetchedAt) : formatDateTime(new Date());
};

const paymentFeedbackVariants = {
  info: ['border-blue-200', 'bg-blue-50', 'text-blue-700'],
  success: ['border-emerald-200', 'bg-emerald-50', 'text-emerald-700'],
  error: ['border-rose-200', 'bg-rose-50', 'text-rose-700'],
  warning: ['border-amber-200', 'bg-amber-50', 'text-amber-700'],
};

const clearPaymentFeedback = () => {
  if (!paymentFeedback) {
    return;
  }

  paymentFeedback.textContent = '';
  paymentFeedback.className = 'hidden rounded-xl border border-transparent px-4 py-2 text-sm';
};

const showPaymentFeedback = (message, variant = 'info') => {
  if (!paymentFeedback) {
    return;
  }

  if (!message) {
    clearPaymentFeedback();
    return;
  }

  const variantClasses = paymentFeedbackVariants[variant] ?? paymentFeedbackVariants.info;
  paymentFeedback.className = 'rounded-xl border px-4 py-2 text-sm';
  paymentFeedback.classList.add(...variantClasses);
  paymentFeedback.textContent = message;
};

const setPaymentSubmitState = (disabled) => {
  if (!paymentSubmitButton) {
    return;
  }

  paymentSubmitButton.disabled = disabled;
  paymentSubmitButton.classList.toggle('opacity-60', disabled);
  paymentSubmitButton.classList.toggle('cursor-not-allowed', disabled);
};

const setPaymentSubmitLoading = (loading) => {
  if (!paymentSubmitButton) {
    return;
  }

  if (loading) {
    setPaymentSubmitState(true);
    paymentSubmitButton.textContent = 'Registrando…';
  } else {
    paymentSubmitButton.textContent = paymentSubmitOriginalLabel;
  }
};

const setDefaultPaymentDate = () => {
  if (!paymentDateInput) {
    return;
  }

  const today = new Date();
  const isoDate = today.toISOString().split('T')[0];
  paymentDateInput.value = isoDate;
};

const resetPaymentForm = () => {
  if (!paymentForm) {
    return;
  }

  paymentForm.reset();

  if (paymentAmountInput) {
    paymentAmountInput.value = '';
    paymentAmountInput.max = '';
    paymentAmountInput.placeholder = '0.00';
    paymentAmountInput.disabled = false;
  }

  setDefaultPaymentDate();
  clearPaymentFeedback();
  setHidden(paymentHistoryLoading, true);
  setHidden(paymentHistoryError, true);
  setHidden(paymentHistoryEmpty, true);

  if (paymentHistoryList) {
    paymentHistoryList.innerHTML = '';
  }
};

const renderPaymentHistory = (detail, { showEmpty = true } = {}) => {
  if (!paymentHistoryList) {
    return;
  }

  paymentHistoryList.innerHTML = '';
  setHidden(paymentHistoryLoading, true);
  setHidden(paymentHistoryError, true);

  const payments = getOrderPaymentsList(detail);

  if (!Array.isArray(payments) || !payments.length) {
    setHidden(paymentHistoryEmpty, !showEmpty);
    return;
  }

  setHidden(paymentHistoryEmpty, true);

  for (const payment of payments) {
    const item = document.createElement('li');
    item.className = 'rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm';

    const header = document.createElement('div');
    header.className = 'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between';

    const amountElement = document.createElement('p');
    amountElement.className = 'text-base font-semibold text-gray-900';
    amountElement.textContent = formatCurrency(getPaymentAmountValue(payment));
    header.appendChild(amountElement);

    const dateValue = getPaymentDateValue(payment);
    const dateElement = document.createElement('p');
    dateElement.className = 'text-sm text-gray-500';
    dateElement.textContent = formatDateTime(dateValue);
    header.appendChild(dateElement);

    item.appendChild(header);

    const metaContainer = document.createElement('div');
    metaContainer.className = 'mt-2 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2';

    const appendMeta = (label, value) => {
      const wrapper = document.createElement('div');
      const labelElement = document.createElement('span');
      labelElement.className = 'font-medium text-gray-700';
      labelElement.textContent = `${label}:`;
      const valueElement = document.createElement('span');
      valueElement.className = 'ml-1 text-gray-600';
      valueElement.textContent = value;
      wrapper.appendChild(labelElement);
      wrapper.appendChild(document.createTextNode(' '));
      wrapper.appendChild(valueElement);
      metaContainer.appendChild(wrapper);
    };

    appendMeta('Método', getPaymentMethodValue(payment));
    appendMeta('Referencia', getPaymentReferenceValue(payment));
    appendMeta('Registrado por', getPaymentActorValue(payment));

    item.appendChild(metaContainer);

    const notesValue = getPaymentNotesValue(payment);

    if (notesValue) {
      const notesElement = document.createElement('p');
      notesElement.className = 'mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600';
      notesElement.textContent = notesValue;
      item.appendChild(notesElement);
    }

    paymentHistoryList.appendChild(item);
  }
};

const updatePaymentModalHeader = (orderRecord = {}) => {
  if (paymentOrderLabel) {
    const parts = [];
    const folio = getOrderFolio(orderRecord);

    if (folio && folio !== '—') {
      parts.push(`Orden ${folio}`);
    } else {
      parts.push('Orden seleccionada');
    }

    const status = getOrderStatus(orderRecord);

    if (status) {
      parts.push(`· ${status}`);
    }

    paymentOrderLabel.textContent = parts.join(' ');
  }

  if (paymentSupplierName) {
    paymentSupplierName.textContent = getOrderSupplierName(orderRecord);
  }

  if (paymentSupplierId) {
    const supplierIdentifier = getOrderSupplierIdentifier(orderRecord);
    paymentSupplierId.textContent = supplierIdentifier || '—';
  }
};

const updatePaymentModalSummary = (summary) => {
  selectedOrderSummary = summary;

  if (paymentOrderTotal) {
    paymentOrderTotal.textContent = formatCurrency(summary.total);
  }

  if (paymentOrderPaid) {
    paymentOrderPaid.textContent = formatCurrency(summary.paid);
  }

  if (paymentOrderBalance) {
    paymentOrderBalance.textContent = formatCurrency(summary.pending);
  }

  const hasPending = summary.pending > 0.01;

  if (paymentAmountInput) {
    if (hasPending) {
      paymentAmountInput.disabled = false;
      paymentAmountInput.max = String(summary.pending);
      paymentAmountInput.placeholder = formatCurrency(summary.pending);

      if (!paymentAmountInput.value) {
        paymentAmountInput.value = summary.pending.toFixed(2);
      }
    } else {
      paymentAmountInput.disabled = true;
      paymentAmountInput.value = '';
      paymentAmountInput.max = '';
      paymentAmountInput.placeholder = '$0.00';
    }
  }

  if (paymentSubmitButton) {
    paymentSubmitButton.textContent = hasPending ? paymentSubmitOriginalLabel : 'Sin saldo';
  }

  setPaymentSubmitState(!hasPending);
};

const applyPaymentDetailToModal = (detail, fallbackOrder = {}) => {
  const orderRecord = getOrderRecord(detail, fallbackOrder);
  updatePaymentModalHeader(orderRecord);
  const summary = getOrderPaymentSummary(detail ?? orderRecord ?? {});
  updatePaymentModalSummary(summary);
  renderPaymentHistory(detail, { showEmpty: true });
};

const fetchOrderDetail = async (orderId, { force = false } = {}) => {
  if (!force && orderDetailsCache.has(orderId)) {
    return orderDetailsCache.get(orderId);
  }

  const response = await fetch(buildUrl(`/api/ordenes-compra/${orderId}`));
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || 'No fue posible obtener la orden seleccionada.';
    throw new Error(message);
  }

  orderDetailsCache.set(orderId, payload);
  return payload;
};

const openPaymentModal = async (order = {}) => {
  if (!paymentModal || !paymentModalBackdrop) {
    return;
  }

  const orderIdValue = getOrderIdValue(order);

  if (orderIdValue === null || orderIdValue === undefined) {
    return;
  }

  selectedOrderId = orderIdValue;
  selectedOrderDetail = null;
  detailRequestToken += 1;

  resetPaymentForm();
  const baseSummary = getOrderPaymentSummary(order);
  updatePaymentModalHeader(order);
  updatePaymentModalSummary(baseSummary);
  renderPaymentHistory(null, { showEmpty: false });

  paymentModal.classList.remove('hidden');
  paymentModalBackdrop.classList.remove('hidden');

  setTimeout(() => {
    paymentAmountInput?.focus();
  }, 50);

  const token = detailRequestToken;
  const hasCachedDetail = orderDetailsCache.has(orderIdValue);

  if (!hasCachedDetail) {
    showPaymentFeedback('Cargando información de la orden…', 'info');
    setHidden(paymentHistoryLoading, false);
    setHidden(paymentHistoryEmpty, true);
    setHidden(paymentHistoryError, true);
  } else {
    const cachedDetail = orderDetailsCache.get(orderIdValue);
    selectedOrderDetail = cachedDetail;
    applyPaymentDetailToModal(cachedDetail, order);
    clearPaymentFeedback();
  }

  try {
    const detail = await fetchOrderDetail(orderIdValue, { force: true });

    if (token !== detailRequestToken) {
      return;
    }

    selectedOrderDetail = detail;
    applyPaymentDetailToModal(detail, order);
    clearPaymentFeedback();
  } catch (error) {
    if (token !== detailRequestToken) {
      return;
    }

    console.error('Error al cargar detalle de orden de compra:', error);
    showPaymentFeedback(error.message || 'No fue posible consultar la orden seleccionada.', 'error');
    setHidden(paymentHistoryLoading, true);
    setHidden(paymentHistoryError, false);
  }
};

const closePaymentModal = () => {
  if (paymentModal) {
    paymentModal.classList.add('hidden');
  }

  if (paymentModalBackdrop) {
    paymentModalBackdrop.classList.add('hidden');
  }

  selectedOrderId = null;
  selectedOrderDetail = null;
  selectedOrderSummary = { total: 0, paid: 0, pending: 0 };
  clearPaymentFeedback();
};

const refreshSelectedOrderDetail = async (showLoader = false) => {
  if (!selectedOrderId) {
    return null;
  }

  const token = ++detailRequestToken;

  if (showLoader) {
    showPaymentFeedback('Actualizando pagos de la orden…', 'info');
    setHidden(paymentHistoryLoading, false);
    setHidden(paymentHistoryError, true);
    setHidden(paymentHistoryEmpty, true);

    if (paymentHistoryList) {
      paymentHistoryList.innerHTML = '';
    }
  }

  try {
    const detail = await fetchOrderDetail(selectedOrderId, { force: true });

    if (token !== detailRequestToken) {
      return null;
    }

    selectedOrderDetail = detail;
    const fallbackOrder = findOrderInList(selectedOrderId) ?? {};
    applyPaymentDetailToModal(detail, fallbackOrder);
    clearPaymentFeedback();
    return detail;
  } catch (error) {
    if (token !== detailRequestToken) {
      return null;
    }

    console.error('Error al actualizar pagos de orden de compra:', error);
    showPaymentFeedback(error.message || 'No fue posible actualizar la información de la orden.', 'error');
    setHidden(paymentHistoryLoading, true);
    setHidden(paymentHistoryError, false);
    return null;
  }
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

paymentHistoryRefresh?.addEventListener('click', () => {
  if (!selectedOrderId) {
    showPaymentFeedback('Selecciona una orden de compra para consultar su historial.', 'warning');
    return;
  }

  refreshSelectedOrderDetail(true);
});

paymentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!selectedOrderId) {
    showPaymentFeedback('Selecciona una orden de compra.', 'warning');
    return;
  }

  const amountValue = Number(paymentAmountInput?.value ?? 0);

  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    showPaymentFeedback('Ingresa un monto de pago válido.', 'warning');
    return;
  }

  const pending = Number(selectedOrderSummary?.pending ?? 0);

  if (pending > 0.01 && amountValue - pending > 0.01) {
    showPaymentFeedback('El monto excede el saldo pendiente de la orden.', 'warning');
    return;
  }

  const dateValue = paymentDateInput?.value;

  if (!dateValue) {
    showPaymentFeedback('Selecciona la fecha del pago.', 'warning');
    return;
  }

  const methodValue = paymentMethodInput?.value?.trim();
  const referenceValue = paymentReferenceInput?.value?.trim();
  const notesValue = paymentNotesInput?.value?.trim();

  const payload = {
    monto_pago: amountValue,
    fecha_pago: dateValue,
  };

  if (methodValue) {
    payload.metodo_pago = methodValue;
  }

  if (referenceValue) {
    payload.referencia = referenceValue;
  }

  if (notesValue) {
    payload.notas = notesValue;
  }

  showPaymentFeedback('Registrando pago…', 'info');
  setPaymentSubmitLoading(true);

  try {
    const response = await fetch(buildUrl(`/api/ordenes-compra/${selectedOrderId}/procesar_pago`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result?.message || 'No fue posible registrar el pago.');
    }

    showPaymentFeedback('Pago registrado correctamente.', 'success');

    if (paymentAmountInput) {
      paymentAmountInput.value = '';
    }

    if (paymentMethodInput) {
      paymentMethodInput.value = '';
    }

    if (paymentReferenceInput) {
      paymentReferenceInput.value = '';
    }

    if (paymentNotesInput) {
      paymentNotesInput.value = '';
    }

    orderDetailsCache.delete(selectedOrderId);

    await refreshSelectedOrderDetail(false);
    await loadPurchaseOrders();
  } catch (error) {
    console.error('Error al registrar pago de orden de compra:', error);
    showPaymentFeedback(error.message || 'No se pudo registrar el pago.', 'error');
  } finally {
    setPaymentSubmitLoading(false);
    updatePaymentModalSummary(selectedOrderSummary);
  }
});

refreshButton?.addEventListener('click', () => {
  loadPurchaseOrders();
});

loadPurchaseOrders();
