import { requireSession } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere sesión activa para registrar entradas de almacén.');
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

const orderSelect = document.getElementById('entry-order');
const orderHelp = document.getElementById('entry-order-help');
const warehouseSelect = document.getElementById('entry-warehouse');
const entryDateInput = document.getElementById('entry-date');
const notesInput = document.getElementById('entry-notes');
const linesContainer = document.getElementById('entry-lines');
const prefillButton = document.getElementById('prefill-entry-lines');
const submitButton = document.querySelector('#entry-form button[type="submit"]');
const formMessage = document.getElementById('entry-form-message');
const summaryOrdered = document.getElementById('entry-summary-ordered');
const summaryReceived = document.getElementById('entry-summary-received');
const summaryPending = document.getElementById('entry-summary-pending');
const summaryStatus = document.getElementById('entry-summary-status');
const form = document.getElementById('entry-form');

const historyLoading = document.getElementById('entry-history-loading');
const historyError = document.getElementById('entry-history-error');
const historyEmpty = document.getElementById('entry-history-empty');
const historyTable = document.getElementById('entry-history-table');
const historyRefreshButton = document.getElementById('refresh-entry-history');

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

const quantityFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const formatCurrency = (value) => {
  if (value === undefined || value === null) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return currencyFormatter.format(number);
};

const formatQuantity = (value) => {
  if (value === undefined || value === null) {
    return '0';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return quantityFormatter.format(number);
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

const shortenIdentifier = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return '';
  }

  if (stringValue.length <= 12) {
    return stringValue.toUpperCase();
  }

  const prefix = stringValue.slice(0, 4).toUpperCase();
  const suffix = stringValue.slice(-4).toUpperCase();

  return `${prefix}…${suffix}`;
};

const getOrderDisplayIdentifier = (order) => {
  const preferredIdentifier =
    order?.folio ??
    order?.numero_orden ??
    order?.numero ??
    order?.codigo ??
    order?.code ??
    order?.referencia ??
    order?.reference ??
    null;

  if (preferredIdentifier) {
    return String(preferredIdentifier);
  }

  const fallbackIdentifier =
    order?.id ??
    order?.orden_id ??
    order?.order_id ??
    order?.ordenId ??
    order?.orderId ??
    order?.uuid ??
    null;

  if (!fallbackIdentifier) {
    return 'Orden sin folio';
  }

  const shortened = shortenIdentifier(fallbackIdentifier);

  return shortened ? `OC-${shortened}` : 'Orden sin folio';
};

const normalizeOrderDetail = (detail) => {
  if (!detail || typeof detail !== 'object') {
    return {
      order: {},
      lines: [],
      resumen: {},
      entries: [],
      entryLines: [],
      payments: [],
    };
  }

  const order =
    detail.order ??
    detail.orden ??
    detail.purchase_order ??
    detail.orden_compra ??
    {};

  const lines = Array.isArray(detail.lines)
    ? detail.lines
    : Array.isArray(detail.lineas)
    ? detail.lineas
    : Array.isArray(detail.order_lines)
    ? detail.order_lines
    : [];

  const resumen = detail.resumen ?? detail.summary ?? detail.overview ?? {};

  const entries = Array.isArray(detail.entries)
    ? detail.entries
    : Array.isArray(detail.entradas)
    ? detail.entradas
    : [];

  const entryLines = Array.isArray(detail.entryLines)
    ? detail.entryLines
    : Array.isArray(detail.lineas_entrada)
    ? detail.lineas_entrada
    : [];

  const payments = Array.isArray(detail.payments)
    ? detail.payments
    : Array.isArray(detail.pagos)
    ? detail.pagos
    : [];

  return {
    ...detail,
    order,
    orden: order,
    lines,
    lineas: lines,
    resumen,
    summary: resumen,
    entries,
    entradas: entries,
    entryLines,
    lineas_entrada: entryLines,
    payments,
    pagos: payments,
  };
};

const state = {
  warehouses: [],
  orders: [],
  currentOrderId: null,
  currentOrderDetail: null,
  orderRequestToken: 0,
  historyRequestToken: 0,
};

