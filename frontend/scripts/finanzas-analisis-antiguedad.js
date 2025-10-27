import { requireSession } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para consultar el reporte de antigüedad de saldos.');
}

const backendBaseUrl = window.APP_CONFIG?.backendUrl ?? '';

const buildUrl = (path, params) => {
  const normalizedBase = backendBaseUrl ? backendBaseUrl.replace(/\/$/, '') : '';
  const url = new URL(`${normalizedBase}${path}`.replace(/\/\/(api\//)/, '/$1'), window.location.origin);

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  return backendBaseUrl ? url.toString() : `${path}${url.search}`;
};

const cutoffDateInput = document.getElementById('cutoff-date');
const searchInput = document.getElementById('search-client');
const refreshButton = document.getElementById('refresh-aging');
const exportButtons = document.querySelectorAll('[data-export-csv]');
const totalPendingElement = document.getElementById('report-total-pending');
const totalClientsElement = document.getElementById('report-total-clients');
const overdueTotalElement = document.getElementById('report-overdue-total');
const lastUpdatedElement = document.getElementById('report-last-updated');
const cutoffLabelElement = document.getElementById('report-cutoff');
const loadingIndicator = document.getElementById('report-loading');
const errorBanner = document.getElementById('report-error');
const emptyState = document.getElementById('report-empty');
const tableBody = document.getElementById('report-table-body');

let currentReport = {
  currency: 'USD',
  generatedAt: null,
  fechaCorte: null,
  totalPendiente: 0,
  resumen: { totalClientes: 0, saldoVencido: 0, saldoNoVencido: 0 },
  clientes: [],
};

let currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: currentReport.currency,
  minimumFractionDigits: 2,
});

const formatCurrency = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—';
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  return currencyFormatter.format(numeric);
};

const formatDateTime = (value, options = { dateStyle: 'medium', timeStyle: 'short' }) => {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('es-MX', options);
};

const setLoading = (isLoading) => {
  if (isLoading) {
    loadingIndicator?.classList.remove('hidden');
    errorBanner?.classList.add('hidden');
  } else {
    loadingIndicator?.classList.add('hidden');
  }
};

const showError = (message) => {
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }
};

const applySearchFilter = (clients = []) => {
  const term = searchInput?.value?.trim().toLowerCase() ?? '';

  if (!term) {
    return [...clients];
  }

  return clients.filter((client) => {
    const haystack = `${client.nombre ?? ''} ${client.identificador ?? ''}`.toLowerCase();
    return haystack.includes(term);
  });
};

const renderSummary = (report) => {
  currencyFormatter = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: report.currency ?? 'USD',
    minimumFractionDigits: 2,
  });

  totalPendingElement.textContent = formatCurrency(report.totalPendiente);
  totalClientsElement.textContent = report.resumen?.totalClientes ?? 0;
  overdueTotalElement.textContent = formatCurrency(report.resumen?.saldoVencido ?? 0);
  lastUpdatedElement.textContent = formatDateTime(report.generatedAt ?? new Date());
  cutoffLabelElement.textContent = formatDateTime(report.fechaCorte ?? new Date(), {
    dateStyle: 'long',
    timeStyle: undefined,
  });
};

const renderTable = (clients) => {
  tableBody.innerHTML = '';

  if (!clients.length) {
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');

  const fragment = document.createDocumentFragment();

  clients.forEach((client) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.className = 'px-4 py-4 text-sm font-medium text-gray-900';
    nameCell.innerHTML = `
      <div class="flex flex-col">
        <span>${client.nombre ?? 'Cliente sin identificar'}</span>
        <span class="text-xs font-normal text-gray-500">${client.identificador ?? '—'}</span>
      </div>
    `;

    const totalCell = document.createElement('td');
    totalCell.className = 'px-4 py-4 text-right text-sm text-gray-900';
    totalCell.textContent = formatCurrency(client.totalPendiente);

    const bucket030Cell = document.createElement('td');
    bucket030Cell.className = 'px-4 py-4 text-right text-sm text-gray-600';
    bucket030Cell.textContent = formatCurrency(client.bucket0a30);

    const bucket3160Cell = document.createElement('td');
    bucket3160Cell.className = 'px-4 py-4 text-right text-sm text-gray-600';
    bucket3160Cell.textContent = formatCurrency(client.bucket31a60);

    const bucket6190Cell = document.createElement('td');
    bucket6190Cell.className = 'px-4 py-4 text-right text-sm text-gray-600';
    bucket6190Cell.textContent = formatCurrency(client.bucket61a90);

    const bucket90Cell = document.createElement('td');
    bucket90Cell.className = 'px-4 py-4 text-right text-sm text-gray-600';
    bucket90Cell.textContent = formatCurrency(client.bucketMas90);

    const overdueCell = document.createElement('td');
    overdueCell.className = `px-4 py-4 text-right text-sm font-semibold ${
      client.vencido > 0 ? 'text-rose-600' : 'text-emerald-600'
    }`;
    overdueCell.textContent = formatCurrency(client.vencido);

    row.append(
      nameCell,
      totalCell,
      bucket030Cell,
      bucket3160Cell,
      bucket6190Cell,
      bucket90Cell,
      overdueCell
    );

    fragment.append(row);
  });

  tableBody.append(fragment);
};

