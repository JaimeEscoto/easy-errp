import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length) {
  console.warn(
    `Warning: Missing required environment variables: ${missingEnvVars.join(', ')}. ` +
      'API routes will fail until these are configured.'
  );
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const ARTICULOS_TABLE = 'articulos';
const ARTICULOS_LOG_TABLE_CANDIDATES = ['articulos_log', 'articulos_logs'];
const FACTURAS_VENTA_TABLE = 'facturas_venta';
const LINEAS_FACTURA_TABLE = 'lineas_factura';
const TERCEROS_TABLE = 'terceros';
const TERCEROS_LOG_TABLE_CANDIDATES = [
  'terceros_log',
  'terceros_logs',
  'terceros_historial',
  'terceros_history',
];

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', 't', '1', 'si', 'sí', 'active', 'activo', 'habilitado'].includes(normalized)) {
      return true;
    }

    if (['false', 'f', '0', 'no', 'inactive', 'inactivo', 'deshabilitado'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const normalizeActorId = (value) => {
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

  return String(value);
};

const normalizeActorName = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    return trimmed;
  }

  return String(value);
};

const extractActorId = (req, payload = {}) => {
  const headerCandidates = ['x-admin-id', 'x-user-id', 'x-actor-id'];

  for (const header of headerCandidates) {
    const value = req.headers?.[header];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorId(value);
    }
  }

  const bodyCandidates = ['modificado_por', 'creado_por', 'admin_id', 'user_id'];

  for (const key of bodyCandidates) {
    const value = payload?.[key] ?? req.body?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorId(value);
    }
  }

  return null;
};

const extractActorName = (req, payload = {}) => {
  const headerCandidates = ['x-admin-name', 'x-user-name', 'x-actor-name', 'x-admin-display-name'];

  for (const header of headerCandidates) {
    const value = req.headers?.[header];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorName(value);
    }
  }

  const bodyCandidates = [
    'modificado_por_nombre',
    'modificado_por_label',
    'creado_por_nombre',
    'actor_name',
    'actor_label',
    'admin_name',
    'user_name',
  ];

  for (const key of bodyCandidates) {
    const value = payload?.[key] ?? req.body?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorName(value);
    }
  }

  return null;
};

const TRACKED_FIELDS = [
  'codigo',
  'nombre',
  'descripcion',
  'precio',
  'existencia',
  'unidad',
  'activo',
  'creado_por',
  'modificado_por',
];

const TERCEROS_TRACKED_FIELDS = [
  'identificacion_fiscal',
  'nombre_comercial',
  'razon_social',
  'correo_principal',
  'telefono_principal',
  'tipo_relacion',
  'relacion',
  'es_cliente',
  'es_proveedor',
  'activo',
  'estado',
  'notas',
  'notas_internas',
  'creado_por',
  'modificado_por',
];

const computeArticuloChanges = (previousData = {}, newData = {}) => {
  const relevantKeys = new Set([
    ...TRACKED_FIELDS,
    ...Object.keys(previousData ?? {}),
    ...Object.keys(newData ?? {}),
  ]);

  const changes = {};

  for (const key of relevantKeys) {
    if (!TRACKED_FIELDS.includes(key)) {
      continue;
    }

    const previousValue = previousData?.[key];
    const newValue = newData?.[key];

    const normalizedPrevious = previousValue === undefined ? null : previousValue;
    const normalizedNew = newValue === undefined ? null : newValue;

    if (JSON.stringify(normalizedPrevious) !== JSON.stringify(normalizedNew)) {
      changes[key] = {
        before: normalizedPrevious,
        after: normalizedNew,
      };
    }
  }

  return changes;
};

const computeTerceroChanges = (previousData = {}, newData = {}) => {
  const relevantKeys = new Set([
    ...TERCEROS_TRACKED_FIELDS,
    ...Object.keys(previousData ?? {}),
    ...Object.keys(newData ?? {}),
  ]);

  const changes = {};

  for (const key of relevantKeys) {
    if (!TERCEROS_TRACKED_FIELDS.includes(key)) {
      continue;
    }

    const previousValue = previousData?.[key];
    const newValue = newData?.[key];

    const normalizedPrevious = previousValue === undefined ? null : previousValue;
    const normalizedNew = newValue === undefined ? null : newValue;

    if (JSON.stringify(normalizedPrevious) !== JSON.stringify(normalizedNew)) {
      changes[key] = {
        before: normalizedPrevious,
        after: normalizedNew,
      };
    }
  }

  return changes;
};

const normalizeRelationType = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (
    [
      'cliente proveedor',
      'cliente y proveedor',
      'cliente proveedor',
      'cliente · proveedor',
      'cliente proveedor',
      'ambos',
      'both',
    ].includes(normalized)
  ) {
    return 'ambos';
  }

  if (['cliente', 'client'].includes(normalized)) {
    return 'cliente';
  }

  if (['proveedor', 'supplier'].includes(normalized)) {
    return 'proveedor';
  }

  return normalized || null;
};

