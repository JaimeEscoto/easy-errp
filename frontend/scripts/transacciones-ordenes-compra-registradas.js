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
const feedbackBanner = document.getElementById('purchase-feedback');

const paymentModalBackdrop = document.getElementById('purchase-payment-modal-backdrop');
const paymentModal = document.getElementById('purchase-payment-modal');
const paymentForm = document.getElementById('purchase-payment-form');
const paymentAmountInput = document.getElementById('purchase-payment-amount');
const paymentDateInput = document.getElementById('purchase-payment-date');
const paymentMethodInput = document.getElementById('purchase-payment-method');
const paymentReferenceInput = document.getElementById('purchase-payment-reference');
const paymentNotesInput = document.getElementById('purchase-payment-notes');
const paymentError = document.getElementById('purchase-payment-error');
const paymentSubmitButton = document.querySelector('[data-purchase-payment-submit]');
const paymentLabel = document.getElementById('purchase-payment-label');
const paymentSupplierLabel = document.getElementById('purchase-payment-supplier');
const paymentStatusLabel = document.getElementById('purchase-payment-status');
const paymentHint = document.getElementById('purchase-payment-hint');
const paymentTotalLabel = document.getElementById('purchase-payment-total');
const paymentPaidLabel = document.getElementById('purchase-payment-paid');
const paymentRemainingLabel = document.getElementById('purchase-payment-remaining');
const paymentModalClose = document.getElementById('purchase-payment-modal-close');
const paymentCancelButton = document.getElementById('purchase-payment-cancel');
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

const orderDetailCache = new Map();
let selectedOrderForPayment = null;
let selectedOrderDetailForPayment = null;
let expandedOrderId = null;

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

const getOrderIdValue = (order = {}) =>
  pickField(order, [
    'id',
    'orden_id',
    'ordenId',
    'purchase_order_id',
    'purchaseOrderId',
    'numero_orden',
    'numeroOrden',
    'folio',
  ]);

const getOrderPaymentsSummary = (order = {}) =>
  order?.pagos ?? order?.pagos_resumen ?? order?.pagosResumen ?? order?.resumen_pagos ?? null;

const getOrderPaidAmountValue = (order = {}) => {
  const summary = getOrderPaymentsSummary(order);

  const paid =
    pickField(order, ['total_pagado', 'monto_pagado', 'pagado', 'totalPagado']) ??
    pickField(summary, ['total_pagado', 'totalPagado', 'pagado']);

  if (paid === null || paid === undefined) {
    return 0;
  }

  return toNumber(paid, 0);
};

const getOrderPendingAmountValue = (order = {}) => {
  const summary = getOrderPaymentsSummary(order);

  const pending =
    pickField(order, ['saldo_pendiente', 'saldoPendiente', 'pendiente_pago', 'monto_pendiente']) ??
    pickField(summary, ['saldo_pendiente', 'saldoPendiente', 'pendiente']);

  if (pending !== null && pending !== undefined) {
    return toNumber(pending, 0);
  }

  const totalValue = toNumber(getOrderTotalValue(order), 0);
  const paidValue = toNumber(getOrderPaidAmountValue(order), 0);

  if (!Number.isFinite(totalValue) || !Number.isFinite(paidValue)) {
    return null;
  }

  return Math.max(0, toNumber(totalValue - paidValue, 0));
};

const getOrderPaymentAmount = (payment = {}) =>
  toNumber(
    pickField(payment, [
      'monto_pagado',
      'monto_pago',
      'monto',
      'amount',
      'total_pago',
      'valor',
    ]),
    0
  );

const getOrderPaymentDate = (payment = {}) =>
  pickField(payment, ['fecha_pago', 'fecha', 'fechaPago', 'creado_en', 'created_at', 'modificado_en']);

const getOrderPaymentMethod = (payment = {}) =>
  pickField(payment, ['metodo_pago', 'metodo', 'metodoPago', 'forma_pago', 'formaPago', 'payment_method']);

const getOrderPaymentReference = (payment = {}) =>
  pickField(payment, ['referencia', 'referencia_pago', 'numero_referencia', 'reference']);

const getOrderPaymentNotes = (payment = {}) =>
  pickField(payment, ['notas', 'nota', 'comentarios', 'comentario', 'observaciones']);

const getOrderPaymentActor = (payment = {}) =>
  pickField(payment, ['registrado_por', 'creado_por_nombre', 'actor_nombre', 'usuario_nombre']);

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