const updateReport = async () => {
  setLoading(true);

  try {
    const params = {};

    if (cutoffDateInput?.value) {
      params.fechaCorte = cutoffDateInput.value;
    }

    const response = await fetch(buildUrl('/api/finanzas/antiguedad', params));
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.message ?? 'No se pudo obtener el reporte.');
    }

    currentReport = {
      currency: result.currency ?? 'USD',
      generatedAt: result.generatedAt ?? new Date().toISOString(),
      fechaCorte: result.fechaCorte ?? cutoffDateInput?.value ?? new Date().toISOString(),
      totalPendiente: Number(result.totalPendiente) || 0,
      resumen: {
        totalClientes: result.resumen?.totalClientes ?? 0,
        saldoVencido: Number(result.resumen?.saldoVencido) || 0,
        saldoNoVencido: Number(result.resumen?.saldoNoVencido) || 0,
      },
      clientes: Array.isArray(result.clientes) ? result.clientes : [],
    };

    renderSummary(currentReport);
    const filteredClients = applySearchFilter(currentReport.clientes);
    renderTable(filteredClients);
    if ((searchInput?.value ?? '').trim()) {
      handleSearchChange();
    }
  } catch (error) {
    console.error('Aging report error:', error);
    showError(error.message ?? 'No se pudo generar el reporte de antigüedad de saldos.');
  } finally {
    setLoading(false);
  }
};

const exportToCsv = (clients) => {
  if (!clients.length) {
    showError('No hay información para exportar.');
    return;
  }

  const headers = [
    'Cliente',
    'Identificador',
    'Saldo total pendiente',
    '0 - 30 días',
    '31 - 60 días',
    '61 - 90 días',
    '+ 90 días',
    'Saldo vencido',
    'Facturas activas',
    'Máx. días vencidos',
    'Última factura',
    'Fecha emisión última',
    'Fecha vencimiento última',
    'Saldo pendiente última',
  ];

  const rows = clients.map((client) => {
    const lastInvoice = client.ultimaFactura ?? {};

    return [
      client.nombre ?? 'Cliente sin identificar',
      client.identificador ?? '',
      client.totalPendiente ?? 0,
      client.bucket0a30 ?? 0,
      client.bucket31a60 ?? 0,
      client.bucket61a90 ?? 0,
      client.bucketMas90 ?? 0,
      client.vencido ?? 0,
      client.cantidadFacturas ?? 0,
      client.diasVencidosMaximos ?? 0,
      lastInvoice.folio ?? '',
      lastInvoice.fechaEmision ? formatDateTime(lastInvoice.fechaEmision, { dateStyle: 'medium' }) : '',
      lastInvoice.fechaVencimiento ? formatDateTime(lastInvoice.fechaVencimiento, { dateStyle: 'medium' }) : '',
      lastInvoice.saldoPendiente ?? 0,
    ];
  });

  const csvContent = [headers, ...rows]
    .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const today = new Date();
  const formattedDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(
    today.getDate()
  ).padStart(2, '0')}`;

  link.href = url;
  link.download = `analisis-antiguedad-${formattedDate}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const handleSearchChange = () => {
  const filteredClients = applySearchFilter(currentReport.clientes);
  const reportClone = {
    ...currentReport,
    resumen: {
      ...currentReport.resumen,
      totalClientes: filteredClients.length,
      saldoVencido: filteredClients.reduce((acc, client) => acc + (client.vencido ?? 0), 0),
    },
    totalPendiente: filteredClients.reduce((acc, client) => acc + (client.totalPendiente ?? 0), 0),
  };

  reportClone.resumen.saldoNoVencido = Math.max(
    0,
    reportClone.totalPendiente - (reportClone.resumen.saldoVencido ?? 0)
  );

  renderSummary(reportClone);
  renderTable(filteredClients);
};

const initialize = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  if (cutoffDateInput && !cutoffDateInput.value) {
    cutoffDateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  refreshButton?.addEventListener('click', () => {
    updateReport();
  });

  searchInput?.addEventListener('input', () => {
    handleSearchChange();
  });

  exportButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filteredClients = applySearchFilter(currentReport.clientes);
      exportToCsv(filteredClients);
    });
  });

  updateReport();
};

initialize();
