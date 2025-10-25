import { requireSession } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para registrar pagos de órdenes de compra.');
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

const orderSelect = document.getElementById('payment-order');
const orderHelp = document.getElementById('payment-order-help');
const amountInput = document.getElementById('payment-amount');
const dateInput = document.getElementById('payment-date');
const methodInput = document.getElementById('payment-method');
const referenceInput = document.getElementById('payment-reference');
const notesInput = document.getElementById('payment-notes');
const formMessage = document.getElementById('payment-form-message');
const submitButton = document.querySelector('#payment-form button[type="submit"]');
const form = document.getElementById('payment-form');

const summaryTotal = document.getElementById('payment-summary-total');
const summaryPaid = document.getElementById('payment-summary-paid');
const summaryRemaining = document.getElementById('payment-summary-remaining');
const summaryStatus = document.getElementById('payment-summary-status');

const historyLoading = document.getElementById('payment-history-loading');
const historyError = document.getElementById('payment-history-error');
const historyEmpty = document.getElementById('payment-history-empty');
const historyTable = document.getElementById('payment-history-table');
const historyRefreshButton = document.getElementById('refresh-payment-history');

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
  if (value === undefined || value === null) {
    return '$0.00';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '$0.00';
  }

  return currencyFormatter.format(number);
};