const getOrderColumnCount = () =>
  tableBody?.closest('table')?.querySelectorAll('thead th').length ?? 1;

const resetFeedbackClasses = () => {
  if (!feedbackBanner) {
    return;
  }

  feedbackBanner.classList.remove(
    'bg-red-50',
    'text-red-800',
    'border-red-200',
    'bg-green-50',
    'text-green-800',
    'border-transparent'
  );
};

const hidePurchaseFeedback = () => {
  if (!feedbackBanner) {
    return;
  }

  feedbackBanner.classList.add('hidden');
  feedbackBanner.textContent = '';
  resetFeedbackClasses();
};

const showPurchaseFeedback = (message, variant = 'success') => {
  if (!feedbackBanner || !message) {
    return;
  }

  resetFeedbackClasses();

  if (variant === 'error') {
    feedbackBanner.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
  } else {
    feedbackBanner.classList.add('bg-green-50', 'text-green-800', 'border-transparent');
  }

  feedbackBanner.textContent = message;
  feedbackBanner.classList.remove('hidden');
};

const setPaymentHintMessage = (message, variant = 'info') => {
  if (!paymentHint) {
    return;
  }

  const variantClasses = {
    info: 'text-xs text-gray-500',
    success: 'text-xs text-emerald-600',
    warning: 'text-xs font-medium text-amber-600',
    error: 'text-xs font-medium text-rose-600',
  };

  paymentHint.className = variantClasses[variant] ?? variantClasses.info;
  paymentHint.textContent = message ?? '';
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
  paymentForm?.reset();

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);

  if (paymentDateInput) {
    paymentDateInput.value = isoDate;
  }

  if (paymentAmountInput) {
    paymentAmountInput.value = '';
    paymentAmountInput.placeholder = '$0.00';
    paymentAmountInput.removeAttribute('max');
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

  setPaymentHintMessage('', 'info');
  setPaymentError('');
  setPaymentSubmitting(false);
  selectedOrderDetailForPayment = null;
};

const closePaymentModal = () => {
  if (paymentModal) {
    paymentModal.classList.add('hidden');
  }

  if (paymentModalBackdrop) {
    paymentModalBackdrop.classList.add('hidden');
  }

  document.body.classList.remove('overflow-hidden');
  selectedOrderForPayment = null;
  resetPaymentForm();
};

const fetchOrderDetail = async (orderId, { force = false } = {}) => {
  const cacheKey = String(orderId);

  if (!force) {
    const cached = orderDetailCache.get(cacheKey);

    if (cached?.status === 'loaded') {
      return cached.detail;
    }

    if (cached?.status === 'loading') {
      return cached.promise;
    }
  }

  const endpointId = encodeURIComponent(String(orderId));

  const request = (async () => {
    const response = await fetch(buildUrl(`/api/ordenes-compra/${endpointId}`));
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload?.message ?? 'No fue posible obtener el detalle de la orden.';
      throw new Error(message);
    }

    const normalizedDetail = {
      orden: payload?.orden ?? null,
      resumen: payload?.resumen ?? {},
      pagos: payload?.pagos ?? {},
      pagos_registrados: Array.isArray(payload?.pagos_registrados) ? payload.pagos_registrados : [],
    };

    orderDetailCache.set(cacheKey, { status: 'loaded', detail: normalizedDetail });
    return normalizedDetail;
  })();

  orderDetailCache.set(cacheKey, { status: 'loading', promise: request });

  try {
    return await request;
  } catch (error) {
    orderDetailCache.set(cacheKey, { status: 'error', message: error.message });
    throw error;
  }
};

const renderOrderPaymentsLoading = (container) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const loadingWrapper = document.createElement('div');
  loadingWrapper.className = 'flex items-center gap-2 text-sm text-blue-700';

  const spinner = document.createElement('span');
  spinner.className = 'inline-flex h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600';
  spinner.setAttribute('aria-hidden', 'true');
  loadingWrapper.appendChild(spinner);

  const label = document.createElement('span');
  label.textContent = 'Cargando pagos…';
  loadingWrapper.appendChild(label);

  container.appendChild(loadingWrapper);
};