const sanitizeThirdPartyPayloadForInsert = (input = {}) => {
  const payload = {};

  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      payload[key] = trimmed.length ? trimmed : null;
      return;
    }

    payload[key] = value;
  });

  if (!payload.identificacion_fiscal) {
    payload.identificacion_fiscal = payload.nit ?? payload.numero_identificacion ?? null;
  }

  if (!payload.nombre_comercial) {
    payload.nombre_comercial = payload.nombre ?? payload.razon_social ?? null;
  }

  const relation = normalizeRelationType(payload.tipo_relacion ?? payload.relacion);
  let isClient = normalizeBoolean(payload.es_cliente);
  let isSupplier = normalizeBoolean(payload.es_proveedor);

  if (relation === 'cliente') {
    isClient = true;
    isSupplier = false;
  } else if (relation === 'proveedor') {
    isClient = false;
    isSupplier = true;
  } else if (relation === 'ambos') {
    isClient = true;
    isSupplier = true;
  }

  if (isClient === null) {
    isClient = relation === 'cliente' || relation === 'ambos';
  }

  if (isSupplier === null) {
    isSupplier = relation === 'proveedor' || relation === 'ambos';
  }

  if (relation) {
    payload.tipo_relacion = relation;
    payload.relacion = relation;
  }

  payload.es_cliente = isClient ?? false;
  payload.es_proveedor = isSupplier ?? false;

  const activoNormalized = normalizeBoolean(payload.activo);

  if (activoNormalized !== null) {
    payload.activo = activoNormalized;
  }

  if (!payload.estado) {
    payload.estado = activoNormalized === false ? 'inactivo' : 'activo';
  } else if (typeof payload.estado === 'string') {
    const estadoNormalized = payload.estado.trim().toLowerCase();
    if (['inactivo', 'inactive', 'inactiva', 'deshabilitado'].includes(estadoNormalized)) {
      payload.estado = 'inactivo';
    } else {
      payload.estado = 'activo';
    }
  }

  return payload;
};

const sanitizeThirdPartyPayloadForUpdate = (input = {}) => {
  const payload = sanitizeThirdPartyPayloadForInsert(input);

  delete payload.id;
  delete payload.tercero_id;
  delete payload.terceroId;
  delete payload.creado_por;
  delete payload.creado_por_nombre;
  delete payload.creado_en;

  return payload;
};

const findThirdPartyByIdentifier = async (identifier) => {
  if (identifier === undefined || identifier === null || identifier === '') {
    return { data: null, column: null, value: null };
  }

  const rawIdentifier = typeof identifier === 'string' ? identifier.trim() : identifier;

  const candidates = [
    { column: 'id', transform: (value) => {
      if (typeof value === 'number') {
        return value;
      }
      const asNumber = Number(value);
      return Number.isNaN(asNumber) ? null : asNumber;
    } },
    { column: 'tercero_id', transform: (value) => {
      if (typeof value === 'number') {
        return value;
      }
      const asNumber = Number(value);
      return Number.isNaN(asNumber) ? null : asNumber;
    } },
    { column: 'identificacion_fiscal' },
    { column: 'identificacion' },
    { column: 'nit' },
    { column: 'numero_identificacion' },
  ];

  for (const candidate of candidates) {
    const value = candidate.transform ? candidate.transform(rawIdentifier) : rawIdentifier;

    if (value === null || value === undefined || value === '') {
      continue;
    }

    const { data, error } = await supabaseClient
      .from(TERCEROS_TABLE)
      .select('*')
      .eq(candidate.column, value)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST302') {
        continue;
      }

      return { data: null, column: null, value: null, error };
    }

    if (data) {
      return { data, column: candidate.column, value };
    }
  }

  return { data: null, column: null, value: null };
};

const formatActorLabel = (actorId, actorName) => {
  const normalizedId = actorId === undefined || actorId === null ? '' : String(actorId).trim();
  const normalizedName = normalizeActorName(actorName) ?? '';

  if (normalizedName && normalizedId && normalizedName.toLowerCase() !== normalizedId.toLowerCase()) {
    return `${normalizedName} (${normalizedId})`;
  }

  if (normalizedName) {
    return normalizedName;
  }

  if (normalizedId) {
    return normalizedId;
  }

  return null;
};

const recordTerceroLog = async ({
  terceroId,
  action,
  actorId = null,
  actorName = null,
  previousData = null,
  newData = null,
  changes = null,
}) => {
  if (!supabaseClient) {
    return;
  }

  const sanitizedChanges = changes && Object.keys(changes).length ? changes : null;

  const payload = {
    tercero_id: terceroId ?? null,
    accion: action,
    realizado_por: formatActorLabel(actorId, actorName),
    datos_previos: previousData,
    datos_nuevos: newData,
    cambios: sanitizedChanges,
  };

  const cleanedPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  for (const table of TERCEROS_LOG_TABLE_CANDIDATES) {
    const { error } = await supabaseClient.from(table).insert([cleanedPayload]);

    if (!error) {
      return;
    }

    if (error?.code !== '42P01') {
      console.error(`Record tercero log error on table ${table}:`, error);
      return;
    }
  }

  console.error('Record tercero log error: none of the expected third-party log tables are available.');
};

const recordArticuloLog = async ({
  articuloId,
  action,
  actorId = null,
  actorName = null,
  previousData = null,
  newData = null,
  changes = null,
}) => {
  if (!supabaseClient) {
    return;
  }

  const sanitizedChanges = changes && Object.keys(changes).length ? changes : null;

  const payload = {
    articulo_id: articuloId ?? null,
    accion: action,
    realizado_por: formatActorLabel(actorId, actorName),
    datos_previos: previousData,
    datos_nuevos: newData,
    cambios: sanitizedChanges,
  };

  const cleanedPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  for (const table of ARTICULOS_LOG_TABLE_CANDIDATES) {
    const { error } = await supabaseClient.from(table).insert([cleanedPayload]);

    if (!error) {
      return;
    }

    if (error?.code !== '42P01') {
      console.error(`Record articulo log error on table ${table}:`, error);
      return;
    }
  }

  console.error('Record articulo log error: none of the expected log tables are available.');
};