const formatDateTime = (value) => {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

const state = {
  orders: [],
  currentOrderId: null,
  currentOrderDetail: null,
  orderRequestToken: 0,
};

const clearFormMessage = () => {
  if (!formMessage) {
    return;
  }

  formMessage.textContent = '';
  formMessage.className = 'text-sm text-gray-600';
};

const showFormMessage = (message, variant = 'info') => {
  if (!formMessage) {
    return;
  }

  const variants = {
    info: 'text-sm text-gray-600',
    success: 'text-sm font-medium text-emerald-600',
    error: 'text-sm font-medium text-red-600',
    warning: 'text-sm font-medium text-amber-600',
  };

  formMessage.textContent = message;
  formMessage.className = variants[variant] ?? variants.info;
};

const populateOrders = (orders = []) => {
  state.orders = orders;

  if (!orderSelect) {
    return;
  }

  orderSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona una orden de compra';
  orderSelect.appendChild(placeholder);

  for (const order of orders) {
    const option = document.createElement('option');
    const identifier =
      order?.folio ??
      order?.numero_orden ??
      order?.numero ??
      order?.codigo ??
      order?.id ??
      order?.orden_id ??
      '';

    option.value = order?.id ?? order?.orden_id ?? identifier;

    const status = order?.estado ?? order?.status ?? 'Registrada';
    const supplierName =
      order?.proveedor?.nombre_comercial ??
      order?.proveedor?.razon_social ??
      order?.proveedor?.display_name ??
      order?.proveedor?.nombre ??
      order?.proveedor_nombre ??
      order?.supplier_name ??
      '';

    option.textContent = supplierName
      ? `${identifier} · ${supplierName} · ${status}`
      : `${identifier} · ${status}`;

    orderSelect.appendChild(option);
  }
};

const updateSummary = (detail) => {
  const total = detail?.pagos?.saldo_pendiente !== undefined
    ? (detail?.pagos?.saldo_pendiente ?? 0) + (detail?.pagos?.total_pagado ?? 0)
    : detail?.orden?.total ?? detail?.orden?.monto_total ?? detail?.orden?.gran_total ?? detail?.orden?.importe_total ?? 0;
  const paid = detail?.pagos?.total_pagado ?? 0;
  const remaining = detail?.pagos?.saldo_pendiente ?? Math.max(0, total - paid);

  if (summaryTotal) {
    summaryTotal.textContent = formatCurrency(total);
  }

  if (summaryPaid) {
    summaryPaid.textContent = formatCurrency(paid);
  }

  if (summaryRemaining) {
    summaryRemaining.textContent = `Pendiente: ${formatCurrency(remaining)}`;
  }

  if (summaryStatus) {
    if (remaining <= 0.01) {
      summaryStatus.textContent = 'Orden liquidada. No hay pagos pendientes.';
      summaryStatus.className = 'px-4 py-3 text-sm font-medium text-emerald-600';
    } else if (paid > 0) {
      summaryStatus.textContent = 'Pago parcial registrado. Aún existe saldo por cubrir.';
      summaryStatus.className = 'px-4 py-3 text-sm font-medium text-amber-600';
    } else {
      summaryStatus.textContent = 'Pendiente de pago.';
      summaryStatus.className = 'px-4 py-3 text-sm text-gray-600';
    }
  }

  if (amountInput) {
    amountInput.max = remaining > 0 ? String(remaining) : '';
    amountInput.placeholder = remaining > 0 ? formatCurrency(remaining) : '$0.00';
  }

  if (submitButton) {
    const disabled = remaining <= 0.01;
    submitButton.disabled = disabled;
    submitButton.classList.toggle('opacity-60', disabled);
    submitButton.classList.toggle('cursor-not-allowed', disabled);
  }
};

const updateOrderHelper = (detail) => {
  if (!orderHelp) {
    return;
  }

  const order = detail?.orden ?? {};
  const supplierName =
    order?.proveedor?.nombre_comercial ??
    order?.proveedor?.razon_social ??
    order?.proveedor?.display_name ??
    order?.proveedor?.nombre ??
    order?.proveedor_nombre ??
    order?.supplier_name ??
    '';
  const status = order?.estado ?? order?.status ?? 'Registrada';

  const delivery = order?.fecha_recepcion ?? order?.fecha_entrega_estimada ?? order?.fecha ?? null;

  const total =
    order?.total ?? order?.monto_total ?? order?.gran_total ?? order?.total_orden ?? order?.importe_total ?? 0;

  orderHelp.textContent = supplierName
    ? `${status} · Proveedor: ${supplierName} · Total: ${formatCurrency(total)}${
        delivery ? ` · Recepción: ${formatDateTime(delivery)}` : ''
      }`
    : `${status} · Total: ${formatCurrency(total)}`;
};

const renderPaymentHistory = (detail) => {
  if (!historyTable) {
    return;
  }

  historyTable.innerHTML = '';

  const payments = Array.isArray(detail?.pagos_registrados) ? detail.pagos_registrados : [];

  if (!payments.length) {
    setHidden(historyEmpty, false);
    return;
  }

  setHidden(historyEmpty, true);

  for (const payment of payments) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="px-4 py-3 text-sm text-gray-600">${formatDateTime(
        payment?.fecha_pago ?? payment?.fecha ?? payment?.creado_en
      )}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${formatCurrency(
        payment?.monto_pagado ?? payment?.monto ?? payment?.amount
      )}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${payment?.metodo_pago ?? payment?.metodo ?? '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${payment?.referencia ?? payment?.referencia_pago ?? '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${payment?.registrado_por ?? payment?.creado_por_nombre ?? '—'}</td>
    `;

    historyTable.appendChild(row);
  }
};

const handleOrderChange = async () => {
  const selectedId = orderSelect?.value ?? '';

  if (!selectedId) {
    state.currentOrderId = null;
    state.currentOrderDetail = null;
    updateSummary({});
    updateOrderHelper({});
    historyTable.innerHTML = '';
    setHidden(historyEmpty, false);
    clearFormMessage();
    return;
  }

  const token = ++state.orderRequestToken;
  clearFormMessage();
  showFormMessage('Cargando información de la orden…', 'info');
  setHidden(historyLoading, false);
  setHidden(historyError, true);
  setHidden(historyEmpty, true);

  try {
    const response = await fetch(buildUrl(`/api/ordenes-compra/${selectedId}`));

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.message || 'No fue posible obtener la orden seleccionada.');
    }

    if (token !== state.orderRequestToken) {
      return;
    }

    const detail = await response.json();
    state.currentOrderId = selectedId;
    state.currentOrderDetail = detail;

    updateSummary(detail);
    updateOrderHelper(detail);
    renderPaymentHistory(detail);
    clearFormMessage();
  } catch (error) {
    console.error('Purchase order payment detail error:', error);
    showFormMessage(error.message || 'Ocurrió un error al cargar la orden.', 'error');
    historyTable.innerHTML = '';
    setHidden(historyEmpty, false);
  } finally {
    setHidden(historyLoading, true);
  }
};

orderSelect?.addEventListener('change', handleOrderChange);

const fetchOrders = async () => {
  try {
    const response = await fetch(buildUrl('/api/ordenes-compra'));

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.message || 'No fue posible obtener las órdenes de compra.');
    }

    const result = await response.json();
    const orders = Array.isArray(result?.ordenes) ? result.ordenes : Array.isArray(result) ? result : [];

    populateOrders(orders);

    const firstPayable = orders.find((order) => {
      const status = (order?.estado ?? order?.status ?? '').toLowerCase();
      return status !== 'finalizada';
    });

    if (firstPayable && orderSelect && !orderSelect.value) {
      orderSelect.value = firstPayable.id ?? firstPayable.orden_id ?? '';
      if (orderSelect.value) {
        handleOrderChange();
      }
    }
  } catch (error) {
    console.error('Purchase orders fetch error:', error);
    populateOrders([]);
    showFormMessage('No fue posible cargar las órdenes disponibles.', 'error');
  }
};

const refreshPaymentHistory = () => {
  if (!state.currentOrderId) {
    return;
  }

  handleOrderChange();
};

historyRefreshButton?.addEventListener('click', refreshPaymentHistory);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!state.currentOrderId) {
    showFormMessage('Selecciona una orden de compra.', 'warning');
    return;
  }

  const amount = Number(amountInput?.value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    showFormMessage('Ingresa un monto de pago válido.', 'warning');
    return;
  }

  const remaining = state.currentOrderDetail?.pagos?.saldo_pendiente ?? 0;

  if (remaining > 0 && amount - remaining > 0.01) {
    showFormMessage('El monto excede el saldo pendiente de la orden.', 'warning');
    return;
  }

  showFormMessage('Registrando pago…', 'info');
  submitButton.disabled = true;

  const payload = {
    monto_pago: amount,
    fecha_pago: dateInput?.value ?? undefined,
    metodo_pago: methodInput?.value ?? undefined,
    referencia: referenceInput?.value ?? undefined,
    notas: notesInput?.value ?? undefined,
  };

  try {
    const response = await fetch(buildUrl(`/api/ordenes-compra/${state.currentOrderId}/procesar_pago`), {
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

    showFormMessage('Pago registrado correctamente.', 'success');
    if (amountInput) {
      amountInput.value = '';
    }

    if (methodInput) {
      methodInput.value = '';
    }

    if (referenceInput) {
      referenceInput.value = '';
    }

    if (notesInput) {
      notesInput.value = '';
    }

    await fetchOrders();
    await handleOrderChange();
  } catch (error) {
    console.error('Purchase order payment creation error:', error);
    showFormMessage(error.message || 'No se pudo registrar el pago.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});

const initialize = async () => {
  clearFormMessage();
  await fetchOrders();
};

initialize();