const renderOrderPaymentsError = (container, message, { onRetry } = {}) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700';

  const messageElement = document.createElement('p');
  messageElement.textContent = message ?? 'Ocurrió un error al consultar los pagos de la orden.';
  wrapper.appendChild(messageElement);

  if (typeof onRetry === 'function') {
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className =
      'mt-3 inline-flex items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400';
    retryButton.textContent = 'Reintentar';
    retryButton.addEventListener('click', () => onRetry());
    wrapper.appendChild(retryButton);
  }

  container.appendChild(wrapper);
};

const renderOrderPaymentsList = (container, detail = {}, order = {}, { onRefresh } = {}) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'space-y-4';
  container.appendChild(wrapper);

  const header = document.createElement('div');
  header.className = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';
  wrapper.appendChild(header);

  const title = document.createElement('h4');
  title.className = 'text-sm font-semibold text-gray-900';
  title.textContent = 'Pagos registrados';
  header.appendChild(title);

  if (typeof onRefresh === 'function') {
    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className =
      'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
    refreshButton.innerHTML =
      '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992V4.356M2.985 15.366v4.992h4.992M20.671 7.02A9.5 9.5 0 1011.5 21" /></svg><span>Actualizar</span>';
    refreshButton.addEventListener('click', () => onRefresh());
    header.appendChild(refreshButton);
  }

  const orderRecord = detail?.orden ?? order ?? {};
  const payments = Array.isArray(detail?.pagos_registrados) ? detail.pagos_registrados : [];
  const totalValue = toNumber(getOrderTotalValue(orderRecord), 0);
  const paidValue = toNumber(detail?.pagos?.total_pagado ?? getOrderPaidAmountValue(orderRecord), 0);

  let pendingValue;

  if (detail?.pagos?.saldo_pendiente !== undefined && detail?.pagos?.saldo_pendiente !== null) {
    pendingValue = toNumber(detail.pagos.saldo_pendiente, 0);
  } else {
    const computedPending = getOrderPendingAmountValue({
      ...orderRecord,
      pagos: detail?.pagos ?? orderRecord?.pagos ?? null,
    });

    if (computedPending === null || computedPending === undefined) {
      pendingValue = Math.max(0, toNumber(totalValue - paidValue, 0));
    } else {
      pendingValue = toNumber(computedPending, 0);
    }
  }

  const summaryCard = document.createElement('div');
  summaryCard.className = 'rounded-2xl border border-blue-100 bg-white px-4 py-4 shadow-sm';
  wrapper.appendChild(summaryCard);

  const summaryList = document.createElement('dl');
  summaryList.className = 'grid gap-3 text-sm sm:grid-cols-4';
  summaryCard.appendChild(summaryList);

  const addSummaryItem = (label, value, { emphasize = false } = {}) => {
    const itemWrapper = document.createElement('div');
    const term = document.createElement('dt');
    term.className = 'text-xs uppercase tracking-wide text-gray-500';
    term.textContent = label;
    const detailElement = document.createElement('dd');
    detailElement.className = emphasize
      ? 'mt-1 text-lg font-semibold text-blue-700'
      : 'mt-1 font-medium text-gray-900';
    detailElement.textContent = value;
    itemWrapper.appendChild(term);
    itemWrapper.appendChild(detailElement);
    summaryList.appendChild(itemWrapper);
  };

  addSummaryItem('Total de la orden', formatCurrency(totalValue));
  addSummaryItem('Total pagado', formatCurrency(paidValue));
  addSummaryItem('Saldo pendiente', formatCurrency(pendingValue), { emphasize: true });
  addSummaryItem('Pagos registrados', String(payments.length));

  if (detail?.resumen?.recepcion_completa === false) {
    const warning = document.createElement('p');
    warning.className = 'mt-3 text-xs font-medium text-amber-600';
    warning.textContent =
      'La orden aún tiene productos pendientes de recibir en almacén. El pago solo puede registrarse cuando la recepción esté completa.';
    summaryCard.appendChild(warning);
  } else if (pendingValue <= 0.01) {
    const completed = document.createElement('p');
    completed.className = 'mt-3 text-xs text-emerald-600';
    completed.textContent = 'La orden está liquidada. No hay pagos pendientes.';
    summaryCard.appendChild(completed);
  }

  if (!payments.length) {
    const emptyState = document.createElement('div');
    emptyState.className =
      'rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-6 text-center text-sm text-gray-500';
    emptyState.textContent = 'No se han registrado pagos para esta orden de compra.';
    wrapper.appendChild(emptyState);
    return;
  }

  const listContainer = document.createElement('div');
  listContainer.className = 'space-y-3';
  wrapper.appendChild(listContainer);

  for (const payment of payments) {
    const paymentCard = document.createElement('article');
    paymentCard.className = 'rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between';
    paymentCard.appendChild(cardHeader);

    const amountElement = document.createElement('p');
    amountElement.className = 'text-base font-semibold text-gray-900';
    amountElement.textContent = formatCurrency(getOrderPaymentAmount(payment));
    cardHeader.appendChild(amountElement);

    const dateValue = getOrderPaymentDate(payment);
    const dateElement = document.createElement('p');
    dateElement.className = 'text-sm text-gray-500';
    const dateLabel = formatDateOnly(dateValue);
    const timeLabel = formatTimeOnly(dateValue);
    dateElement.textContent = dateLabel ? (timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel) : '—';
    cardHeader.appendChild(dateElement);

    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600';

    const methodValue = getOrderPaymentMethod(payment);
    if (methodValue) {
      const methodBadge = document.createElement('span');
      methodBadge.className =
        'inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700';
      methodBadge.textContent = methodValue;
      badgeContainer.appendChild(methodBadge);
    }

    const referenceValue = getOrderPaymentReference(payment);
    if (referenceValue) {
      const referenceBadge = document.createElement('span');
      referenceBadge.className = 'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1';
      referenceBadge.textContent = `Ref: ${referenceValue}`;
      badgeContainer.appendChild(referenceBadge);
    }

    const actorValue = getOrderPaymentActor(payment);
    if (actorValue) {
      const actorBadge = document.createElement('span');
      actorBadge.className = 'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1';
      actorBadge.textContent = `Registrado por ${actorValue}`;
      badgeContainer.appendChild(actorBadge);
    }

    if (badgeContainer.childElementCount) {
      paymentCard.appendChild(badgeContainer);
    }

    const notesValue = getOrderPaymentNotes(payment);
    if (notesValue) {
      const notesElement = document.createElement('p');
      notesElement.className = 'mt-3 text-sm text-gray-600';
      notesElement.textContent = notesValue;
      paymentCard.appendChild(notesElement);
    }

    listContainer.appendChild(paymentCard);
  }
};

