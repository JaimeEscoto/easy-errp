import { requireSession, getDisplayName } from './session.js';

const session = requireSession();

if (!session) {
  throw new Error('Se requiere una sesión activa para cargar el dashboard.');
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

const feedbackElement = document.querySelector('[data-dashboard-feedback]');
const incomeTotalElement = document.querySelector('[data-dashboard-income-total]');
const incomeDeltaElement = document.querySelector('[data-dashboard-income-delta]');
const expenseTotalElement = document.querySelector('[data-dashboard-expense-total]');
const expenseDeltaElement = document.querySelector('[data-dashboard-expense-delta]');
const articlesTotalElement = document.querySelector('[data-dashboard-articles-total]');
const articlesBreakdownElement = document.querySelector('[data-dashboard-articles-breakdown]');
const activitiesTableBody = document.querySelector('[data-dashboard-activities]');
const activitiesEmptyRow = document.querySelector('[data-dashboard-activities-empty]');

const setText = (element, value) => {
  if (!element) {
    return;
  }

  element.textContent = value;
};

const toggleHidden = (element, hidden) => {
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', hidden);
};

const formatCurrency = (value, currency = 'USD') => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  try {
    const numberFormatter = new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return numberFormatter.format(Number(value));
  } catch (_error) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return `${numeric.toFixed(2)} ${currency}`;
    }

    return '—';
  }
};

const formatPercentageComparison = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'Sin datos comparativos';
  }

  const numeric = Number(value);
  const rounded = Math.round((numeric + Number.EPSILON) * 10) / 10;
  const sign = numeric > 0 ? '+' : '';

  return `${sign}${rounded.toFixed(1)}% vs. mes anterior`;
};

const formatArticlesBreakdown = (activos, inactivos) => {
  if (
    [activos, inactivos].every(
      (value) => value === null || value === undefined || Number.isNaN(Number(value))
    )
  ) {
    return 'Activos: — · Inactivos: —';
  }

  const activeValue = Number.isFinite(Number(activos)) ? Number(activos) : '—';
  const inactiveValue = Number.isFinite(Number(inactivos)) ? Number(inactivos) : '—';

  return `Activos: ${activeValue} · Inactivos: ${inactiveValue}`;
};

const formatActivityDate = (value) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatActivityUser = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '—';
  }

  return String(value);
};

const clearActivities = () => {
  if (!activitiesTableBody) {
    return;
  }

  activitiesTableBody.querySelectorAll('tr').forEach((row) => {
    if (row.dataset.dashboardActivitiesEmpty !== undefined) {
      return;
    }

    row.remove();
  });
};

const appendActivityRow = (activity) => {
  if (!activitiesTableBody) {
    return;
  }

  const row = document.createElement('tr');
  row.className = 'hover:bg-gray-50';

  const cells = [
    { value: formatActivityDate(activity?.fecha), className: 'px-3 py-2 text-gray-700' },
    { value: formatActivityUser(activity?.usuario), className: 'px-3 py-2' },
    { value: activity?.modulo ?? '—', className: 'px-3 py-2' },
    { value: activity?.accion ?? '—', className: 'px-3 py-2' },
    { value: activity?.detalle ?? '—', className: 'px-3 py-2 text-blue-700' },
  ];

  cells.forEach((cell) => {
    const cellElement = document.createElement('td');
    cellElement.className = cell.className;
    cellElement.textContent = cell.value;
    row.appendChild(cellElement);
  });

  activitiesTableBody.appendChild(row);
};

const showError = (message) => {
  if (!feedbackElement) {
    return;
  }

  setText(feedbackElement, message);
  toggleHidden(feedbackElement, false);
};

const hideError = () => {
  if (!feedbackElement) {
    return;
  }

  toggleHidden(feedbackElement, true);
  setText(feedbackElement, '');
};

const requestDashboardData = async () => {
  const headers = new Headers();

  if (currentAdminId !== null && currentAdminId !== undefined) {
    headers.set('x-admin-id', currentAdminId);
    headers.set('x-actor-id', currentAdminId);
  }

  if (currentAdminName) {
    headers.set('x-admin-name', currentAdminName);
    headers.set('x-actor-name', currentAdminName);
  }

  const response = await fetch(buildUrl('/api/dashboard/resumen'), {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    let payload = null;

    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch (_err) {
        payload = null;
      }
    } else {
      try {
        payload = await response.text();
      } catch (_err) {
        payload = null;
      }
    }

    const errorMessage =
      payload?.message ??
      (typeof payload === 'string' && payload.trim() ? payload : null) ??
      'No fue posible cargar los datos del dashboard.';

    const error = new Error(errorMessage);
    error.response = response;
    error.data = payload;
    throw error;
  }

  return response.json();
};

const applyDashboardData = (data) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  const currency = data.currency || 'USD';
  const ingresos = data.resumen?.ingresos ?? {};
  const gastos = data.resumen?.gastos ?? {};
  const articulos = data.resumen?.articulos ?? {};
  const actividades = Array.isArray(data.actividades) ? data.actividades : [];

  setText(incomeTotalElement, formatCurrency(ingresos.total, currency));
  setText(incomeDeltaElement, formatPercentageComparison(ingresos.variacionPorcentaje));

  setText(expenseTotalElement, formatCurrency(gastos.total, currency));
  setText(expenseDeltaElement, formatPercentageComparison(gastos.variacionPorcentaje));

  setText(articlesTotalElement, Number.isFinite(Number(articulos.total)) ? Number(articulos.total) : '—');
  setText(
    articlesBreakdownElement,
    formatArticlesBreakdown(articulos.activos, articulos.inactivos)
  );

  clearActivities();

  if (!actividades.length) {
    toggleHidden(activitiesEmptyRow, false);
    return;
  }

  toggleHidden(activitiesEmptyRow, true);

  actividades.forEach((activity) => {
    appendActivityRow(activity);
  });
};

const initializeDashboard = async () => {
  try {
    hideError();
    const data = await requestDashboardData();
    applyDashboardData(data);
  } catch (error) {
    console.error('Dashboard load error:', error);
    showError(error.message || 'No fue posible cargar los datos del dashboard.');
  }
};

initializeDashboard();