const normalizeIdentifier = (value) => {
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

const interpretThirdPartyActiveState = (thirdParty = {}) => {
  const activeCandidates = [
    thirdParty.activo,
    thirdParty.active,
    thirdParty.is_active,
    thirdParty.habilitado,
    thirdParty.enabled,
    thirdParty.estado,
    thirdParty.status,
  ];

  for (const candidate of activeCandidates) {
    const normalized = normalizeBoolean(candidate);

    if (normalized !== null) {
      return normalized;
    }

    if (typeof candidate === 'string') {
      const lowered = candidate.trim().toLowerCase();

      if (['activo', 'activa', 'active', 'habilitado'].includes(lowered)) {
        return true;
      }

      if (['inactivo', 'inactiva', 'inactive', 'deshabilitado', 'deshabilitada'].includes(lowered)) {
        return false;
      }
    }
  }

  return true;
};

const getThirdPartyDisplayName = (thirdParty = {}) => {
  const candidates = [
    thirdParty.nombre_comercial,
    thirdParty.razon_social,
    thirdParty.nombre,
    thirdParty.denominacion,
    thirdParty.display_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (thirdParty.identificacion_fiscal) {
    return String(thirdParty.identificacion_fiscal);
  }

  if (thirdParty.id !== undefined && thirdParty.id !== null) {
    return `Cliente ${thirdParty.id}`;
  }

  return 'Cliente sin nombre';
};

const getArticleDisplayName = (article = {}) => {
  const candidates = [article.nombre, article.descripcion_corta, article.descripcion, article.codigo];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (article.id !== undefined && article.id !== null) {
    return `Artículo ${article.id}`;
  }

  return 'Artículo sin nombre';
};

const toNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');

    if (!normalized) {
      return fallback;
    }

    const parsed = Number(normalized);

    return Number.isNaN(parsed) ? fallback : parsed;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return fallback;
};

const roundCurrency = (value) => {
  const normalized = toNumber(value, 0);
  return Math.round((normalized + Number.EPSILON) * 100) / 100;
};

const parseDateToIso = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const dateFromValue = new Date(trimmed);

    if (!Number.isNaN(dateFromValue.getTime())) {
      return dateFromValue.toISOString();
    }

    const parts = trimmed.split('-');

    if (parts.length === 3) {
      const [year, month, day] = parts.map((part) => Number(part));

      if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
        const isoDate = new Date(Date.UTC(year, month - 1, day));

        if (!Number.isNaN(isoDate.getTime())) {
          return isoDate.toISOString();
        }
      }
    }
  }

  return null;
};

const calculateInvoiceTotals = (lines = []) => {
  return lines.reduce(
    (acc, line) => {
      const subtotal = roundCurrency(line.subtotal ?? line.cantidad * line.precioUnitario);
      const taxes = roundCurrency(line.impuestos ?? 0);
      const total = roundCurrency(line.total ?? subtotal + taxes);

      return {
        subtotal: roundCurrency(acc.subtotal + subtotal),
        taxes: roundCurrency(acc.taxes + taxes),
        total: roundCurrency(acc.total + total),
      };
    },
    { subtotal: 0, taxes: 0, total: 0 }
  );
};

const logSupabaseMisconfiguration = () => {
  const missingList = missingEnvVars.length ? missingEnvVars.join(', ') : 'unknown';
  console.error(
    `[Supabase] Client is not configured. Missing environment variables: ${missingList}. ` +
      'Requests depending on Supabase will fail until the variables are provided.'
  );
};

const formatUnexpectedErrorResponse = (message, error) => {
  const payload = { message };

  if (error) {
    if (error.message) {
      payload.details = error.message;
    }

    if (error.code) {
      payload.code = error.code;
    }

    if (error.hint) {
      payload.hint = error.hint;
    }
  }

  return payload;
};

const isMissingJsonbObjectLengthError = (error) => {
  if (!error) {
    return false;
  }

  if (error.code !== '42883') {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return message.includes('jsonb_object_length');
};

const applyArticuloUpdateWithFallback = async ({ id, values, existingData, selectColumns = '*' }) => {
  const createUpdateQuery = (options) =>
    supabaseClient.from(ARTICULOS_TABLE).update(values, options).eq('id', id);

  const initialResult = await createUpdateQuery().select(selectColumns).maybeSingle();

  if (!initialResult.error || !isMissingJsonbObjectLengthError(initialResult.error)) {
    return {
      data: initialResult.data ?? null,
      error: initialResult.error ?? null,
      fallbackUsed: false,
      refetchError: null,
    };
  }

  console.warn(
    'Articulo update failed because the database is missing jsonb_object_length(). Retrying without requesting the updated row.'
  );

  const retryResult = await createUpdateQuery({ returning: 'minimal' });

  if (retryResult.error) {
    return {
      data: null,
      error: retryResult.error,
      fallbackUsed: true,
      refetchError: null,
    };
  }

  const { data: refetchedData, error: refetchError } = await supabaseClient
    .from(ARTICULOS_TABLE)
    .select(selectColumns)
    .eq('id', id)
    .maybeSingle();

  if (refetchError) {
    console.error('Refetch articulo after fallback update error:', refetchError);
  }

  const safeData = refetchedData ?? { ...(existingData ?? {}), ...values };

  return {
    data: safeData,
    error: null,
    fallbackUsed: true,
    refetchError,
  };
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const ensureSupabaseConfigured = (_req, res, next) => {
  if (!supabaseClient) {
    logSupabaseMisconfiguration();

    return res.status(500).json({
      message: 'Server is not configured correctly.',
      details: 'Supabase client has not been initialized.',
      missingEnvVars,
    });
  }

  next();
};

const tercerosRouter = express.Router();

tercerosRouter.use(ensureSupabaseConfigured);

tercerosRouter.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseClient.from(TERCEROS_TABLE).select('*');

    if (error) {
      console.error('List terceros error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching third parties.', error));
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error('Unhandled list terceros error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching third parties.', err));
  }
});