const closeOrderDetailRow = (row) => {
  if (!row) {
    return;
  }

  row.dataset.expanded = 'false';
  row.classList.remove('bg-emerald-50/40');

  const icon = row.querySelector('[data-order-toggle-icon]');

  if (icon) {
    icon.textContent = '▸';
  }

  const detailRow = row.nextElementSibling;

  if (detailRow?.dataset?.role === 'order-payments-detail') {
    detailRow.remove();
  }

  if (expandedOrderId && row.dataset.orderId === expandedOrderId) {
    expandedOrderId = null;
  }
};

const openOrderDetailRow = async (row, order, { force = false } = {}) => {
  if (!row || !order) {
    return;
  }

  const columnCount = getOrderColumnCount();
  let detailRow = row.nextElementSibling;

  if (!detailRow || detailRow.dataset.role !== 'order-payments-detail') {
    detailRow = document.createElement('tr');
    detailRow.dataset.role = 'order-payments-detail';
    const detailCell = document.createElement('td');
    detailCell.colSpan = columnCount;
    detailCell.className = 'bg-slate-50 px-6 py-5 text-sm text-gray-700';
    detailRow.appendChild(detailCell);
    row.after(detailRow);
  }

  const detailCell = detailRow.firstElementChild;

  row.dataset.expanded = 'true';
  row.classList.add('bg-emerald-50/40');

  const icon = row.querySelector('[data-order-toggle-icon]');

  if (icon) {
    icon.textContent = '▾';
  }

  const orderIdValue = getOrderIdValue(order);

  if (orderIdValue === null || orderIdValue === undefined) {
    renderOrderPaymentsError(detailCell, 'No se pudo identificar la orden seleccionada.');
    return;
  }

  expandedOrderId = String(orderIdValue);

  const cacheKey = String(orderIdValue);
  const cached = orderDetailCache.get(cacheKey);

  if (!force) {
    if (cached?.status === 'loaded') {
      renderOrderPaymentsList(detailCell, cached.detail, order, {
        onRefresh: () => openOrderDetailRow(row, order, { force: true }),
      });
      return;
    }

    if (cached?.status === 'error') {
      renderOrderPaymentsError(detailCell, cached.message, {
        onRetry: () => openOrderDetailRow(row, order, { force: true }),
      });
      return;
    }
  }

  renderOrderPaymentsLoading(detailCell);

  try {
    const detail = await fetchOrderDetail(orderIdValue, { force });
    renderOrderPaymentsList(detailCell, detail, order, {
      onRefresh: () => openOrderDetailRow(row, order, { force: true }),
    });
  } catch (error) {
    console.error('Error al consultar los pagos de la orden de compra:', error);
    renderOrderPaymentsError(detailCell, error?.message ?? 'Ocurrió un error al consultar los pagos de la orden.', {
      onRetry: () => openOrderDetailRow(row, order, { force: true }),
    });
  }
};