const getWarehouseName = (identifier) => {
  if (identifier === null || identifier === undefined) {
    return '—';
  }

  const normalized = String(identifier);
  const match = state.warehouses.find((warehouse) => String(warehouse?.id ?? warehouse?.almacen_id) === normalized);

  if (!match) {
    return `Almacén ${normalized}`;
  }

  return match?.nombre ?? match?.name ?? `Almacén ${normalized}`;
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

const populateWarehouses = (warehouses = []) => {
  state.warehouses = warehouses;

  if (!warehouseSelect) {
    return;
  }

  warehouseSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona un almacén';
  warehouseSelect.appendChild(placeholder);

  for (const warehouse of warehouses) {
    const option = document.createElement('option');
    option.value = warehouse?.id ?? warehouse?.almacen_id ?? '';
    option.textContent = warehouse?.nombre ?? warehouse?.name ?? `Almacén ${option.value}`;

    const active = warehouse?.activo ?? warehouse?.active ?? warehouse?.estado ?? warehouse?.status ?? true;
    if (typeof active === 'string') {
      option.dataset.estado = active;
    }

    warehouseSelect.appendChild(option);
  }
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
    const identifierValue =
      order?.id ??
      order?.orden_id ??
      order?.order_id ??
      order?.ordenId ??
      order?.orderId ??
      order?.uuid ??
      null;
    const displayIdentifier = getOrderDisplayIdentifier(order);

    option.value = identifierValue ? String(identifierValue) : displayIdentifier;

    const status = order?.estado ?? order?.status ?? 'Registrada';
    const supplierName =
      order?.proveedor?.nombre_comercial ??
      order?.proveedor?.razon_social ??
      order?.proveedor?.display_name ??
      order?.proveedor?.nombre ??
      order?.proveedor?.denominacion ??
      order?.proveedor_nombre ??
      order?.supplier_name ??
      '';

    option.textContent = supplierName
      ? `${displayIdentifier} · ${supplierName} · ${status}`
      : `${displayIdentifier} · ${status}`;
    option.dataset.estado = status;

    orderSelect.appendChild(option);
  }
};