tercerosRouter.get('/:id/historial', async (req, res) => {
  const { id } = req.params;

  try {
    let lastMissingTableError = null;

    for (const table of TERCEROS_LOG_TABLE_CANDIDATES) {
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .eq('tercero_id', id);

      if (!error) {
        return res.json(data ?? []);
      }

      if (error.code === '42P01') {
        lastMissingTableError = error;
        continue;
      }

      console.error(`List tercero history error on table ${table}:`, error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching third-party history.', error));
    }

    if (lastMissingTableError) {
      console.error('Tercero history error: log tables are missing.');
    }

    return res.status(404).json({
      message: 'Historial no disponible. Configura la tabla de auditoría para visualizar los cambios.',
      candidates: TERCEROS_LOG_TABLE_CANDIDATES,
    });
  } catch (err) {
    console.error('Unhandled list tercero history error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching third-party history.', err));
  }
});

tercerosRouter.post('/', async (req, res) => {
  try {
    const incoming = req.body ?? {};
    const actorId = extractActorId(req, incoming);
    const actorName = extractActorName(req, incoming);
    const payload = sanitizeThirdPartyPayloadForInsert({ ...incoming });

    if (!payload.identificacion_fiscal) {
      return res.status(400).json({ message: 'La identificación fiscal es obligatoria.' });
    }

    if (!payload.nombre_comercial) {
      return res.status(400).json({ message: 'El nombre comercial es obligatorio.' });
    }

    const timestamp = new Date().toISOString();

    if (actorId !== null && actorId !== undefined) {
      payload.creado_por = actorId;
      payload.modificado_por = actorId;
    }

    if (actorName) {
      payload.creado_por_nombre = actorName;
      payload.modificado_por_nombre = actorName;
    }

    payload.creado_en = payload.creado_en ?? timestamp;
    payload.modificado_en = timestamp;

    const { data, error } = await supabaseClient.from(TERCEROS_TABLE).insert([payload]).select().maybeSingle();

    if (error) {
      console.error('Create tercero error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating third party.', error));
    }

    if (data) {
      await recordTerceroLog({
        terceroId: data?.id ?? data?.tercero_id ?? null,
        action: 'create',
        actorId,
        actorName,
        previousData: null,
        newData: data,
        changes: computeTerceroChanges({}, data),
      });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Unhandled create tercero error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while creating third party.', err));
  }
});

tercerosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'El identificador del tercero es obligatorio.' });
  }

  try {
    const lookupResult = await findThirdPartyByIdentifier(id);

    if (lookupResult?.error) {
      console.error('Find tercero for update error:', lookupResult.error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while updating third party.', lookupResult.error));
    }

    if (!lookupResult?.data || !lookupResult?.column) {
      return res.status(404).json({ message: 'El tercero especificado no existe.' });
    }

    const incoming = req.body ?? {};
    const actorId = extractActorId(req, incoming);
    const actorName = extractActorName(req, incoming);
    const payload = sanitizeThirdPartyPayloadForUpdate({ ...incoming });

    const timestamp = new Date().toISOString();

    if (actorId !== null && actorId !== undefined) {
      payload.modificado_por = actorId;
    }

    if (actorName) {
      payload.modificado_por_nombre = actorName;
    }

    payload.modificado_en = timestamp;
    payload.actualizado_en = payload.actualizado_en ?? timestamp;
    payload.updated_at = payload.updated_at ?? timestamp;

    const { data, error } = await supabaseClient
      .from(TERCEROS_TABLE)
      .update(payload)
      .eq(lookupResult.column, lookupResult.value)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST302') {
        return res.status(404).json({ message: 'No se encontró el tercero a actualizar.' });
      }

      console.error('Update tercero error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while updating third party.', error));
    }

    if (!data) {
      return res.status(404).json({ message: 'No se encontró el tercero a actualizar.' });
    }

    await recordTerceroLog({
      terceroId: data?.id ?? lookupResult.data?.id ?? lookupResult.data?.tercero_id ?? null,
      action: 'update',
      actorId,
      actorName,
      previousData: lookupResult.data,
      newData: data,
      changes: computeTerceroChanges(lookupResult.data, data),
    });

    return res.json(data);
  } catch (err) {
    console.error('Unhandled update tercero error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while updating third party.', err));
  }
});

const articulosRouter = express.Router();

articulosRouter.use(ensureSupabaseConfigured);

articulosRouter.post('/', async (req, res) => {
  try {
    const payload = req.body ?? {};

    const actorId = extractActorId(req, payload);
    const actorName = extractActorName(req, payload);

    const { data, error } = await supabaseClient
      .from(ARTICULOS_TABLE)
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Create articulo error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating articulo.', error));
    }

    await recordArticuloLog({
      articuloId: data?.id ?? null,
      action: 'create',
      actorId,
      actorName,
      newData: data,
      changes: computeArticuloChanges({}, data),
    });

    return res.status(201).json(data);
  } catch (err) {
    console.error('Unhandled create articulo error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while creating articulo.', err));
  }
});

articulosRouter.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseClient.from(ARTICULOS_TABLE).select('*');

    if (error) {
      console.error('List articulos error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching articulos.', error));
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error('Unhandled list articulos error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching articulos.', err));
  }
});

articulosRouter.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabaseClient
      .from(ARTICULOS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Get articulo error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching articulo.', error));
    }

    if (!data) {
      return res.status(404).json({ message: 'Articulo not found.' });
    }

    return res.json(data);
  } catch (err) {
    console.error('Unhandled get articulo error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching articulo.', err));
  }
});