const updatePaymentSummary = (order = {}, detail = null) => {
  const orderRecord = detail?.orden ?? order ?? {};
  const totalValue = toNumber(getOrderTotalValue(orderRecord), 0);
  const paidValue = toNumber(detail?.pagos?.total_pagado ?? getOrderPaidAmountValue(orderRecord), 0);

  let pendingValue;

  if (detail?.pagos?.saldo_pendiente !== undefined && detail?.pagos?.saldo_pendiente !== null) {
    pendingValue = toNumber(detail.pagos.saldo_pendiente, 0);
  } else {
    const computed = getOrderPendingAmountValue({
      ...orderRecord,
      pagos: detail?.pagos ?? orderRecord?.pagos ?? null,
    });

    if (computed === null || computed === undefined) {
      pendingValue = Math.max(0, toNumber(totalValue - paidValue, 0));
    } else {
      pendingValue = toNumber(computed, 0);
    }
  }

  if (paymentTotalLabel) {
    paymentTotalLabel.textContent = formatCurrency(totalValue);
  }

  if (paymentPaidLabel) {
    paymentPaidLabel.textContent = formatCurrency(paidValue);
  }

  if (paymentRemainingLabel) {
    paymentRemainingLabel.textContent = formatCurrency(pendingValue);
  }

  const disableSubmit = Number.isFinite(pendingValue) && pendingValue <= 0.009;

  if (paymentSubmitButton) {
    paymentSubmitButton.disabled = disableSubmit;
    paymentSubmitButton.classList.toggle('opacity-60', disableSubmit);
    paymentSubmitButton.classList.toggle('cursor-not-allowed', disableSubmit);
    if (!disableSubmit && paymentSubmitButton.textContent !== paymentSubmitOriginalLabel) {
      paymentSubmitButton.textContent = paymentSubmitOriginalLabel;
    } else if (disableSubmit) {
      paymentSubmitButton.textContent = paymentSubmitOriginalLabel;
    }
  }

  if (paymentAmountInput) {
    if (Number.isFinite(pendingValue) && pendingValue > 0) {
      paymentAmountInput.placeholder = formatCurrency(pendingValue);
      paymentAmountInput.max = String(pendingValue);
    } else {
      paymentAmountInput.placeholder = '$0.00';
      paymentAmountInput.removeAttribute('max');
    }
  }

  return pendingValue;
};