const renderLines = (detail) => {
  if (!linesContainer) {
    return;
  }

  linesContainer.innerHTML = '';

  const lines = Array.isArray(detail?.lines)
    ? detail.lines
    : Array.isArray(detail?.lineas)
    ? detail.lineas
    : [];

  if (!lines.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500">
        Selecciona una orden de compra para visualizar sus artículos.
      </td>
    `;
    linesContainer.appendChild(emptyRow);
    return;
  }

  for (const line of lines) {
    const row = document.createElement('tr');
    row.dataset.articuloId = line?.articulo_id ?? line?.id_articulo ?? line?.articuloId ?? line?.idArticulo ?? '';
    row.dataset.pendiente = line?.cantidad_pendiente ?? 0;
    row.dataset.costoUnitario = line?.precio_unitario ?? line?.precioUnitario ?? line?.costo_unitario ?? 0;

    const description =
      line?.descripcion ??
      line?.detalle ??
      line?.nombre ??
      line?.articulo_nombre ??
      `Artículo ${row.dataset.articuloId || 'sin identificador'}`;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.0001';
    input.value = '0';
    input.className =
      'w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
    input.dataset.role = 'quantity-input';

    const max = Number(line?.cantidad_pendiente ?? 0);

    if (Number.isFinite(max)) {
      input.max = String(max);
    }

    input.addEventListener('blur', () => {
      const pending = Number(row.dataset.pendiente ?? 0);
      const value = Number(input.value ?? 0);

      if (!Number.isFinite(value) || value < 0) {
        input.value = '0';
        return;
      }

      if (pending >= 0 && value > pending) {
        input.value = String(pending);
      }
    });

    row.innerHTML = `
      <td class="px-4 py-3 text-sm font-medium text-gray-900">${description}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${formatQuantity(line?.cantidad_ordenada)}</td>
      <td class="px-4 py-3 text-sm text-amber-600">${formatQuantity(line?.cantidad_pendiente)}</td>
      <td class="px-4 py-3"></td>
      <td class="px-4 py-3 text-sm text-gray-600">${formatCurrency(
        line?.precio_unitario ?? line?.precioUnitario ?? line?.costo_unitario
      )}</td>
    `;

    const cell = row.querySelector('td:nth-child(4)');
    cell?.appendChild(input);

    linesContainer.appendChild(row);
  }
};

const updateSummary = (detail) => {
  const summary = detail?.resumen ?? detail?.summary ?? {};
  const ordered = summary?.total_ordenado ?? 0;
  const received = summary?.total_recibido ?? 0;
  const pending = summary?.total_pendiente ?? 0;

  if (summaryOrdered) {
    summaryOrdered.textContent = formatQuantity(ordered);
  }

  if (summaryReceived) {
    summaryReceived.textContent = formatQuantity(received);
  }

  if (summaryPending) {
    summaryPending.textContent = formatQuantity(pending);
  }

  if (summaryStatus) {
    if (pending <= 0.0001) {
      summaryStatus.textContent = 'Recepción completada.';
      summaryStatus.className = 'font-medium text-emerald-600';
    } else if (received > 0) {
      summaryStatus.textContent = 'Recepción parcial en curso.';
      summaryStatus.className = 'font-medium text-amber-600';
    } else {
      summaryStatus.textContent = 'Pendiente por recibir.';
      summaryStatus.className = 'font-medium text-gray-600';
    }
  }

  const hasPending = pending > 0.0001;

  if (prefillButton) {
    prefillButton.disabled = !hasPending;
    prefillButton.classList.toggle('opacity-60', !hasPending);
  }

  if (submitButton) {
    submitButton.disabled = !hasPending;
    submitButton.classList.toggle('opacity-60', !hasPending);
    submitButton.classList.toggle('cursor-not-allowed', !hasPending);
  }
};

const updateOrderSummaryHelper = (detail) => {
  if (!orderHelp) {
    return;
  }

  const order = detail?.order ?? detail?.orden ?? {};
  const supplierName =
    order?.proveedor?.nombre_comercial ??
    order?.proveedor?.razon_social ??
    order?.proveedor?.display_name ??
    order?.proveedor?.nombre ??
    order?.proveedor_nombre ??
    order?.supplier_name ??
    '';
  const status = order?.estado ?? order?.status ?? 'Registrada';
  const total =
    order?.total ?? order?.monto_total ?? order?.gran_total ?? order?.total_orden ?? order?.importe_total ?? 0;

  orderHelp.textContent = supplierName
    ? `${status} · Proveedor: ${supplierName} · Total: ${formatCurrency(total)}`
    : `${status} · Total: ${formatCurrency(total)}`;
};

const handleOrderChange = async () => {
  const selectedId = orderSelect?.value ?? '';

  if (!selectedId) {
    state.currentOrderId = null;
    state.currentOrderDetail = null;
    linesContainer.innerHTML = '';
    updateSummary(null);
    updateOrderSummaryHelper(null);
    clearFormMessage();
    return;
  }

  const token = ++state.orderRequestToken;

  clearFormMessage();
  showFormMessage('Cargando detalle de la orden…', 'info');

  try {
    const response = await fetch(buildUrl(`/api/ordenes-compra/${selectedId}`));

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.message || 'No fue posible obtener el detalle de la orden.');
    }

    if (token !== state.orderRequestToken) {
      return;
    }

    const detail = await response.json();
    const normalizedDetail = normalizeOrderDetail(detail);
    state.currentOrderId = selectedId;
    state.currentOrderDetail = normalizedDetail;

    renderLines(normalizedDetail);
    updateSummary(normalizedDetail);
    updateOrderSummaryHelper(normalizedDetail);

    if ((normalizedDetail?.resumen?.total_pendiente ?? 0) <= 0) {
      showFormMessage('La orden ya fue recibida en su totalidad.', 'warning');
    } else {
      clearFormMessage();
    }
  } catch (error) {
    console.error('Purchase order detail error:', error);
    showFormMessage(error.message || 'No se pudo cargar el detalle de la orden.', 'error');
    linesContainer.innerHTML = '';
    updateSummary(null);
    updateOrderSummaryHelper(null);
  }
};

orderSelect?.addEventListener('change', handleOrderChange);

const prefillQuantities = () => {
  if (!state.currentOrderDetail) {
    return;
  }

  const rows = linesContainer?.querySelectorAll('tr') ?? [];

  rows.forEach((row) => {
    const pending = Number(row.dataset.pendiente ?? 0);
    const input = row.querySelector('input[data-role="quantity-input"]');

    if (!input) {
      return;
    }

    input.value = pending > 0 ? String(pending) : '0';
  });
};

prefillButton?.addEventListener('click', prefillQuantities);

const fetchWarehouses = async () => {
  try {
    const response = await fetch(buildUrl('/api/almacenes'));

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.message || 'No fue posible obtener los almacenes.');
    }

    const result = await response.json();
    const items = Array.isArray(result?.almacenes) ? result.almacenes : Array.isArray(result) ? result : [];

    populateWarehouses(items);
  } catch (error) {
    console.error('Warehouse fetch error:', error);
    populateWarehouses([]);
    showFormMessage('No fue posible cargar la lista de almacenes.', 'error');
  }
};

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

    const firstPending = orders.find((order) => {
      const status = (order?.estado ?? order?.status ?? '').toLowerCase();
      return status !== 'finalizada';
    });

    if (firstPending && orderSelect && !orderSelect.value) {
      orderSelect.value = firstPending.id ?? firstPending.orden_id ?? '';
      if (orderSelect.value) {
        handleOrderChange();
      }
    }
  } catch (error) {
    console.error('Purchase orders fetch error:', error);
    populateOrders([]);
    showFormMessage('No fue posible cargar la lista de órdenes de compra.', 'error');
  }
};

const fetchEntryHistory = async () => {
  const token = ++state.historyRequestToken;
  setHidden(historyLoading, false);
  setHidden(historyError, true);
  setHidden(historyEmpty, true);

  try {
    const response = await fetch(buildUrl('/api/entradas-almacen'));

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.message || 'No fue posible obtener el historial de entradas.');
    }

    const result = await response.json();

    if (token !== state.historyRequestToken) {
      return;
    }

    const entries = Array.isArray(result?.entradas) ? result.entradas : Array.isArray(result) ? result : [];

    historyTable.innerHTML = '';

    if (!entries.length) {
      setHidden(historyEmpty, false);
      return;
    }

    for (const entry of entries) {
      const row = document.createElement('tr');
      const rawOrderId =
        entry?.orden_compra_id ?? entry?.orden_id ?? entry?.order_id ?? entry?.ordenId ?? entry?.orderId ?? null;
      const orderId = rawOrderId !== null && rawOrderId !== undefined ? String(rawOrderId) : '—';
      const orderNumber =
        entry?.orden_compra_numero ?? entry?.numero_orden ?? entry?.numeroOrden ?? entry?.orden_compra_folio ?? null;
      const warehouseId = entry?.almacen_id ?? entry?.warehouse_id ?? '—';

      row.innerHTML = `
        <td class="px-4 py-3 text-sm text-gray-600">${formatDateTime(
          entry?.fecha_entrada ?? entry?.fecha ?? entry?.creado_en
        )}</td>
        <td class="px-4 py-3 text-sm text-gray-700" data-role="order-display"></td>
        <td class="px-4 py-3 text-sm text-gray-700">${getWarehouseName(warehouseId)}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${formatQuantity(entry?.total_lineas ?? 0)}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${formatQuantity(entry?.total_cantidad ?? 0)}</td>
      `;

      const orderCell = row.querySelector('[data-role="order-display"]');

      if (orderCell) {
        const displayValue = orderNumber ? String(orderNumber) : orderId;
        orderCell.textContent = displayValue;

        if (orderNumber && orderId && orderId !== '—' && orderNumber !== orderId) {
          orderCell.title = `ID interno: ${orderId}`;
        }
      }

      historyTable.appendChild(row);
    }
  } catch (error) {
    console.error('Warehouse entry history error:', error);
    historyError.textContent = error.message || 'Ocurrió un error al cargar el historial de entradas.';
    setHidden(historyError, false);
  } finally {
    setHidden(historyLoading, true);
  }
};

historyRefreshButton?.addEventListener('click', fetchEntryHistory);

const buildLinePayloads = () => {
  const rows = linesContainer?.querySelectorAll('tr') ?? [];
  const linePayloads = [];

  rows.forEach((row) => {
    const articuloId = row.dataset.articuloId ?? '';
    const input = row.querySelector('input[data-role="quantity-input"]');

    if (!input) {
      return;
    }

    const quantity = Number(input.value ?? 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    linePayloads.push({
      articulo_id: articuloId,
      cantidad: quantity,
      costo_unitario: Number(row.dataset.costoUnitario ?? 0),
    });
  });

  return linePayloads;
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!state.currentOrderId) {
    showFormMessage('Selecciona una orden de compra para continuar.', 'warning');
    return;
  }

  const warehouseId = warehouseSelect?.value ?? '';

  if (!warehouseId) {
    showFormMessage('Selecciona el almacén de destino.', 'warning');
    return;
  }

  const linePayloads = buildLinePayloads();

  if (!linePayloads.length) {
    showFormMessage('Indica al menos una cantidad a recibir.', 'warning');
    return;
  }

  showFormMessage('Registrando entrada de almacén…', 'info');
  submitButton.disabled = true;

  const payload = {
    orden_id: state.currentOrderId,
    almacen_id: warehouseId,
    fecha_entrada: entryDateInput?.value ?? undefined,
    notas: notesInput?.value ?? undefined,
    lineas: linePayloads,
  };

  try {
    const response = await fetch(buildUrl('/api/entradas-almacen'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result?.message || 'No fue posible registrar la entrada de almacén.');
    }

    showFormMessage('Entrada registrada correctamente.', 'success');
    if (notesInput) {
      notesInput.value = '';
    }

    if (entryDateInput) {
      entryDateInput.value = '';
    }

    const detail = result;

    if (detail?.orden?.id) {
      state.currentOrderId = detail.orden.id;
    }

    await fetchOrders();
    await handleOrderChange();
    await fetchEntryHistory();
  } catch (error) {
    console.error('Warehouse entry creation error:', error);
    showFormMessage(error.message || 'No se pudo registrar la entrada de almacén.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});

const initialize = async () => {
  clearFormMessage();
  await Promise.all([fetchWarehouses(), fetchOrders(), fetchEntryHistory()]);
};

initialize();