articulosRouter.get('/:id/historial', async (req, res) => {
  const { id } = req.params;

  try {
    let lastMissingTableError = null;

    for (const table of ARTICULOS_LOG_TABLE_CANDIDATES) {
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .eq('articulo_id', id);

      if (!error) {
        return res.json(data ?? []);
      }

      if (error.code === '42P01') {
        lastMissingTableError = error;
        continue;
      }

      console.error(`List articulo history error on table ${table}:`, error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching articulo history.', error));
    }

    if (lastMissingTableError) {
      console.error('Articulo history error: log tables are missing.');
    }

    return res.status(404).json({
      message: 'Historial no disponible. Configura la tabla de auditoría para visualizar los cambios.',
      candidates: ARTICULOS_LOG_TABLE_CANDIDATES,
    });
  } catch (err) {
    console.error('Unhandled list articulo history error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching articulo history.', err));
  }
});

articulosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body ?? {};

  try {
    const actorId = extractActorId(req, updates);
    const actorName = extractActorName(req, updates);

    const { data: existingData, error: fetchError } = await supabaseClient
      .from(ARTICULOS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('Fetch articulo before update error:', fetchError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Unexpected error while updating articulo.',
            fetchError
          )
        );
    }

    if (!existingData) {
      return res.status(404).json({ message: 'Articulo not found.' });
    }

    const updatesWithAudit = { ...updates };

    if (updatesWithAudit.id !== undefined) {
      delete updatesWithAudit.id;
    }

    if (actorId !== null && actorId !== undefined) {
      updatesWithAudit.modificado_por = actorId;
    }

    updatesWithAudit.modificado_en = new Date().toISOString();

    const cleanedUpdates = Object.fromEntries(
      Object.entries(updatesWithAudit).filter(([, value]) => value !== undefined)
    );

    const {
      data: updatedData,
      error: updateError,
      fallbackUsed: updateFallbackUsed,
    } = await applyArticuloUpdateWithFallback({
      id,
      values: cleanedUpdates,
      existingData,
    });

    if (updateError) {
      console.error('Update articulo error:', updateError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Unexpected error while updating articulo.',
            updateError
          )
        );
    }

    const safeUpdatedData = updatedData ?? { ...existingData, ...cleanedUpdates };

    const previousActive = normalizeBoolean(existingData?.activo);
    const nextActive = normalizeBoolean(safeUpdatedData?.activo);

    let action = 'update';

    if (previousActive !== null && nextActive !== null && previousActive !== nextActive) {
      action = nextActive ? 'enable' : 'disable';
    }

    await recordArticuloLog({
      articuloId: safeUpdatedData?.id ?? id,
      action,
      actorId,
      actorName,
      previousData: existingData,
      newData: safeUpdatedData,
      changes: computeArticuloChanges(existingData, safeUpdatedData),
    });

    if (updateFallbackUsed) {
      console.warn('Articulo update responded with data obtained via fallback logic.');
    }

    return res.json({
      message: 'Articulo updated successfully.',
      id: safeUpdatedData?.id ?? id,
    });
  } catch (err) {
    console.error('Unhandled update articulo error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while updating articulo.', err));
  }
});

articulosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const actorId = extractActorId(req);
    const actorName = extractActorName(req);

    const { data: existingData, error: fetchError } = await supabaseClient
      .from(ARTICULOS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('Fetch articulo before disable error:', fetchError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while deleting articulo.', fetchError));
    }

    if (!existingData) {
      return res.status(404).json({ message: 'Articulo not found.' });
    }

    const alreadyInactive = normalizeBoolean(existingData?.activo) === false;

    if (alreadyInactive) {
      return res.json({
        message: 'Articulo is already disabled.',
        articulo: existingData,
      });
    }

    const {
      data,
      error,
      fallbackUsed: deleteFallbackUsed,
    } = await applyArticuloUpdateWithFallback({
      id,
      values: { activo: false },
      existingData,
    });

    if (error) {
      console.error('Logical delete articulo error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while deleting articulo.', error));
    }

    if (!data) {
      return res.status(404).json({ message: 'Articulo not found.' });
    }

    await recordArticuloLog({
      articuloId: data?.id ?? id,
      action: 'disable',
      actorId,
      actorName,
      previousData: existingData,
      newData: data,
      changes: computeArticuloChanges(existingData, data),
    });

    if (deleteFallbackUsed) {
      console.warn('Articulo disable responded with data obtained via fallback logic.');
    }

    return res.json({ message: 'Articulo disabled successfully.', articulo: data });
  } catch (err) {
    console.error('Unhandled delete articulo error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while deleting articulo.', err));
  }
});

const facturasRouter = express.Router();

facturasRouter.use(ensureSupabaseConfigured);

const normalizeInvoiceLineType = (value, hasArticle = false) => {
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();

    if (['producto', 'product', 'goods', 'item'].includes(lowered)) {
      return 'Producto';
    }

    if (['servicio', 'service'].includes(lowered)) {
      return 'Servicio';
    }
  }

  return hasArticle ? 'Producto' : 'Servicio';
};

const extractInvoiceClientIdentifier = (payload = {}) => {
  const candidates = [
    payload.id_cliente,
    payload.cliente_id,
    payload.clienteId,
    payload.client_id,
    payload.clientId,
    payload.tercero_id,
    payload.terceroId,
    payload.id_tercero,
    payload.customer_id,
    payload.customerId,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === 'string') {
      if (candidate.trim()) {
        return candidate;
      }

      continue;
    }

    return candidate;
  }

  return null;
};

const extractInvoiceLines = (payload = {}) => {
  const candidates = [
    payload.lineas_factura,
    payload.lineasFactura,
    payload.detalles,
    payload.detalle,
    payload.lineas,
    payload.items,
    payload.detalle_factura,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item) => item !== undefined && item !== null);
    }
  }

  return [];
};