const openPaymentModal = async (order) => {
  if (!order || !paymentModal || !paymentModalBackdrop) {
    return;
  }

  selectedOrderForPayment = order;
  setPaymentError('');
  setPaymentSubmitting(false);

  const folio = getOrderFolio(order);

  if (paymentLabel) {
    paymentLabel.textContent = folio ? `Orden ${folio}` : 'Orden de compra';
  }

  if (paymentSupplierLabel) {
    paymentSupplierLabel.textContent = getOrderSupplierName(order);
  }

  if (paymentStatusLabel) {
    paymentStatusLabel.textContent = getOrderStatus(order);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  if (paymentDateInput) {
    paymentDateInput.value = todayIso;
  }

  setPaymentHintMessage('Cargando información de la orden…', 'info');

  paymentModal.classList.remove('hidden');
  paymentModalBackdrop.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  const orderIdValue = getOrderIdValue(order);

  if (orderIdValue === null || orderIdValue === undefined) {
    setPaymentError('La orden seleccionada no es válida para registrar pagos.');
    setPaymentHintMessage('No se pudo identificar la orden de compra seleccionada.', 'error');
    setTimeout(() => paymentAmountInput?.focus(), 50);
    return;
  }

  let detail = null;
  const cacheKey = String(orderIdValue);
  const cached = orderDetailCache.get(cacheKey);

  if (cached?.status === 'loaded') {
    detail = cached.detail;
  } else {
    try {
      detail = await fetchOrderDetail(orderIdValue);
    } catch (error) {
      console.error('Error al cargar el detalle de la orden de compra:', error);
      setPaymentHintMessage(error?.message ?? 'No fue posible obtener la información de la orden.', 'error');
      setPaymentError('No fue posible obtener la información de la orden. Verifica antes de registrar el pago.');
    }
  }

  selectedOrderDetailForPayment = detail ?? null;

  const pendingValue = updatePaymentSummary(detail?.orden ?? order, detail);

  if (paymentAmountInput) {
    if (Number.isFinite(pendingValue) && pendingValue > 0) {
      paymentAmountInput.value = pendingValue.toFixed(2);
    } else {
      paymentAmountInput.value = '';
    }
  }

  if (detail?.resumen?.recepcion_completa === false) {
    setPaymentHintMessage(
      'La orden aún tiene productos pendientes de recibir en almacén. El sistema impedirá registrar pagos hasta completar la recepción.',
      'warning'
    );
  } else if (Number.isFinite(pendingValue) && pendingValue <= 0.01) {
    setPaymentHintMessage('La orden está liquidada. No hay pagos pendientes.', 'success');
  } else if (detail) {
    setPaymentHintMessage('La recepción de la orden está completa. Puedes registrar pagos pendientes.', 'info');
  } else {
    setPaymentHintMessage('Verifica la información antes de registrar el pago.', 'info');
  }

  setTimeout(() => {
    paymentAmountInput?.focus();
  }, 50);
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
  const renderedRows = [];

  for (const order of orders) {
    const orderIdValue = getOrderIdValue(order);
    const isExpandable = orderIdValue !== null && orderIdValue !== undefined;

    const row = document.createElement('tr');

    if (isExpandable) {
      row.dataset.orderId = String(orderIdValue);
      row.dataset.expanded = 'false';
      row.classList.add('cursor-pointer', 'transition-colors', 'hover:bg-emerald-50/40');
    }

    const folioCell = document.createElement('td');
    folioCell.className = 'whitespace-nowrap px-4 py-3 text-sm text-gray-500';

    if (isExpandable) {
      const folioWrapper = document.createElement('div');
      folioWrapper.className = 'flex items-center gap-2';
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'text-base leading-none text-gray-400';
      toggleIcon.textContent = '▸';
      toggleIcon.setAttribute('aria-hidden', 'true');
      toggleIcon.dataset.orderToggleIcon = 'true';
      folioWrapper.appendChild(toggleIcon);

      const folioLabel = document.createElement('span');
      folioLabel.className = 'font-medium text-gray-900';
      folioLabel.textContent = getOrderFolio(order);
      folioWrapper.appendChild(folioLabel);

      folioCell.appendChild(folioWrapper);
    } else {
      folioCell.textContent = getOrderFolio(order);
    }

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

    const pendingCell = document.createElement('td');
    pendingCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-blue-700';
    const pendingValue = getOrderPendingAmountValue(order);
    pendingCell.textContent =
      pendingValue === null || pendingValue === undefined ? '—' : formatCurrency(pendingValue);
    row.appendChild(pendingCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'whitespace-nowrap px-4 py-3 text-right text-sm';
    const paymentButton = document.createElement('button');
    paymentButton.type = 'button';
    paymentButton.className =
      'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
    paymentButton.textContent = 'Registrar pago';
    actionsCell.appendChild(paymentButton);
    row.appendChild(actionsCell);

    const pendingNumeric = Number.isFinite(pendingValue) ? pendingValue : null;
    const isPayable =
      isExpandable && (pendingNumeric === null || pendingNumeric === undefined || pendingNumeric > 0.009);

    if (isPayable) {
      paymentButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openPaymentModal(order);
      });
    } else {
      paymentButton.disabled = true;
      paymentButton.classList.add('cursor-not-allowed', 'opacity-60');
      paymentButton.textContent =
        pendingNumeric !== null && pendingNumeric !== undefined && pendingNumeric <= 0.009
          ? 'Sin saldo'
          : 'No disponible';
    }

    if (isExpandable) {
      row.addEventListener('click', (event) => {
        if (event.target.closest('button, a, input, textarea, select, label')) {
          return;
        }

        if (row.dataset.expanded === 'true') {
          closeOrderDetailRow(row);
        } else {
          const expandedRow = tableBody.querySelector('tr[data-expanded="true"]');

          if (expandedRow && expandedRow !== row) {
            closeOrderDetailRow(expandedRow);
          }

          openOrderDetailRow(row, order);
        }
      });
    }

    tableBody.appendChild(row);
    renderedRows.push({ row, order, orderIdValue });
  }

  summaryCount.textContent = orders.length.toString();
  summaryAmount.textContent = formatCurrency(totalComprometido);
  summaryUpdated.textContent = fetchedAt ? formatDateTime(fetchedAt) : formatDateTime(new Date());

  if (expandedOrderId) {
    const match = renderedRows.find(
      ({ orderIdValue }) => orderIdValue !== null && orderIdValue !== undefined && String(orderIdValue) === expandedOrderId
    );

    if (match) {
      setTimeout(() => {
        openOrderDetailRow(match.row, match.order);
      }, 0);
    } else {
      expandedOrderId = null;
    }
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

refreshButton?.addEventListener('click', () => {
  loadPurchaseOrders();
});

paymentModalBackdrop?.addEventListener('click', () => {
  closePaymentModal();
});

paymentModalClose?.addEventListener('click', () => {
  closePaymentModal();
});

paymentCancelButton?.addEventListener('click', () => {
  closePaymentModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !paymentModal?.classList.contains('hidden')) {
    closePaymentModal();
  }
});

paymentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!selectedOrderForPayment) {
    setPaymentError('Selecciona una orden de compra.');
    return;
  }

  const orderIdValue = getOrderIdValue(selectedOrderForPayment);

  if (orderIdValue === null || orderIdValue === undefined) {
    setPaymentError('La orden seleccionada no es válida.');
    return;
  }

  const amount = Number(paymentAmountInput?.value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    setPaymentError('Ingresa un monto de pago válido.');
    return;
  }

  const pendingAllowed = selectedOrderDetailForPayment?.pagos?.saldo_pendiente;

  if (pendingAllowed !== undefined && pendingAllowed !== null && amount - pendingAllowed > 0.01) {
    setPaymentError('El monto excede el saldo pendiente de la orden.');
    return;
  }

  const paymentDateValue = paymentDateInput?.value;

  if (!paymentDateValue) {
    setPaymentError('Selecciona la fecha del pago.');
    return;
  }

  const payload = {
    monto_pago: amount,
    fecha_pago: paymentDateValue,
  };

  const methodValue = paymentMethodInput?.value?.trim();

  if (methodValue) {
    payload.metodo_pago = methodValue;
  }

  const referenceValue = paymentReferenceInput?.value?.trim();

  if (referenceValue) {
    payload.referencia = referenceValue;
  }

  const notesValue = paymentNotesInput?.value?.trim();

  if (notesValue) {
    payload.notas = notesValue;
  }

  setPaymentError('');
  setPaymentSubmitting(true);

  try {
    const response = await fetch(
      buildUrl(`/api/ordenes-compra/${encodeURIComponent(String(orderIdValue))}/procesar_pago`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = result?.message ?? 'No fue posible registrar el pago.';
      throw new Error(message);
    }

    const cacheKey = String(orderIdValue);
    const updatedDetail = {
      orden: result?.orden ?? selectedOrderDetailForPayment?.orden ?? selectedOrderForPayment,
      resumen: result?.resumen ?? selectedOrderDetailForPayment?.resumen ?? {},
      pagos: result?.pagos ?? selectedOrderDetailForPayment?.pagos ?? {},
      pagos_registrados: Array.isArray(result?.pagos_registrados)
        ? result.pagos_registrados
        : selectedOrderDetailForPayment?.pagos_registrados ?? [],
    };

    orderDetailCache.set(cacheKey, { status: 'loaded', detail: updatedDetail });

    closePaymentModal();
    showPurchaseFeedback(result?.message ?? 'Pago registrado correctamente.');
    expandedOrderId = cacheKey;
    await loadPurchaseOrders();
  } catch (error) {
    console.error('Error al registrar el pago de la orden de compra:', error);
    setPaymentError(error?.message ?? 'Ocurrió un error al registrar el pago.');
    setPaymentSubmitting(false);
  }
});

hidePurchaseFeedback();
loadPurchaseOrders();