facturasRouter.post('/emitir', async (req, res) => {
  const payload = req.body ?? {};
  const actorId = extractActorId(req, payload);
  const actorName = extractActorName(req, payload);
  const timestamp = new Date().toISOString();

  const clientIdentifierRaw = extractInvoiceClientIdentifier(payload);

  if (clientIdentifierRaw === null) {
    return res.status(400).json({ message: 'El identificador del cliente es obligatorio.' });
  }

  const normalizedClientIdentifier = normalizeIdentifier(clientIdentifierRaw);

  const rawLines = extractInvoiceLines(payload);

  if (!rawLines.length) {
    return res.status(400).json({ message: 'La factura debe incluir al menos una línea.' });
  }

  try {
    const clienteResult = await findThirdPartyByIdentifier(normalizedClientIdentifier);

    if (clienteResult?.error) {
      console.error('Invoice emission: customer lookup error:', clienteResult.error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while validating customer.', clienteResult.error));
    }

    const clienteData = clienteResult?.data;

    if (!clienteData) {
      return res.status(400).json({ message: 'El cliente especificado no existe en el sistema.' });
    }

    if (!interpretThirdPartyActiveState(clienteData)) {
      return res.status(400).json({
        message: `El cliente ${getThirdPartyDisplayName(
          clienteData
        )} está inactivo y no puede recibir facturas en este momento.`,
      });
    }

    const rollbackInvoiceRecords = async (invoiceId) => {
      if (!invoiceId) {
        return;
      }

      try {
        await supabaseClient.from(LINEAS_FACTURA_TABLE).delete().eq('id_factura', invoiceId);
      } catch (rollbackLinesError) {
        console.error('Invoice emission: error while rolling back invoice lines.', rollbackLinesError);
      }

      try {
        await supabaseClient.from(FACTURAS_VENTA_TABLE).delete().eq('id', invoiceId);
      } catch (rollbackHeaderError) {
        console.error('Invoice emission: error while rolling back invoice header (id).', rollbackHeaderError);
      }

      try {
        await supabaseClient.from(FACTURAS_VENTA_TABLE).delete().eq('factura_id', invoiceId);
      } catch (rollbackAltError) {
        if (rollbackAltError?.code !== '42703' && rollbackAltError?.code !== 'PGRST204') {
          console.error('Invoice emission: error while rolling back invoice header (factura_id).', rollbackAltError);
        }
      }
    };

    const normalizedLines = [];

    for (let index = 0; index < rawLines.length; index += 1) {
      const rawLine = rawLines[index];
      const base = rawLine && typeof rawLine === 'object' ? { ...rawLine } : {};

      const articuloIdentifierRaw =
        base.id_articulo ??
        base.articulo_id ??
        base.articuloId ??
        base.producto_id ??
        base.productoId ??
        base.id_producto ??
        null;
      const articuloId = normalizeIdentifier(articuloIdentifierRaw);

      const cantidad = toNumber(base.cantidad ?? base.quantity ?? base.cant ?? 0, 0);

      if (cantidad <= 0) {
        return res.status(400).json({
          message: `La cantidad de la línea ${index + 1} debe ser mayor a cero.`,
        });
      }

      const precioUnitario = roundCurrency(
        base.precio_unitario ??
          base.precioUnitario ??
          base.precio ??
          base.valor_unitario ??
          base.valorUnitario ??
          base.price ??
          0
      );

      const impuestos = roundCurrency(
        base.total_impuestos ??
          base.totalImpuestos ??
          base.impuestos ??
          base.impuesto ??
          base.tax ??
          base.taxes ??
          0
      );

      const subtotalFromPayload =
        base.sub_total ?? base.subtotal ?? base.base ?? base.valor_base ?? base.base_imponible ?? null;
      const subtotal =
        subtotalFromPayload !== null && subtotalFromPayload !== undefined
          ? roundCurrency(subtotalFromPayload)
          : roundCurrency(cantidad * precioUnitario);

      const totalFromPayload =
        base.total_linea ?? base.totalLinea ?? base.total ?? base.monto_total ?? base.importe_total ?? null;
      const total =
        totalFromPayload !== null && totalFromPayload !== undefined
          ? roundCurrency(totalFromPayload)
          : roundCurrency(subtotal + impuestos);

      const tipo = normalizeInvoiceLineType(
        base.tipo ?? base.tipo_linea ?? base.tipoLinea ?? base.item_type ?? base.clase ?? null,
        articuloId !== null
      );
      const tipoNormalized = tipo.trim().toLowerCase();

      if (tipoNormalized === 'producto' && articuloId === null) {
        return res.status(400).json({
          message: `La línea ${index + 1} es de tipo Producto y requiere un artículo asociado.`,
        });
      }

      const descripcionCandidates = [
        base.descripcion,
        base.descripcion_linea,
        base.descripcionLinea,
        base.detalle,
        base.nombre,
        base.concepto,
      ];
      let descripcion = '';

      for (const candidate of descripcionCandidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          descripcion = candidate.trim();
          break;
        }
      }

      normalizedLines.push({
        index,
        articuloId,
        articuloKey: articuloId === null || articuloId === undefined ? null : String(articuloId),
        cantidad,
        precioUnitario,
        impuestos,
        subtotal,
        total,
        tipo,
        tipoNormalized,
        descripcion,
        raw: base,
      });
    }

    const productLines = normalizedLines.filter((line) => line.tipoNormalized === 'producto');
    const articuloIds = Array.from(
      new Set(
        productLines
          .map((line) => line.articuloId)
          .filter((value) => value !== null && value !== undefined)
      )
    );

    const articuloLookup = new Map();

    if (articuloIds.length) {
      let articulosData = [];

      const { data: byIdData, error: byIdError } = await supabaseClient
        .from(ARTICULOS_TABLE)
        .select('id, articulo_id, existencia, nombre, codigo, descripcion, tipo')
        .in('id', articuloIds);

      if (byIdError && byIdError.code !== 'PGRST116' && byIdError.code !== 'PGRST204') {
        console.error('Invoice emission inventory lookup error (id):', byIdError);
      } else if (byIdData) {
        articulosData = byIdData;
      }

      const knownKeys = new Set();

      for (const articulo of articulosData ?? []) {
        const primaryId = articulo?.id ?? articulo?.articulo_id;

        if (primaryId === undefined || primaryId === null) {
          continue;
        }

        const key = String(primaryId);
        articuloLookup.set(key, articulo);
        knownKeys.add(key);
      }

      const missingKeys = articuloIds
        .map((identifier) => String(identifier))
        .filter((key) => !knownKeys.has(key));

      if (missingKeys.length) {
        const { data: byAltData, error: byAltError } = await supabaseClient
          .from(ARTICULOS_TABLE)
          .select('id, articulo_id, existencia, nombre, codigo, descripcion, tipo')
          .in('articulo_id', missingKeys);

        if (byAltError && byAltError.code !== '42703' && byAltError.code !== 'PGRST204') {
          console.error('Invoice emission inventory lookup error (articulo_id):', byAltError);
          return res
            .status(500)
            .json(formatUnexpectedErrorResponse('Unexpected error while validating inventory.', byAltError));
        }

        for (const articulo of byAltData ?? []) {
          const primaryId = articulo?.id ?? articulo?.articulo_id;

          if (primaryId === undefined || primaryId === null) {
            continue;
          }

          articuloLookup.set(String(primaryId), articulo);
        }
      }

      for (const line of productLines) {
        const article = articuloLookup.get(line.articuloKey ?? '');

        if (!article) {
          return res.status(400).json({
            message: `El artículo asociado a la línea ${line.index + 1} no existe.`,
            articuloId: line.articuloId,
          });
        }

        const available = roundCurrency(article.existencia ?? 0);

        if (line.cantidad > available) {
          return res.status(409).json({
            message: `Stock insuficiente para ${getArticleDisplayName(article)}. Disponible: ${available}, requerido: ${line.cantidad}.`,
            articuloId: line.articuloId,
            disponible: available,
            requerido: line.cantidad,
          });
        }
      }
    }

    const totals = calculateInvoiceTotals(normalizedLines);

    const headerPayload = { ...payload };
    delete headerPayload.lineas_factura;
    delete headerPayload.lineasFactura;
    delete headerPayload.detalle;
    delete headerPayload.detalles;
    delete headerPayload.lineas;
    delete headerPayload.items;
    delete headerPayload.detalle_factura;
    delete headerPayload.clienteId;
    delete headerPayload.clientId;
    delete headerPayload.customerId;
    delete headerPayload.customer_id;
    delete headerPayload.terceroId;

    headerPayload.id_cliente =
      headerPayload.id_cliente ?? clienteData?.id ?? clienteData?.tercero_id ?? normalizedClientIdentifier;
    headerPayload.cliente_id = headerPayload.cliente_id ?? headerPayload.id_cliente;
    headerPayload.tercero_id = headerPayload.tercero_id ?? headerPayload.id_cliente;
    headerPayload.estado = headerPayload.estado ?? headerPayload.status ?? 'Emitida';

    const fechaIso =
      parseDateToIso(
        headerPayload.fecha ??
          headerPayload.fecha_emision ??
          payload.fecha ??
          payload.fecha_emision ??
          headerPayload.fechaFactura ??
          payload.fechaFactura
      ) ?? timestamp;
    headerPayload.fecha = fechaIso;
    delete headerPayload.fecha_emision;
    delete headerPayload.fechaFactura;
    delete headerPayload.status;

    if (headerPayload.sub_total === undefined || headerPayload.sub_total === null) {
      headerPayload.sub_total = totals.subtotal;
    }

    if (headerPayload.total_impuestos === undefined || headerPayload.total_impuestos === null) {
      headerPayload.total_impuestos = totals.taxes;
    }

    if (headerPayload.total === undefined || headerPayload.total === null) {
      headerPayload.total = totals.total;
    }

    if (actorId !== null && actorId !== undefined) {
      headerPayload.creado_por = headerPayload.creado_por ?? actorId;
      headerPayload.modificado_por = headerPayload.modificado_por ?? actorId;
    }

    if (actorName) {
      headerPayload.creado_por_nombre = headerPayload.creado_por_nombre ?? actorName;
      headerPayload.modificado_por_nombre = headerPayload.modificado_por_nombre ?? actorName;
    }

    headerPayload.creado_en = headerPayload.creado_en ?? timestamp;
    headerPayload.modificado_en = headerPayload.modificado_en ?? timestamp;
    headerPayload.actualizado_en = headerPayload.actualizado_en ?? timestamp;
    headerPayload.updated_at = headerPayload.updated_at ?? timestamp;

    const cleanedHeaderPayload = Object.fromEntries(
      Object.entries(headerPayload).filter(([, value]) => value !== undefined)
    );

    let facturaId = null;

    const { data: facturaData, error: facturaError } = await supabaseClient
      .from(FACTURAS_VENTA_TABLE)
      .insert([cleanedHeaderPayload])
      .select()
      .maybeSingle();

    if (facturaError) {
      console.error('Invoice emission: header insertion failed.', facturaError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating invoice header.', facturaError));
    }

    facturaId =
      facturaData?.id ??
      facturaData?.factura_id ??
      cleanedHeaderPayload?.id ??
      cleanedHeaderPayload?.factura_id ??
      null;

    if (!facturaId) {
      console.warn('Invoice emission: inserted invoice without an explicit identifier, attempting recovery.');
      const { data: recoveredInvoice, error: recoveryError } = await supabaseClient
        .from(FACTURAS_VENTA_TABLE)
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recoveryError) {
        console.error('Invoice emission: unable to recover invoice identifier.', recoveryError);
        return res.status(500).json({ message: 'No fue posible recuperar el identificador de la factura.' });
      }

      facturaId = recoveredInvoice?.id ?? recoveredInvoice?.factura_id ?? null;

      if (!facturaId) {
        return res.status(500).json({ message: 'No fue posible determinar el identificador de la factura.' });
      }
    }

    let facturaRecord = facturaData ?? null;

    if (!facturaRecord) {
      const { data: refetchedInvoice, error: refetchInvoiceError } = await supabaseClient
        .from(FACTURAS_VENTA_TABLE)
        .select('*')
        .eq('id', facturaId)
        .maybeSingle();

      if (!refetchInvoiceError && refetchedInvoice) {
        facturaRecord = refetchedInvoice;
      } else if (refetchInvoiceError && refetchInvoiceError.code !== 'PGRST116') {
        console.error('Invoice emission: unable to refetch invoice after insert.', refetchInvoiceError);
      }
    }

    const detailPayloads = normalizedLines.map((line) => {
      const detail = {
        id_factura: facturaId,
        tipo: line.tipo,
        cantidad: line.cantidad,
        precio_unitario: line.precioUnitario,
        total_linea: line.total,
        total_impuestos: line.impuestos,
        descripcion: line.descripcion || null,
        creado_en: timestamp,
      };

      if (line.articuloId !== null && line.articuloId !== undefined) {
        detail.id_articulo = line.articuloId;
      }

      if (actorId !== null && actorId !== undefined) {
        detail.creado_por = actorId;
      }

      if (actorName) {
        detail.creado_por_nombre = actorName;
      }

      return Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== undefined));
    });

    const { data: lineasData, error: lineasError } = await supabaseClient
      .from(LINEAS_FACTURA_TABLE)
      .insert(detailPayloads)
      .select();

    if (lineasError) {
      console.error('Invoice emission: detail insertion failed, triggering rollback.', lineasError);
      await rollbackInvoiceRecords(facturaId);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating invoice details.', lineasError));
    }

    const revertStockChanges = async (adjustments = []) => {
      for (const adjustment of adjustments.slice().reverse()) {
        try {
          const revertPayload = {
            existencia: adjustment.previousExistence,
            modificado_en: timestamp,
          };

          if (actorId !== null && actorId !== undefined) {
            revertPayload.modificado_por = actorId;
          }

          if (actorName) {
            revertPayload.modificado_por_nombre = actorName;
          }

          await supabaseClient
            .from(ARTICULOS_TABLE)
            .update(revertPayload)
            .eq(adjustment.identifierColumn, adjustment.identifierValue);
        } catch (revertError) {
          console.error('Invoice emission: error while reverting stock adjustment.', revertError);
        }
      }
    };

    const stockAdjustments = [];

    for (const line of productLines) {
      const article = articuloLookup.get(line.articuloKey ?? '');

      if (!article) {
        continue;
      }

      const previousExistence = roundCurrency(article.existencia ?? 0);
      const newExistence = roundCurrency(previousExistence - line.cantidad);

      const updatePayload = {
        existencia: newExistence,
        modificado_en: timestamp,
      };

      if (actorId !== null && actorId !== undefined) {
        updatePayload.modificado_por = actorId;
      }

      if (actorName) {
        updatePayload.modificado_por_nombre = actorName;
      }

      const identifierColumn = article.id !== undefined && article.id !== null ? 'id' : 'articulo_id';
      const identifierValue = identifierColumn === 'id' ? article.id : article.articulo_id;

      const { data: updatedArticle, error: stockError } = await supabaseClient
        .from(ARTICULOS_TABLE)
        .update(updatePayload)
        .eq(identifierColumn, identifierValue)
        .select()
        .maybeSingle();

      if (stockError) {
        console.error('Invoice emission: stock update failed, triggering rollback.', stockError);
        await revertStockChanges(stockAdjustments);
        await rollbackInvoiceRecords(facturaId);
        return res
          .status(500)
          .json(formatUnexpectedErrorResponse('Unexpected error while updating inventory.', stockError));
      }

      const safeUpdatedArticle = updatedArticle ?? { ...article, existencia: newExistence };

      await recordArticuloLog({
        articuloId: safeUpdatedArticle?.id ?? identifierValue,
        action: 'stock-adjust',
        actorId,
        actorName,
        previousData: article,
        newData: safeUpdatedArticle,
        changes: computeArticuloChanges(article, safeUpdatedArticle),
      });

      stockAdjustments.push({
        identifierColumn,
        identifierValue,
        previousExistence,
      });

      articuloLookup.set(line.articuloKey ?? '', safeUpdatedArticle);
    }

    return res.status(201).json({
      message: 'Factura emitida correctamente.',
      factura: facturaRecord ?? facturaData ?? cleanedHeaderPayload,
      lineas: lineasData ?? [],
      totales: totals,
      cliente: clienteData,
    });
  } catch (err) {
    console.error('Unhandled invoice emission error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while emitting invoice.', err));
  }
});

app.use('/api/terceros', tercerosRouter);
app.use('/api/articulos', articulosRouter);
app.use('/api/facturas', facturasRouter);

app.post('/api/login', async (req, res) => {
  if (!supabaseClient) {
    logSupabaseMisconfiguration();

    return res.status(500).json({
      message: 'Server is not configured correctly.',
      details: 'Supabase client has not been initialized.',
      missingEnvVars,
    });
  }

  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const { data: admin, error } = await supabaseClient
      .from('admins')
      .select('id, email, password_hash')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Supabase query error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error, please try again later.', error));
    }

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    return res.json({ message: 'Login successful.', adminId: admin.id, email: admin.email });
  } catch (err) {
    console.error('Login error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error, please try again later.', err));
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
