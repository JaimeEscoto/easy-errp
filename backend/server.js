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
const PAGOS_RECIBIDOS_TABLE = 'pagos_recibidos';
const LINEAS_FACTURA_TABLE = 'lineas_factura';
const ORDENES_COMPRA_TABLE = 'ordenes_compra';
const LINEAS_ORDEN_COMPRA_TABLE = 'lineas_orden_compra';
const ALMACENES_TABLE = 'almacenes';
const INVENTARIO_ARTICULOS_TABLE = 'inventario_articulos';
const ENTRADAS_ALMACEN_TABLE = 'entradas_almacen';
const LINEAS_ENTRADA_ALMACEN_TABLE = 'lineas_entrada_almacen';
const PAGOS_PROVEEDORES_TABLE = 'pagos_proveedores';
const TERCEROS_TABLE = 'terceros';
const TERCEROS_LOG_TABLE_CANDIDATES = [
  'terceros_log',
  'terceros_logs',
  'terceros_historial',
  'terceros_history',
];

const PURCHASE_ORDER_NUMBER_PREFIX = process.env.PURCHASE_ORDER_NUMBER_PREFIX ?? 'OC-';
const PURCHASE_ORDER_NUMBER_PADDING = (() => {
  const parsed = Number.parseInt(process.env.PURCHASE_ORDER_NUMBER_PADDING ?? '', 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 5;
})();

const extractTrailingDigits = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const matches = String(value)
    .split(/[^0-9]+/)
    .filter((segment) => segment)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));

  if (!matches.length) {
    return null;
  }

  return matches[matches.length - 1];
};

const formatPurchaseOrderNumber = (sequence) => {
  const numeric = Number(sequence);

  if (!Number.isFinite(numeric) || numeric < 1) {
    return `${PURCHASE_ORDER_NUMBER_PREFIX}${String(1).padStart(PURCHASE_ORDER_NUMBER_PADDING, '0')}`;
  }

  const padded = String(Math.trunc(numeric)).padStart(PURCHASE_ORDER_NUMBER_PADDING, '0');

  return `${PURCHASE_ORDER_NUMBER_PREFIX}${padded}`;
};

const fetchLatestPurchaseOrderSequence = async () => {
  const { data, error } = await supabaseClient
    .from(ORDENES_COMPRA_TABLE)
    .select('numero_orden')
    .not('numero_orden', 'is', null)
    .order('creado_en', { ascending: false })
    .order('numero_orden', { ascending: false })
    .limit(25);

  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      return null;
    }

    throw error;
  }

  const records = Array.isArray(data) ? data : data ? [data] : [];

  for (const record of records) {
    const sequence = extractTrailingDigits(record?.numero_orden);

    if (sequence !== null && sequence !== undefined) {
      return sequence;
    }
  }

  return null;
};

const generatePurchaseOrderNumber = async () => {
  const latestSequence = await fetchLatestPurchaseOrderSequence();
  const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;

  return formatPurchaseOrderNumber(nextSequence);
};

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

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const coerceToNumericId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isNaN(asNumber) || !Number.isFinite(asNumber) ? null : asNumber;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const asNumber = Number(trimmed);

    return Number.isNaN(asNumber) || !Number.isFinite(asNumber) ? null : asNumber;
  }

  return null;
};

const redactSensitiveFields = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const SENSITIVE_KEYWORDS = [
    'password',
    'contrasena',
    'contraseña',
    'token',
    'secret',
    'apikey',
    'api_key',
    'service_role_key',
  ];

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      const normalizedKey = key.toLowerCase();

      if (SENSITIVE_KEYWORDS.some((candidate) => normalizedKey.includes(candidate))) {
        return [key, '[REDACTED]'];
      }

      return [key, redactSensitiveFields(entryValue)];
    })
  );
};

const safeSerializeForLog = (value) => {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return '[Unable to serialize value for logging]';
  }
};

const createRequestLogger = () => {
  return (req, res, next) => {
    const startTime = process.hrtime();
    const { method } = req;
    const originalUrl = req.originalUrl || req.url;

    console.info(`[Request] ${method} ${originalUrl} - started`);

    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const durationMs = seconds * 1000 + nanoseconds / 1e6;
      const status = res.statusCode;
      const statusMessage = res.statusMessage ? ` ${res.statusMessage}` : '';
      const logMessage = `[Request] ${method} ${originalUrl} -> ${status}${statusMessage} (${durationMs.toFixed(
        2
      )} ms)`;

      if (status >= 500) {
        console.error(logMessage);
      } else if (status >= 400) {
        console.warn(logMessage);
      } else {
        console.info(logMessage);
      }

      const shouldLogBody = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      if (shouldLogBody && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        const sanitizedBody = redactSensitiveFields(req.body);
        console.debug(`[Request] ${method} ${originalUrl} payload: ${safeSerializeForLog(sanitizedBody)}`);
      }

      if (req.query && Object.keys(req.query).length > 0) {
        console.debug(`[Request] ${method} ${originalUrl} query: ${safeSerializeForLog(req.query)}`);
      }
    });

    next();
  };
};

const sanitizeNumericAuditFields = (payload, fields = []) => {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  for (const field of fields) {
    if (!hasOwn(payload, field)) {
      continue;
    }

    const normalized = coerceToNumericId(payload[field]);

    if (normalized === null) {
      delete payload[field];
    } else {
      payload[field] = normalized;
    }
  }
};

const sanitizeArticuloPayloadForInsert = (input = {}) => {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const payload = { ...input };

  sanitizeNumericAuditFields(payload, ['creado_por', 'created_by', 'modificado_por']);

  if (hasOwn(payload, 'creado_por') && !hasOwn(payload, 'created_by')) {
    payload.created_by = payload.creado_por;
  }

  if (hasOwn(payload, 'creado_por_nombre') && !hasOwn(payload, 'created_by_name')) {
    payload.created_by_name = payload.creado_por_nombre;
  }

  delete payload.creado_por;
  delete payload.creado_por_nombre;

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
};

const applyActorAuditFields = (
  payload,
  actorId,
  { includeCreated = true, includeUpdated = true } = {}
) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const targetFields = [];

  if (includeCreated) {
    targetFields.push('creado_por');
  }

  if (includeUpdated) {
    targetFields.push('modificado_por');
  }

  sanitizeNumericAuditFields(payload, targetFields);

  const numericActorId = coerceToNumericId(actorId);

  if (numericActorId === null) {
    return payload;
  }

  if (includeCreated && !hasOwn(payload, 'creado_por')) {
    payload.creado_por = numericActorId;
  }

  if (includeUpdated && !hasOwn(payload, 'modificado_por')) {
    payload.modificado_por = numericActorId;
  }

  return payload;
};

const extractActorId = (req, payload = {}) => {
  const headerCandidates = ['x-admin-id', 'x-user-id', 'x-actor-id'];

  for (const header of headerCandidates) {
    const value = req.headers?.[header];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorId(value);
    }
  }

  const bodyCandidates = ['modificado_por', 'creado_por', 'created_by', 'admin_id', 'user_id'];

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
    'created_by_name',
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
  'created_by',
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

const getSupplierDisplayName = (thirdParty = {}) => {
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
    return `Proveedor ${thirdParty.id}`;
  }

  return 'Proveedor sin nombre';
};

const buildThirdPartyLookupKey = (thirdParty = {}) => {
  const candidates = [
    thirdParty.id,
    thirdParty.tercero_id,
    thirdParty.terceroId,
    thirdParty.identificacion_fiscal,
    thirdParty.identificacion,
    thirdParty.nit,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);

    if (normalized !== null && normalized !== undefined) {
      return String(normalized);
    }
  }

  return null;
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

const roundQuantity = (value) => {
  const normalized = toNumber(value, 0);
  return Math.round((normalized + Number.EPSILON) * 10000) / 10000;
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

const coerceToNumberOrNull = (value) => {
  const normalized = toNumber(value, null);

  if (normalized === null || Number.isNaN(normalized)) {
    return null;
  }

  return Number(normalized);
};

const parseRecordDate = (record = {}, columns = []) => {
  for (const column of columns) {
    const iso = parseDateToIso(record?.[column]);

    if (!iso) {
      continue;
    }

    const parsed = new Date(iso);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

const startOfUtcMonth = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

const addUtcMonths = (date, months) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));

const sumValuesForRange = (
  records = [],
  { dateColumns = [], valueExtractor = () => null, rangeStart = null, rangeEnd = null }
) => {
  let total = 0;

  for (const record of records) {
    const recordDate = parseRecordDate(record, dateColumns);

    if (!recordDate) {
      continue;
    }

    if (rangeStart && recordDate < rangeStart) {
      continue;
    }

    if (rangeEnd && recordDate >= rangeEnd) {
      continue;
    }

    const value = coerceToNumberOrNull(valueExtractor(record));

    if (value === null) {
      continue;
    }

    total += value;
  }

  return total;
};

const computeMonthlySummary = (
  records = [],
  { dateColumns = [], valueExtractor = () => null, now = new Date() } = {}
) => {
  const currentMonthStart = startOfUtcMonth(now);
  const nextMonthStart = addUtcMonths(currentMonthStart, 1);
  const previousMonthStart = addUtcMonths(currentMonthStart, -1);

  const currentTotalRaw = sumValuesForRange(records, {
    dateColumns,
    valueExtractor,
    rangeStart: currentMonthStart,
    rangeEnd: nextMonthStart,
  });

  const previousTotalRaw = sumValuesForRange(records, {
    dateColumns,
    valueExtractor,
    rangeStart: previousMonthStart,
    rangeEnd: currentMonthStart,
  });

  const currentTotal = roundCurrency(currentTotalRaw);
  const previousTotal = roundCurrency(previousTotalRaw);
  const difference = roundCurrency(currentTotalRaw - previousTotalRaw);

  const percentageChange =
    previousTotalRaw > 0
      ? Math.round(((currentTotalRaw - previousTotalRaw) / previousTotalRaw) * 1000) / 10
      : null;

  return {
    total: currentTotal,
    totalAnterior: previousTotal,
    diferencia: difference,
    variacionPorcentaje: percentageChange,
    periodo: {
      inicio: currentMonthStart.toISOString(),
      fin: nextMonthStart.toISOString(),
    },
  };
};

const interpretArticuloActiveState = (article = {}) => {
  const candidates = [
    article.activo,
    article.active,
    article.is_active,
    article.estado,
    article.status,
    article.habilitado,
    article.enabled,
  ];

  for (const candidate of candidates) {
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

const getRecordActorLabel = (record = {}) => {
  const idCandidates = [
    record.modificado_por,
    record.creado_por,
    record.actor_id,
    record.admin_id,
    record.user_id,
    record.usuario_id,
  ];

  let actorId = null;

  for (const candidate of idCandidates) {
    const normalized = normalizeActorId(candidate);

    if (normalized !== null && normalized !== undefined) {
      actorId = normalized;
      break;
    }
  }

  const nameCandidates = [
    record.modificado_por_nombre,
    record.creado_por_nombre,
    record.actor_nombre,
    record.actor_name,
    record.admin_name,
    record.usuario,
    record.user_name,
  ];

  let actorName = null;

  for (const candidate of nameCandidates) {
    const normalized = normalizeActorName(candidate);

    if (normalized) {
      actorName = normalized;
      break;
    }
  }

  return formatActorLabel(actorId, actorName);
};

const pickRecordIdentifier = (record = {}, keys = [], fallbackLabel = '') => {
  for (const key of keys) {
    const value = record?.[key];

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed) {
        return trimmed;
      }

      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  if (fallbackLabel) {
    if (record?.id !== undefined && record?.id !== null) {
      return `${fallbackLabel} ${record.id}`;
    }

    return fallbackLabel;
  }

  return '—';
};

const buildDashboardActivities = ({
  facturas = [],
  ordenes = [],
  articulos = [],
  terceros = [],
} = {}) => {
  const activities = [];

  const addActivity = (activity) => {
    if (!activity || !activity.fecha) {
      return;
    }

    activities.push(activity);
  };

  facturas.forEach((factura) => {
    const fecha =
      parseRecordDate(factura, [
        'modificado_en',
        'fecha',
        'fecha_emision',
        'fecha_factura',
        'creado_en',
        'creado_el',
        'created_at',
      ]) || parseRecordDate(factura, ['updated_at']);

    if (!fecha) {
      return;
    }

    const status =
      typeof factura.estado === 'string' ? factura.estado.trim().toLowerCase() : '';

    const accion = status === 'anulada' ? 'Factura anulada' : 'Factura emitida';
    const detalle = pickRecordIdentifier(
      factura,
      ['numero', 'num_factura', 'consecutivo', 'codigo', 'referencia', 'id', 'factura_id'],
      'Factura'
    );

    addActivity({
      fecha: fecha.toISOString(),
      usuario: getRecordActorLabel(factura) ?? '—',
      modulo: 'Ventas',
      accion,
      detalle,
    });
  });

  ordenes.forEach((orden) => {
    const fecha =
      parseRecordDate(orden, [
        'modificado_en',
        'fecha_orden',
        'fecha',
        'creado_en',
        'creado_el',
        'created_at',
      ]) || parseRecordDate(orden, ['updated_at']);

    if (!fecha) {
      return;
    }

    const detalle = pickRecordIdentifier(
      orden,
      ['numero', 'numero_orden', 'codigo', 'orden', 'referencia', 'id', 'orden_id'],
      'Orden'
    );

    const accion = 'Orden registrada';

    addActivity({
      fecha: fecha.toISOString(),
      usuario: getRecordActorLabel(orden) ?? '—',
      modulo: 'Compras',
      accion,
      detalle,
    });
  });

  articulos.forEach((articulo) => {
    const fecha =
      parseRecordDate(articulo, ['modificado_en', 'creado_en', 'created_at', 'updated_at']) ?? null;

    if (!fecha) {
      return;
    }

    const createdIso = parseDateToIso(articulo.creado_en ?? articulo.created_at);
    const modifiedIso = parseDateToIso(articulo.modificado_en ?? articulo.updated_at);

    let accion = 'Artículo registrado';

    if (createdIso && modifiedIso && createdIso !== modifiedIso) {
      accion = 'Artículo actualizado';
    }

    const detalle = pickRecordIdentifier(
      articulo,
      ['codigo', 'nombre', 'descripcion_corta', 'descripcion', 'id'],
      'Artículo'
    );

    addActivity({
      fecha: fecha.toISOString(),
      usuario: getRecordActorLabel(articulo) ?? '—',
      modulo: 'Maestros',
      accion,
      detalle,
    });
  });

  terceros.forEach((tercero) => {
    const fecha =
      parseRecordDate(tercero, ['modificado_en', 'creado_en', 'created_at', 'updated_at']) ?? null;

    if (!fecha) {
      return;
    }

    const createdIso = parseDateToIso(tercero.creado_en ?? tercero.created_at);
    const modifiedIso = parseDateToIso(tercero.modificado_en ?? tercero.updated_at);

    let accion = 'Tercero registrado';

    if (createdIso && modifiedIso && createdIso !== modifiedIso) {
      accion = 'Tercero actualizado';
    }

    const detalle = pickRecordIdentifier(
      tercero,
      [
        'nombre_comercial',
        'razon_social',
        'nombre',
        'identificacion_fiscal',
        'identificacion',
        'nit',
        'id',
      ],
      'Tercero'
    );

    addActivity({
      fecha: fecha.toISOString(),
      usuario: getRecordActorLabel(tercero) ?? '—',
      modulo: 'Maestros',
      accion,
      detalle,
    });
  });

  activities.sort((a, b) => {
    const dateA = new Date(a.fecha);
    const dateB = new Date(b.fecha);

    return dateB - dateA;
  });

  return activities.slice(0, 8);
};

const extractInvoiceTotalForDashboard = (record = {}) => {
  const candidates = [
    record.total,
    record.monto_total,
    record.totalFactura,
    record.montoTotal,
    record.total_general,
    record.totalGeneral,
  ];

  for (const candidate of candidates) {
    const numeric = coerceToNumberOrNull(candidate);

    if (numeric !== null) {
      return numeric;
    }
  }

  const subtotal = coerceToNumberOrNull(
    record.sub_total ?? record.subtotal ?? record.subTotal ?? record.base ?? record.base_imponible
  );
  const impuestos = coerceToNumberOrNull(
    record.total_impuestos ?? record.totalImpuestos ?? record.impuestos ?? record.tax ?? record.taxes
  );

  if (subtotal !== null || impuestos !== null) {
    return (subtotal ?? 0) + (impuestos ?? 0);
  }

  return null;
};

const extractPurchaseOrderTotalForDashboard = (record = {}) => {
  const candidates = [
    record.total,
    record.monto_total,
    record.total_orden,
    record.totalOrden,
    record.total_general,
    record.totalGeneral,
  ];

  for (const candidate of candidates) {
    const numeric = coerceToNumberOrNull(candidate);

    if (numeric !== null) {
      return numeric;
    }
  }

  const subtotal = coerceToNumberOrNull(record.sub_total ?? record.subtotal ?? record.subTotal);
  const impuestos = coerceToNumberOrNull(
    record.total_impuestos ?? record.totalImpuestos ?? record.impuestos ?? record.tax ?? record.taxes
  );

  if (subtotal !== null || impuestos !== null) {
    return (subtotal ?? 0) + (impuestos ?? 0);
  }

  return null;
};

const computeArticlesSummary = (records = []) => {
  let total = 0;
  let activos = 0;
  let inactivos = 0;

  for (const record of records) {
    total += 1;

    if (interpretArticuloActiveState(record)) {
      activos += 1;
    } else {
      inactivos += 1;
    }
  }

  return { total, activos, inactivos };
};

const DEFAULT_DASHBOARD_CURRENCY = process.env.DEFAULT_CURRENCY || 'USD';

const fetchTableData = async (table, { limit = 500 } = {}) => {
  try {
    let query = supabaseClient.from(table).select('*');

    if (limit !== null && Number.isFinite(limit)) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        console.warn(`Dashboard summary warning: table ${table} is not available.`);
        return [];
      }

      throw error;
    }

    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err?.code === '42P01') {
      console.warn(`Dashboard summary warning: table ${table} is not available.`);
      return [];
    }

    throw err;
  }
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
app.use(createRequestLogger());

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

const dashboardRouter = express.Router();

dashboardRouter.use(ensureSupabaseConfigured);

dashboardRouter.get('/resumen', async (_req, res) => {
  try {
    const [facturas, ordenes, articulos, terceros] = await Promise.all([
      fetchTableData(FACTURAS_VENTA_TABLE),
      fetchTableData(ORDENES_COMPRA_TABLE),
      fetchTableData(ARTICULOS_TABLE),
      fetchTableData(TERCEROS_TABLE),
    ]);

    const now = new Date();

    const ingresos = computeMonthlySummary(facturas, {
      dateColumns: ['fecha', 'fecha_emision', 'fecha_factura', 'creado_en', 'creado_el', 'created_at'],
      valueExtractor: extractInvoiceTotalForDashboard,
      now,
    });

    const gastos = computeMonthlySummary(ordenes, {
      dateColumns: ['fecha_orden', 'fecha', 'creado_en', 'creado_el', 'created_at'],
      valueExtractor: extractPurchaseOrderTotalForDashboard,
      now,
    });

    const articulosResumen = computeArticlesSummary(articulos);
    const actividades = buildDashboardActivities({ facturas, ordenes, articulos, terceros });

    return res.json({
      generatedAt: new Date().toISOString(),
      currency: DEFAULT_DASHBOARD_CURRENCY,
      resumen: {
        ingresos,
        gastos,
        articulos: articulosResumen,
      },
      actividades,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while building dashboard summary.', err));
  }
});

const financialAnalyticsRouter = express.Router();

financialAnalyticsRouter.use(ensureSupabaseConfigured);

const differenceInDays = (laterDate, earlierDate) => {
  if (!laterDate || !earlierDate) {
    return 0;
  }

  const later = new Date(laterDate);
  const earlier = new Date(earlierDate);

  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) {
    return 0;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = later.setHours(0, 0, 0, 0) - earlier.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor(diff / msPerDay));
};

financialAnalyticsRouter.get('/antiguedad', async (req, res) => {
  const cutoffParam =
    req.query?.fechaCorte ?? req.query?.fecha_corte ?? req.query?.fecha ?? req.query?.cutoff ?? null;
  const searchParam = req.query?.search ?? req.query?.q ?? req.query?.query ?? '';

  const cutoffIso = parseDateToIso(cutoffParam) ?? new Date().toISOString();
  const cutoffDate = new Date(cutoffIso);

  if (Number.isNaN(cutoffDate.getTime())) {
    return res.status(400).json({ message: 'La fecha de corte especificada no es válida.' });
  }

  try {
    const [facturas, terceros] = await Promise.all([
      fetchTableData(FACTURAS_VENTA_TABLE, { limit: null }),
      fetchTableData(TERCEROS_TABLE, { limit: null }),
    ]);

    const clientLookup = new Map();

    const addClientsToLookup = (records = []) => {
      for (const record of records ?? []) {
        const key = buildThirdPartyLookupKey(record);

        if (key) {
          clientLookup.set(key, record);
        }
      }
    };

    addClientsToLookup(terceros);

    const invoiceEntries = facturas.map((factura) => {
      const rawClientIdentifier = extractInvoiceClientIdentifier(factura);
      const normalizedClientIdentifier = normalizeIdentifier(rawClientIdentifier);
      const clientKey =
        normalizedClientIdentifier !== null && normalizedClientIdentifier !== undefined
          ? String(normalizedClientIdentifier)
          : null;

      if (clientKey && !clientLookup.has(clientKey) && factura?.cliente) {
        const maybeKey = buildThirdPartyLookupKey(factura.cliente);

        if (maybeKey) {
          clientLookup.set(maybeKey, factura.cliente);
        }
      }

      return {
        factura,
        clientKey,
        normalizedClientIdentifier,
      };
    });

    const { totals: paymentTotalsByInvoice } = await buildInvoicePaymentAggregates(
      invoiceEntries.map((entry) => entry.factura)
    );

    const agingByClient = new Map();

    for (const { factura, clientKey, normalizedClientIdentifier } of invoiceEntries) {
      const facturaId =
        coerceToNumericId(factura?.id) ?? coerceToNumericId(factura?.factura_id) ??
        coerceToNumericId(factura?.invoice_id) ??
        coerceToNumericId(factura?.invoiceId);

      const totalFactura = resolveInvoiceTotal(factura);
      const existingPaid = resolveInvoiceExistingPaid(factura);
      const aggregatedPaid =
        facturaId !== null && paymentTotalsByInvoice.has(facturaId)
          ? paymentTotalsByInvoice.get(facturaId) ?? 0
          : existingPaid;
      const saldoPendiente = roundCurrency(Math.max(0, totalFactura - aggregatedPaid));

      if (!(saldoPendiente > 0)) {
        continue;
      }

      const clienteRecord =
        factura?.cliente ?? (clientKey && clientLookup.has(clientKey) ? clientLookup.get(clientKey) : null);

      const displayName = clienteRecord ? getThirdPartyDisplayName(clienteRecord) : 'Cliente sin identificar';
      const secondaryIdentifier = (() => {
        if (clienteRecord) {
          const preferred =
            clienteRecord.identificacion_fiscal ??
            clienteRecord.identificacion ??
            clienteRecord.nit ??
            clienteRecord.rfc ??
            clienteRecord.codigo;

          if (preferred !== undefined && preferred !== null) {
            return String(preferred);
          }
        }

        if (normalizedClientIdentifier !== null && normalizedClientIdentifier !== undefined) {
          return String(normalizedClientIdentifier);
        }

        if (facturaId !== null) {
          return `Factura ${facturaId}`;
        }

        return 'Sin identificador';
      })();

      const key = clientKey ?? secondaryIdentifier;

      if (!agingByClient.has(key)) {
        agingByClient.set(key, {
          id: key,
          nombre: displayName,
          identificador: secondaryIdentifier,
          totalPendiente: 0,
          bucket0a30: 0,
          bucket31a60: 0,
          bucket61a90: 0,
          bucketMas90: 0,
          vencido: 0,
          cantidadFacturas: 0,
          diasVencidosMaximos: 0,
          ultimaFactura: null,
        });
      }

      const entry = agingByClient.get(key);

      const dueDate = extractInvoiceDueDate(factura) ?? cutoffDate;
      const issueDate =
        parseRecordDate(factura, [
          'fecha',
          'fecha_emision',
          'fecha_factura',
          'creado_en',
          'creado_el',
          'created_at',
        ]) ?? dueDate;

      const daysOverdue = differenceInDays(cutoffDate, dueDate);

      if (daysOverdue <= 30) {
        entry.bucket0a30 = roundCurrency(entry.bucket0a30 + saldoPendiente);
      } else if (daysOverdue <= 60) {
        entry.bucket31a60 = roundCurrency(entry.bucket31a60 + saldoPendiente);
      } else if (daysOverdue <= 90) {
        entry.bucket61a90 = roundCurrency(entry.bucket61a90 + saldoPendiente);
      } else {
        entry.bucketMas90 = roundCurrency(entry.bucketMas90 + saldoPendiente);
      }

      entry.totalPendiente = roundCurrency(entry.totalPendiente + saldoPendiente);
      entry.cantidadFacturas += 1;
      entry.diasVencidosMaximos = Math.max(entry.diasVencidosMaximos, daysOverdue);

      if (!entry.ultimaFactura) {
        entry.ultimaFactura = {};
      }

      const shouldReplaceLastInvoice = (() => {
        if (!entry.ultimaFactura?.fechaVencimiento) {
          return true;
        }

        const currentDue = new Date(entry.ultimaFactura.fechaVencimiento);

        if (Number.isNaN(currentDue.getTime())) {
          return true;
        }

        if (!dueDate) {
          return false;
        }

        return dueDate >= currentDue;
      })();

      if (shouldReplaceLastInvoice) {
        entry.ultimaFactura = {
          folio:
            factura?.folio ??
            factura?.numero_factura ??
            factura?.numeroFactura ??
            factura?.consecutivo ??
            facturaId ??
            '—',
          fechaEmision: issueDate ? issueDate.toISOString() : null,
          fechaVencimiento: dueDate ? dueDate.toISOString() : null,
          saldoPendiente,
          diasVencidos: daysOverdue,
        };
      }
    }

    const searchTerm = typeof searchParam === 'string' ? searchParam.trim().toLowerCase() : '';

    const clientes = Array.from(agingByClient.values())
      .map((entry) => {
        const vencido = roundCurrency(entry.bucket61a90 + entry.bucketMas90);

        return {
          ...entry,
          totalPendiente: roundCurrency(entry.totalPendiente),
          bucket0a30: roundCurrency(entry.bucket0a30),
          bucket31a60: roundCurrency(entry.bucket31a60),
          bucket61a90: roundCurrency(entry.bucket61a90),
          bucketMas90: roundCurrency(entry.bucketMas90),
          vencido,
        };
      })
      .filter((entry) => {
        if (!searchTerm) {
          return true;
        }

        const haystack = `${entry.nombre ?? ''} ${entry.identificador ?? ''}`.toLowerCase();

        return haystack.includes(searchTerm);
      })
      .sort((a, b) => b.totalPendiente - a.totalPendiente);

    const totalPendiente = clientes.reduce((acc, entry) => roundCurrency(acc + entry.totalPendiente), 0);
    const totalVencido = clientes.reduce((acc, entry) => roundCurrency(acc + entry.vencido), 0);

    return res.json({
      generatedAt: new Date().toISOString(),
      fechaCorte: cutoffDate.toISOString(),
      currency: DEFAULT_DASHBOARD_CURRENCY,
      totalPendiente,
      resumen: {
        totalClientes: clientes.length,
        saldoVencido: totalVencido,
        saldoNoVencido: roundCurrency(Math.max(0, totalPendiente - totalVencido)),
      },
      clientes,
    });
  } catch (err) {
    console.error('Customer aging report error:', err);

    if (err?.code === '42P01' || err?.code === '42703') {
      return res.status(404).json({
        message: 'Las tablas necesarias para calcular la antigüedad de saldos no están configuradas.',
        details: err.message,
      });
    }

    return res
      .status(500)
      .json(
        formatUnexpectedErrorResponse(
          'Ocurrió un error inesperado al generar el reporte de antigüedad de saldos.',
          err
        )
      );
  }
});

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

    applyActorAuditFields(payload, actorId);

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

    applyActorAuditFields(payload, actorId, { includeCreated: false });

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
    const incoming = req.body ?? {};

    const actorId = extractActorId(req, incoming);
    const actorName = extractActorName(req, incoming);

    const payload = sanitizeArticuloPayloadForInsert(incoming);
    const numericActorId = coerceToNumericId(actorId);

    if (numericActorId !== null && !hasOwn(payload, 'created_by')) {
      payload.created_by = numericActorId;
    }

    if (actorName && !hasOwn(payload, 'created_by_name')) {
      payload.created_by_name = actorName;
    }

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

    const articulos = Array.isArray(data) ? data : [];
    const articuloIds = articulos
      .map((articulo) => normalizeIdentifier(articulo?.id))
      .filter((identifier) => identifier !== null && identifier !== undefined);

    const inventoryByArticle = new Map();

    if (articuloIds.length) {
      const { data: inventoryData, error: inventoryError } = await supabaseClient
        .from(INVENTARIO_ARTICULOS_TABLE)
        .select(
          'articulo_id, almacen_id, existencia, reservado, actualizado_en, ' +
            'almacenes:almacen_id(id, codigo, nombre, ubicacion)'
        )
        .in('articulo_id', articuloIds);

      if (inventoryError) {
        if (inventoryError.code === '42P01') {
          console.warn(
            'List articulos warning: inventario_articulos table is not available; inventory summary will be omitted.'
          );
        } else {
          console.error('List articulos inventory error:', inventoryError);
          return res
            .status(500)
            .json(
              formatUnexpectedErrorResponse(
                'Unexpected error while fetching articulos inventory details.',
                inventoryError
              )
            );
        }
      }

      for (const record of Array.isArray(inventoryData) ? inventoryData : []) {
        const articuloId = normalizeIdentifier(record?.articulo_id);

        if (articuloId === null || articuloId === undefined) {
          continue;
        }

        if (!inventoryByArticle.has(articuloId)) {
          inventoryByArticle.set(articuloId, {
            total_existencia: 0,
            total_reservado: 0,
            detalle: [],
          });
        }

        const warehouseData = record?.almacenes ?? {};
        const existencia = roundQuantity(record?.existencia ?? 0);
        const reservado = roundQuantity(record?.reservado ?? 0);

        const detailEntry = {
          almacen_id: normalizeIdentifier(record?.almacen_id),
          almacen_codigo: warehouseData?.codigo ?? null,
          almacen_nombre: warehouseData?.nombre ?? null,
          ubicacion: warehouseData?.ubicacion ?? null,
          existencia,
          reservado,
          actualizado_en: record?.actualizado_en ?? null,
        };

        const summary = inventoryByArticle.get(articuloId);
        summary.total_existencia = roundQuantity(summary.total_existencia + existencia);
        summary.total_reservado = roundQuantity(summary.total_reservado + reservado);
        summary.detalle.push(detailEntry);
      }
    }

    const enrichedArticulos = articulos.map((articulo) => {
      const articuloId = normalizeIdentifier(articulo?.id);

      if (articuloId === null || articuloId === undefined) {
        return articulo;
      }

      const summary = inventoryByArticle.get(articuloId);

      if (!summary) {
        return articulo;
      }

      const sortedDetail = [...summary.detalle].sort((a, b) => {
        const aHasLocation = Boolean(a?.ubicacion && String(a.ubicacion).trim());
        const bHasLocation = Boolean(b?.ubicacion && String(b.ubicacion).trim());

        if (aHasLocation !== bHasLocation) {
          return aHasLocation ? -1 : 1;
        }

        const aLocation = a?.ubicacion ? String(a.ubicacion).trim().toLowerCase() : '';
        const bLocation = b?.ubicacion ? String(b.ubicacion).trim().toLowerCase() : '';

        if (aLocation !== bLocation) {
          return aLocation.localeCompare(bLocation, 'es', { sensitivity: 'base' });
        }

        const aWarehouse = a?.almacen_nombre
          ? String(a.almacen_nombre).trim().toLowerCase()
          : a?.almacen_codigo
          ? String(a.almacen_codigo).trim().toLowerCase()
          : '';
        const bWarehouse = b?.almacen_nombre
          ? String(b.almacen_nombre).trim().toLowerCase()
          : b?.almacen_codigo
          ? String(b.almacen_codigo).trim().toLowerCase()
          : '';

        return aWarehouse.localeCompare(bWarehouse, 'es', { sensitivity: 'base' });
      });

      return {
        ...articulo,
        inventario_resumen: {
          total_existencia: summary.total_existencia,
          total_reservado: summary.total_reservado,
          detalle: sortedDetail,
        },
      };
    });

    return res.json(enrichedArticulos);
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

    applyActorAuditFields(updatesWithAudit, actorId, { includeCreated: false });

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

const extractInvoiceDueDate = (invoice = {}) => {
  const dueDateColumns = [
    'fecha_vencimiento',
    'fecha_vto',
    'fecha_venc',
    'fecha_vence',
    'fecha_limite_pago',
    'fecha_limite',
    'fecha_limite_factura',
    'due_date',
    'dueDate',
    'fecha_pago_limite',
  ];

  const fallbackColumns = [
    'fecha',
    'fecha_emision',
    'fecha_factura',
    'creado_en',
    'creado_el',
    'created_at',
  ];

  const dueDate = parseRecordDate(invoice, dueDateColumns);

  if (dueDate) {
    return dueDate;
  }

  return parseRecordDate(invoice, fallbackColumns);
};

const resolveInvoiceTotal = (invoice = {}) => {
  const candidates = [
    invoice?.pagos_resumen?.total_factura,
    invoice?.total,
    invoice?.total_factura,
    invoice?.monto_total,
    invoice?.importe_total,
    invoice?.gran_total,
    invoice?.total_general,
    invoice?.totalGeneral,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return roundCurrency(toNumber(candidate, 0));
    }
  }

  const subtotal = toNumber(
    invoice?.sub_total ?? invoice?.subtotal ?? invoice?.base ?? invoice?.valor_base ?? invoice?.total_base,
    null
  );
  const impuestos = toNumber(
    invoice?.total_impuestos ?? invoice?.totalImpuestos ?? invoice?.impuestos ?? invoice?.taxes,
    null
  );

  if (subtotal !== null || impuestos !== null) {
    return roundCurrency((subtotal ?? 0) + (impuestos ?? 0));
  }

  return 0;
};

const resolveInvoiceExistingPaid = (invoice = {}) => {
  const candidates = [
    invoice?.pagos_resumen?.total_pagado,
    invoice?.pagos?.total_pagado,
    invoice?.pagos?.totalPagado,
    invoice?.total_pagado,
    invoice?.monto_pagado,
    invoice?.total_abonado,
    invoice?.pagado,
    invoice?.monto_total_pagado,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return roundCurrency(toNumber(candidate, 0));
    }
  }

  return 0;
};

const buildInvoicePaymentAggregates = async (invoices = []) => {
  const invoiceNumericIds = new Set();

  for (const invoice of invoices) {
    const candidates = [invoice?.id, invoice?.factura_id, invoice?.invoice_id, invoice?.invoiceId];

    for (const candidate of candidates) {
      const normalized = coerceToNumericId(candidate);

      if (normalized !== null) {
        invoiceNumericIds.add(normalized);
      }
    }
  }

  const paymentTotalsByInvoice = new Map();
  const paymentCountsByInvoice = new Map();

  if (!invoiceNumericIds.size) {
    return { totals: paymentTotalsByInvoice, counts: paymentCountsByInvoice };
  }

  const invoiceIdsArray = Array.from(invoiceNumericIds);
  const paymentSelectColumns = [
    'id_factura, monto_pago, monto',
    'id_factura, monto_pago',
    'id_factura, monto',
    'id_factura',
  ];

  let pagosData = null;
  let pagosError = null;

  for (const columns of paymentSelectColumns) {
    const { data, error } = await supabaseClient
      .from(PAGOS_RECIBIDOS_TABLE)
      .select(columns)
      .in('id_factura', invoiceIdsArray);

    if (!error) {
      pagosData = data ?? [];
      pagosError = null;

      if (columns !== paymentSelectColumns[0]) {
        console.warn(`Invoice payment lookup fallback succeeded using columns: ${columns}`);
      }

      break;
    }

    if (error.code !== '42703') {
      pagosError = error;
      break;
    }

    pagosError = error;
  }

  if (pagosError) {
    throw pagosError;
  }

  for (const pago of pagosData ?? []) {
    const invoiceId = coerceToNumericId(pago?.id_factura);

    if (invoiceId === null) {
      continue;
    }

    const amount = roundCurrency(toNumber(pago?.monto_pago ?? pago?.monto ?? 0, 0));
    const accumulated = paymentTotalsByInvoice.get(invoiceId) ?? 0;

    paymentTotalsByInvoice.set(invoiceId, roundCurrency(accumulated + amount));
    paymentCountsByInvoice.set(invoiceId, (paymentCountsByInvoice.get(invoiceId) ?? 0) + 1);
  }

  return { totals: paymentTotalsByInvoice, counts: paymentCountsByInvoice };
};

facturasRouter.get('/', async (_req, res) => {
  try {
    const { data: facturasData, error: facturasError } = await supabaseClient
      .from(FACTURAS_VENTA_TABLE)
      .select('*')
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false });

    if (facturasError) {
      console.error('Invoice list error:', facturasError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching invoices.', facturasError));
    }

    const facturas = Array.isArray(facturasData) ? facturasData : [];

    const invoiceEntries = facturas.map((factura) => {
      const rawClientIdentifier = extractInvoiceClientIdentifier(factura);
      const normalizedClientIdentifier = normalizeIdentifier(rawClientIdentifier);
      const clientKey =
        normalizedClientIdentifier !== null && normalizedClientIdentifier !== undefined
          ? String(normalizedClientIdentifier)
          : null;

      return {
        factura,
        clientKey,
        normalizedClientIdentifier,
      };
    });

    const numericClientIds = new Set();
    const stringClientIds = new Set();

    for (const entry of invoiceEntries) {
      if (entry.normalizedClientIdentifier === null || entry.normalizedClientIdentifier === undefined) {
        continue;
      }

      if (typeof entry.normalizedClientIdentifier === 'number') {
        numericClientIds.add(entry.normalizedClientIdentifier);
      } else if (typeof entry.normalizedClientIdentifier === 'string') {
        stringClientIds.add(entry.normalizedClientIdentifier);
      }
    }

    const clientLookup = new Map();

    const addClientsToLookup = (records = []) => {
      for (const record of records ?? []) {
        const key = buildThirdPartyLookupKey(record);

        if (key) {
          clientLookup.set(key, record);
        }
      }
    };

    const fetchClientsByColumn = async (column, values) => {
      if (!values.length) {
        return;
      }

      const { data, error } = await supabaseClient
        .from(TERCEROS_TABLE)
        .select('*')
        .in(column, values);

      if (error) {
        if (error.code === '42703') {
          console.warn(`Invoice list warning: column ${column} is not available on terceros table.`);
          return;
        }

        throw error;
      }

      addClientsToLookup(data);
    };

    try {
      const numericValues = Array.from(numericClientIds);
      const stringValues = Array.from(stringClientIds);

      if (numericValues.length) {
        await fetchClientsByColumn('id', numericValues);
        await fetchClientsByColumn('tercero_id', numericValues);
      }

      if (stringValues.length) {
        await fetchClientsByColumn('id', stringValues);
        await fetchClientsByColumn('tercero_id', stringValues);
        await fetchClientsByColumn('identificacion_fiscal', stringValues);
      }
    } catch (clientError) {
      console.error('Invoice list client lookup error:', clientError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching invoice customers.', clientError));
    }

    const enrichedFacturas = invoiceEntries.map((entry) => {
      if (entry.clientKey && clientLookup.has(entry.clientKey)) {
        return {
          ...entry.factura,
          cliente: clientLookup.get(entry.clientKey),
        };
      }

      return entry.factura;
    });

    const invoiceNumericIds = new Set();

    for (const factura of enrichedFacturas) {
      const candidates = [factura?.id, factura?.factura_id];

      for (const candidate of candidates) {
        const normalized = coerceToNumericId(candidate);

        if (normalized !== null) {
          invoiceNumericIds.add(normalized);
        }
      }
    }

    const paymentTotalsByInvoice = new Map();
    const paymentCountsByInvoice = new Map();

    if (invoiceNumericIds.size) {
      const invoiceIdsArray = Array.from(invoiceNumericIds);
      const paymentSelectColumns = [
        'id_factura, monto_pago, monto',
        'id_factura, monto_pago',
        'id_factura, monto',
        'id_factura',
      ];

      let pagosData = null;
      let pagosError = null;

      for (const columns of paymentSelectColumns) {
        const { data, error } = await supabaseClient
          .from(PAGOS_RECIBIDOS_TABLE)
          .select(columns)
          .in('id_factura', invoiceIdsArray);

        if (!error) {
          pagosData = data;
          pagosError = null;

          if (columns !== paymentSelectColumns[0]) {
            console.warn(
              `Invoice list payments lookup fallback succeeded using columns: ${columns}`
            );
          }

          break;
        }

        if (error.code !== '42703') {
          pagosError = error;
          break;
        }

        pagosError = error;
      }

      if (pagosError) {
        console.error('Invoice list payments lookup error:', pagosError);
        return res
          .status(500)
          .json(
            formatUnexpectedErrorResponse(
              'Unexpected error while fetching invoice payment summaries.',
              pagosError
            )
          );
      }

      for (const pago of pagosData ?? []) {
        const invoiceId = coerceToNumericId(pago?.id_factura);

        if (invoiceId === null) {
          continue;
        }

        const amount = roundCurrency(toNumber(pago?.monto_pago ?? pago?.monto ?? 0, 0));
        const accumulated = paymentTotalsByInvoice.get(invoiceId) ?? 0;

        paymentTotalsByInvoice.set(invoiceId, roundCurrency(accumulated + amount));
        paymentCountsByInvoice.set(invoiceId, (paymentCountsByInvoice.get(invoiceId) ?? 0) + 1);
      }
    }

    const facturasConPagos = enrichedFacturas.map((factura) => {
      const facturaId =
        coerceToNumericId(factura?.id) ?? coerceToNumericId(factura?.factura_id);

      const totalFactura = roundCurrency(
        toNumber(
          factura?.total ??
            factura?.total_factura ??
            factura?.monto_total ??
            factura?.importe_total ??
            factura?.gran_total ??
            0,
          0
        )
      );

      const paidCandidates = [
        factura?.pagos_resumen?.total_pagado,
        factura?.pagos?.total_pagado,
        factura?.pagos?.totalPagado,
        factura?.total_pagado,
        factura?.monto_pagado,
        factura?.total_abonado,
        factura?.pagado,
        factura?.monto_total_pagado,
      ];

      let existingPaid = 0;

      for (const candidate of paidCandidates) {
        if (candidate !== undefined && candidate !== null) {
          existingPaid = roundCurrency(toNumber(candidate, 0));
          break;
        }
      }

      const hasAggregatedPayments =
        facturaId !== null && paymentTotalsByInvoice.has(facturaId);
      const totalPagado = hasAggregatedPayments
        ? paymentTotalsByInvoice.get(facturaId) ?? 0
        : existingPaid;
      const cantidadPagos = hasAggregatedPayments
        ? paymentCountsByInvoice.get(facturaId) ?? 0
        : 0;
      const saldoPendiente = roundCurrency(Math.max(0, totalFactura - totalPagado));

      const facturaConPagos = {
        ...factura,
        pagos_resumen: {
          total_factura: totalFactura,
          total_pagado: totalPagado,
          saldo_pendiente: saldoPendiente,
          cantidad_pagos: cantidadPagos,
        },
      };

      if (facturaConPagos.total_pagado === undefined || facturaConPagos.total_pagado === null) {
        facturaConPagos.total_pagado = totalPagado;
      }

      if (facturaConPagos.monto_pagado === undefined || facturaConPagos.monto_pagado === null) {
        facturaConPagos.monto_pagado = totalPagado;
      }

      if (facturaConPagos.saldo_pendiente === undefined || facturaConPagos.saldo_pendiente === null) {
        facturaConPagos.saldo_pendiente = saldoPendiente;
      }

      if (facturaConPagos.saldoPendiente === undefined || facturaConPagos.saldoPendiente === null) {
        facturaConPagos.saldoPendiente = saldoPendiente;
      }

      return facturaConPagos;
    });

    return res.json({
      facturas: facturasConPagos,
      total: facturasConPagos.length,
    });
  } catch (err) {
    console.error('Unhandled invoice list error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching invoices.', err));
  }
});

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
        .select('id, existencia, nombre, codigo, descripcion, precio, unidad, activo')
        .in('id', articuloIds);

      if (byIdError && byIdError.code !== 'PGRST116' && byIdError.code !== 'PGRST204') {
        console.error('Invoice emission inventory lookup error (id):', byIdError);
      } else if (byIdData) {
        articulosData = byIdData;
      }

      const knownKeys = new Set();

      for (const articulo of articulosData ?? []) {
        const primaryId = articulo?.id;

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
        console.warn(
          'Invoice emission inventory lookup warning: some requested articles were not found by id.',
          missingKeys
        );
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

        if (!line.descripcion || !line.descripcion.trim()) {
          const descriptionCandidates = [
            article.descripcion,
            article.nombre,
            article.codigo,
          ];

          const descriptionCandidate = descriptionCandidates.find(
            (candidate) => typeof candidate === 'string' && candidate.trim()
          );

          if (descriptionCandidate) {
            line.descripcion = descriptionCandidate.trim();
          }
        }

        const rawArticlePrice =
          article?.precio ?? article?.precio_unitario ?? article?.precioUnitario ?? null;

        if (
          (line.precioUnitario === null || line.precioUnitario === undefined || line.precioUnitario <= 0) &&
          rawArticlePrice !== null &&
          rawArticlePrice !== undefined
        ) {
          const normalizedPrice = roundCurrency(rawArticlePrice);

          if (normalizedPrice > 0) {
            line.precioUnitario = normalizedPrice;
            line.subtotal = roundCurrency(line.cantidad * line.precioUnitario);
            line.total = roundCurrency(line.subtotal + line.impuestos);
          }
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

    applyActorAuditFields(headerPayload, actorId);

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

      applyActorAuditFields(detail, actorId, { includeUpdated: false });

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

          applyActorAuditFields(revertPayload, actorId, { includeCreated: false });

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

      applyActorAuditFields(updatePayload, actorId, { includeCreated: false });

      const identifierValue = article.id;

      if (identifierValue === undefined || identifierValue === null) {
        console.error(
          'Invoice emission: unable to update stock for articulo without an id.',
          article
        );
        await revertStockChanges(stockAdjustments);
        await rollbackInvoiceRecords(facturaId);
        return res
          .status(500)
          .json(
            formatUnexpectedErrorResponse(
              'Unexpected error while updating inventory: artículo sin identificador.',
              new Error('Missing articulo id')
            )
          );
      }

      const { data: updatedArticle, error: stockError } = await supabaseClient
        .from(ARTICULOS_TABLE)
        .update(updatePayload)
        .eq('id', identifierValue)
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
        identifierColumn: 'id',
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

const almacenesRouter = express.Router();

almacenesRouter.use(ensureSupabaseConfigured);

almacenesRouter.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from(ALMACENES_TABLE)
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        console.warn('Warehouse list warning: almacenes table is not available yet.');
        return res.json({ almacenes: [], total: 0, fetched_at: new Date().toISOString() });
      }

      console.error('Warehouse list error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching warehouses.', error));
    }

    const almacenes = Array.isArray(data) ? data : [];

    console.info(`Warehouse list success: returned ${almacenes.length} warehouse(s).`);

    return res.json({ almacenes, total: almacenes.length, fetched_at: new Date().toISOString() });
  } catch (err) {
    console.error('Unhandled warehouse list error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching warehouses.', err));
  }
});

almacenesRouter.post('/', async (req, res) => {
  try {
    const payload = req.body ?? {};

    const nombre = typeof payload.nombre === 'string' ? payload.nombre.trim() : '';

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre del almacén es obligatorio.' });
    }

    const actorId = extractActorId(req, payload);
    const actorName = extractActorName(req, payload);
    const timestamp = new Date().toISOString();

    const booleanCandidate =
      payload.activo ?? payload.active ?? payload.estado ?? payload.status ?? true;
    const activoNormalized = normalizeBoolean(booleanCandidate);

    const recordPayload = {
      codigo: typeof payload.codigo === 'string' && payload.codigo.trim() ? payload.codigo.trim() : null,
      nombre,
      ubicacion:
        typeof payload.ubicacion === 'string' && payload.ubicacion.trim()
          ? payload.ubicacion.trim()
          : null,
      descripcion:
        typeof payload.descripcion === 'string' && payload.descripcion.trim()
          ? payload.descripcion.trim()
          : null,
      notas: typeof payload.notas === 'string' && payload.notas.trim() ? payload.notas.trim() : null,
      activo: activoNormalized === null ? true : activoNormalized,
      creado_en: timestamp,
      actualizado_en: timestamp,
    };

    applyActorAuditFields(recordPayload, actorId);

    if (actorName) {
      if (!recordPayload.creado_por_nombre) {
        recordPayload.creado_por_nombre = actorName;
      }

      recordPayload.modificado_por_nombre = actorName;
    }

    const cleanedPayload = Object.fromEntries(
      Object.entries(recordPayload).filter(([, value]) => value !== undefined)
    );

    const { data, error } = await supabaseClient
      .from(ALMACENES_TABLE)
      .insert([cleanedPayload])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Warehouse creation error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating warehouse.', error));
    }

    const createdWarehouse = data ?? cleanedPayload;
    const identifier =
      createdWarehouse?.id ?? createdWarehouse?.codigo ?? createdWarehouse?.nombre ?? 'unknown';

    console.info(`Warehouse creation success: created warehouse ${identifier}.`);

    return res.status(201).json(createdWarehouse);
  } catch (err) {
    console.error('Unhandled warehouse creation error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while creating warehouse.', err));
  }
});

almacenesRouter.put('/:id', async (req, res) => {
  try {
    const { id: rawId } = req.params ?? {};
    const normalizedId = normalizeIdentifier(rawId);

    if (normalizedId === null || normalizedId === undefined) {
      return res.status(400).json({ message: 'El identificador del almacén no es válido.' });
    }

    const payload = req.body ?? {};
    const nombre = typeof payload.nombre === 'string' ? payload.nombre.trim() : '';

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre del almacén es obligatorio.' });
    }

    const timestamp = new Date().toISOString();
    const updates = {
      codigo: typeof payload.codigo === 'string' && payload.codigo.trim() ? payload.codigo.trim() : null,
      nombre,
      ubicacion:
        typeof payload.ubicacion === 'string' && payload.ubicacion.trim() ? payload.ubicacion.trim() : null,
      descripcion:
        typeof payload.descripcion === 'string' && payload.descripcion.trim() ? payload.descripcion.trim() : null,
      notas: typeof payload.notas === 'string' && payload.notas.trim() ? payload.notas.trim() : null,
      actualizado_en: timestamp,
    };

    const booleanCandidate = payload.activo ?? payload.active ?? payload.estado ?? payload.status;
    const activoNormalized = normalizeBoolean(booleanCandidate);

    if (activoNormalized !== null) {
      updates.activo = activoNormalized;
    }

    const actorId = extractActorId(req, payload);
    const actorName = extractActorName(req, payload);

    applyActorAuditFields(updates, actorId, { includeCreated: false });

    if (actorName) {
      updates.modificado_por_nombre = actorName;
    }

    const cleanedUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));

    if (!Object.keys(cleanedUpdates).length) {
      return res.status(400).json({ message: 'No se proporcionaron cambios para actualizar el almacén.' });
    }

    const { data, error } = await supabaseClient
      .from(ALMACENES_TABLE)
      .update([cleanedUpdates])
      .eq('id', normalizedId)
      .select();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'No se encontró el almacén solicitado.' });
      }

      console.error('Warehouse update error:', error);

      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while updating warehouse.', error));
    }

    const updatedWarehouse = Array.isArray(data) ? data[0] : data ?? null;

    if (!updatedWarehouse) {
      return res.status(404).json({ message: 'No se encontró el almacén solicitado.' });
    }

    console.info(`Warehouse update success: updated warehouse ${normalizedId}.`);

    return res.json(updatedWarehouse);
  } catch (err) {
    console.error('Unhandled warehouse update error:', err);

    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while updating warehouse.', err));
  }
});

const getRecordIdentifierKey = (value) => {
  const normalized = normalizeIdentifier(value);

  if (normalized === null || normalized === undefined) {
    return null;
  }

  return String(normalized);
};

const fetchPurchaseOrderDetail = async (orderId) => {
  const normalizedId = normalizeIdentifier(orderId);

  if (normalizedId === null || normalizedId === undefined) {
    return {
      order: null,
      lines: [],
      entries: [],
      entryLines: [],
      payments: [],
    };
  }

  const detail = {
    order: null,
    lines: [],
    entries: [],
    entryLines: [],
    payments: [],
  };

  const { data: orderData, error: orderError } = await supabaseClient
    .from(ORDENES_COMPRA_TABLE)
    .select('*')
    .eq('id', normalizedId)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  if (!orderData) {
    return detail;
  }

  detail.order = orderData;

  const { data: linesData, error: linesError } = await supabaseClient
    .from(LINEAS_ORDEN_COMPRA_TABLE)
    .select('*')
    .eq('id_orden', normalizedId);

  if (linesError) {
    if (linesError.code !== '42P01') {
      throw linesError;
    }
  } else if (Array.isArray(linesData)) {
    detail.lines = linesData;
  }

  const { data: entriesData, error: entriesError } = await supabaseClient
    .from(ENTRADAS_ALMACEN_TABLE)
    .select('*')
    .eq('orden_compra_id', normalizedId);

  if (entriesError) {
    if (entriesError.code !== '42P01') {
      throw entriesError;
    }
  } else if (Array.isArray(entriesData)) {
    detail.entries = entriesData;
  }

  const entryIds = (detail.entries ?? [])
    .map((entry) => normalizeIdentifier(entry?.id))
    .filter((identifier) => identifier !== null && identifier !== undefined);

  if (entryIds.length) {
    const { data: entryLinesData, error: entryLinesError } = await supabaseClient
      .from(LINEAS_ENTRADA_ALMACEN_TABLE)
      .select('*')
      .in('entrada_id', entryIds);

    if (entryLinesError) {
      if (entryLinesError.code !== '42P01') {
        throw entryLinesError;
      }
    } else if (Array.isArray(entryLinesData)) {
      detail.entryLines = entryLinesData;
    }
  }

  const { data: paymentsData, error: paymentsError } = await supabaseClient
    .from(PAGOS_PROVEEDORES_TABLE)
    .select('*')
    .eq('orden_compra_id', normalizedId);

  if (paymentsError) {
    if (paymentsError.code !== '42P01') {
      throw paymentsError;
    }
  } else if (Array.isArray(paymentsData)) {
    detail.payments = paymentsData;
  }

  return detail;
};

const buildPurchaseOrderComputedDetail = (detail) => {
  const orderRecord = detail?.order ?? null;
  const orderLines = Array.isArray(detail?.lines) ? detail.lines : [];
  const entryLines = Array.isArray(detail?.entryLines) ? detail.entryLines : [];
  const payments = Array.isArray(detail?.payments) ? detail.payments : [];

  const receivedByArticle = new Map();

  for (const entryLine of entryLines) {
    const articleKey = getRecordIdentifierKey(
      entryLine?.articulo_id ??
        entryLine?.id_articulo ??
        entryLine?.articuloId ??
        entryLine?.idArticulo ??
        entryLine?.linea_articulo_id
    );

    if (!articleKey) {
      continue;
    }

    const quantity = roundQuantity(
      entryLine?.cantidad ??
        entryLine?.cantidad_recibida ??
        entryLine?.quantity ??
        entryLine?.qty ??
        entryLine?.cantidadRecibida ??
        0
    );

    if (!(quantity > 0)) {
      continue;
    }

    const previous = receivedByArticle.get(articleKey) ?? 0;
    receivedByArticle.set(articleKey, roundQuantity(previous + quantity));
  }

  let totalOrdered = 0;
  let totalReceived = 0;

  const enrichedLines = orderLines.map((line) => {
    const articleKey = getRecordIdentifierKey(
      line?.articulo_id ?? line?.id_articulo ?? line?.articuloId ?? line?.idArticulo
    );

    const orderedQuantity = roundQuantity(
      line?.cantidad ??
        line?.cantidad_solicitada ??
        line?.cantidad_ordenada ??
        line?.quantity ??
        line?.qty ??
        0
    );

    const receivedQuantity = articleKey ? receivedByArticle.get(articleKey) ?? 0 : 0;
    const limitedReceived = Math.min(receivedQuantity, orderedQuantity);
    const pendingQuantity = Math.max(0, roundQuantity(orderedQuantity - limitedReceived));

    totalOrdered = roundQuantity(totalOrdered + orderedQuantity);
    totalReceived = roundQuantity(totalReceived + limitedReceived);

    return {
      ...line,
      articulo_key: articleKey,
      cantidad_ordenada: orderedQuantity,
      cantidad_recibida: roundQuantity(limitedReceived),
      cantidad_pendiente: roundQuantity(pendingQuantity),
    };
  });

  const totalPagado = payments.reduce((acc, payment) => {
    const amount = roundCurrency(
      payment?.monto_pagado ??
        payment?.monto ??
        payment?.amount ??
        payment?.montoPago ??
        0
    );

    return roundCurrency(acc + amount);
  }, 0);

  const orderTotal = roundCurrency(
    orderRecord?.total ??
      orderRecord?.monto_total ??
      orderRecord?.gran_total ??
      orderRecord?.total_orden ??
      orderRecord?.importe_total ??
      0
  );

  const saldoPendiente = roundCurrency(orderTotal - totalPagado);

  const recepcionCompleta =
    enrichedLines.length > 0 &&
    enrichedLines.every((line) => line.cantidad_pendiente <= 0.0001);

  return {
    order: orderRecord,
    lines: enrichedLines,
    entries: detail?.entries ?? [],
    entryLines,
    payments,
    resumen: {
      total_ordenado: roundQuantity(totalOrdered),
      total_recibido: roundQuantity(totalReceived),
      total_pendiente: roundQuantity(Math.max(0, totalOrdered - totalReceived)),
      recepcion_completa: recepcionCompleta,
    },
    pagos: {
      total_pagado: roundCurrency(totalPagado),
      saldo_pendiente: roundCurrency(Math.max(0, saldoPendiente)),
    },
  };
};

const entradasAlmacenRouter = express.Router();

entradasAlmacenRouter.use(ensureSupabaseConfigured);

entradasAlmacenRouter.get('/', async (_req, res) => {
  try {
    const { data: entriesData, error: entriesError } = await supabaseClient
      .from(ENTRADAS_ALMACEN_TABLE)
      .select('*')
      .order('fecha_entrada', { ascending: false })
      .order('creado_en', { ascending: false });

    if (entriesError) {
      if (entriesError.code === '42P01') {
        console.warn('Warehouse entries list warning: entradas_almacen table is not available yet.');
        return res.json({ entradas: [], total: 0, fetched_at: new Date().toISOString() });
      }

      console.error('Warehouse entries list error:', entriesError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while fetching warehouse entries.', entriesError));
    }

    const entradas = Array.isArray(entriesData) ? entriesData : [];
    const orderIds = entradas
      .map((entry) =>
        getRecordIdentifierKey(
          entry?.orden_compra_id ?? entry?.orden_id ?? entry?.order_id ?? entry?.ordenId ?? entry?.orderId
        )
      )
      .filter((identifier) => identifier !== null && identifier !== undefined);

    const uniqueOrderIds = Array.from(new Set(orderIds));
    const ordersById = new Map();

    if (uniqueOrderIds.length) {
      const { data: ordersData, error: ordersError } = await supabaseClient
        .from(ORDENES_COMPRA_TABLE)
        .select('id, numero_orden')
        .in('id', uniqueOrderIds);

      if (ordersError) {
        if (ordersError.code !== '42P01' && ordersError.code !== '42703') {
          throw ordersError;
        }
      } else if (Array.isArray(ordersData)) {
        for (const orderRecord of ordersData) {
          const key = getRecordIdentifierKey(orderRecord?.id);

          if (key) {
            ordersById.set(key, orderRecord);
          }
        }
      }
    }

    const entradaIds = entradas
      .map((entry) => normalizeIdentifier(entry?.id))
      .filter((identifier) => identifier !== null && identifier !== undefined);

    let lineas = [];

    if (entradaIds.length) {
      const { data: lineasData, error: lineasError } = await supabaseClient
        .from(LINEAS_ENTRADA_ALMACEN_TABLE)
        .select('*')
        .in('entrada_id', entradaIds);

      if (lineasError) {
        if (lineasError.code !== '42P01') {
          throw lineasError;
        }
      } else if (Array.isArray(lineasData)) {
        lineas = lineasData;
      }
    }

    const linesByEntry = new Map();

    for (const line of lineas) {
      const entryId = getRecordIdentifierKey(line?.entrada_id);

      if (!entryId) {
        continue;
      }

      if (!linesByEntry.has(entryId)) {
        linesByEntry.set(entryId, []);
      }

      linesByEntry.get(entryId).push(line);
    }

    const enrichedEntries = entradas.map((entry) => {
      const entryId = getRecordIdentifierKey(entry?.id);
      const relatedOrderId = getRecordIdentifierKey(
        entry?.orden_compra_id ?? entry?.orden_id ?? entry?.order_id ?? entry?.ordenId ?? entry?.orderId
      );
      const relatedOrder = relatedOrderId ? ordersById.get(relatedOrderId) ?? null : null;
      const orderNumber =
        relatedOrder?.numero_orden ?? entry?.orden_compra_numero ?? entry?.numero_orden ?? entry?.numeroOrden ?? null;
      const relatedLines = entryId ? linesByEntry.get(entryId) ?? [] : [];
      const totalArticulos = relatedLines.length;
      const totalCantidad = relatedLines.reduce((acc, line) => {
        const quantity = roundQuantity(
          line?.cantidad ?? line?.cantidad_recibida ?? line?.quantity ?? line?.qty ?? 0
        );

        return roundQuantity(acc + Math.max(0, quantity));
      }, 0);

      return {
        ...entry,
        numero_orden: orderNumber ?? entry?.numero_orden ?? null,
        orden_compra_numero: orderNumber ?? entry?.orden_compra_numero ?? null,
        total_lineas: totalArticulos,
        total_cantidad: totalCantidad,
      };
    });

    return res.json({
      entradas: enrichedEntries,
      total: enrichedEntries.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Unhandled warehouse entries list error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching warehouse entries.', err));
  }
});

entradasAlmacenRouter.post('/', async (req, res) => {
  const payload = req.body ?? {};

  try {
    const actorId = extractActorId(req, payload);
    const actorName = extractActorName(req, payload);

    const orderIdentifierRaw =
      payload.id_orden ??
      payload.idOrden ??
      payload.orden_id ??
      payload.ordenId ??
      payload.order_id ??
      payload.orderId ??
      null;
    const warehouseIdentifierRaw =
      payload.id_almacen ?? payload.almacen_id ?? payload.almacenId ?? payload.warehouse_id ?? null;

    const orderId = normalizeIdentifier(orderIdentifierRaw);
    const warehouseId = normalizeIdentifier(warehouseIdentifierRaw);

    if (orderId === null || orderId === undefined) {
      return res.status(400).json({ message: 'La orden de compra es obligatoria.' });
    }

    if (warehouseId === null || warehouseId === undefined) {
      return res.status(400).json({ message: 'Selecciona un almacén para registrar la entrada.' });
    }

    const lineItemsRaw = Array.isArray(payload.lineas) ? payload.lineas : payload.detalles ?? [];
    const lineItems = Array.isArray(lineItemsRaw)
      ? lineItemsRaw.filter((item) => item !== null && item !== undefined)
      : [];

    if (!lineItems.length) {
      return res.status(400).json({ message: 'La entrada debe incluir al menos una línea.' });
    }

    const orderDetail = await fetchPurchaseOrderDetail(orderId);

    if (!orderDetail.order) {
      return res.status(404).json({ message: 'La orden de compra no existe.' });
    }

    const computedDetail = buildPurchaseOrderComputedDetail(orderDetail);
    const lineLookup = new Map();

    for (const line of computedDetail.lines ?? []) {
      if (!line.articulo_key) {
        continue;
      }

      lineLookup.set(line.articulo_key, line);
    }

    const sanitizedLines = [];

    for (let index = 0; index < lineItems.length; index += 1) {
      const incomingLine = lineItems[index] ?? {};
      const articleKey = getRecordIdentifierKey(
        incomingLine?.articulo_id ??
          incomingLine?.id_articulo ??
          incomingLine?.articuloId ??
          incomingLine?.idArticulo
      );

      if (!articleKey) {
        return res.status(400).json({ message: `La línea ${index + 1} no tiene artículo asociado.` });
      }

      if (!lineLookup.has(articleKey)) {
        return res.status(400).json({
          message: `El artículo de la línea ${index + 1} no corresponde a la orden de compra seleccionada.`,
        });
      }

      const targetLine = lineLookup.get(articleKey);
      const quantity = roundQuantity(
        incomingLine?.cantidad ??
          incomingLine?.cantidad_recibida ??
          incomingLine?.quantity ??
          incomingLine?.qty ??
          incomingLine?.cantidadRecibida ??
          0
      );

      if (!(quantity > 0)) {
        return res.status(400).json({
          message: `La cantidad de la línea ${index + 1} debe ser mayor a cero.`,
        });
      }

      if (quantity > targetLine.cantidad_pendiente + 0.0001) {
        return res.status(400).json({
          message: `La cantidad de la línea ${index + 1} excede lo pendiente por recibir.`,
          cantidadPendiente: targetLine.cantidad_pendiente,
        });
      }

      const unitCost = roundCurrency(
        incomingLine?.costo_unitario ??
          incomingLine?.precio_unitario ??
          incomingLine?.precioUnitario ??
          targetLine?.precio_unitario ??
          targetLine?.precioUnitario ??
          0
      );

      sanitizedLines.push({
        articulo_key: articleKey,
        articulo_id: targetLine?.articulo_id ?? targetLine?.id_articulo ?? null,
        cantidad: quantity,
        costo_unitario: unitCost,
        linea_orden_id: targetLine?.id ?? targetLine?.linea_id ?? null,
        descripcion:
          typeof incomingLine?.descripcion === 'string' && incomingLine.descripcion.trim()
            ? incomingLine.descripcion.trim()
            : targetLine?.descripcion ?? null,
      });
    }

    if (!sanitizedLines.length) {
      return res.status(400).json({ message: 'No hay líneas válidas para registrar.' });
    }

    const timestamp = new Date().toISOString();
    const entryPayload = {
      orden_compra_id: orderId,
      almacen_id: warehouseId,
      fecha_entrada: parseDateToIso(payload.fecha_entrada ?? payload.fechaEntrada) ?? timestamp,
      notas: typeof payload.notas === 'string' && payload.notas.trim() ? payload.notas.trim() : null,
      registrado_por: formatActorLabel(actorId, actorName),
      creado_en: timestamp,
      actualizado_en: timestamp,
    };

    applyActorAuditFields(entryPayload, actorId);

    if (actorName) {
      if (!entryPayload.creado_por_nombre) {
        entryPayload.creado_por_nombre = actorName;
      }

      entryPayload.modificado_por_nombre = actorName;
    }

    const cleanedEntryPayload = Object.fromEntries(
      Object.entries(entryPayload).filter(([, value]) => value !== undefined)
    );

    const { data: entryData, error: entryError } = await supabaseClient
      .from(ENTRADAS_ALMACEN_TABLE)
      .insert([cleanedEntryPayload])
      .select()
      .maybeSingle();

    if (entryError) {
      console.error('Warehouse entry creation error:', entryError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating warehouse entry.', entryError));
    }

    const entryId = normalizeIdentifier(entryData?.id) ?? null;

    if (entryId === null || entryId === undefined) {
      console.error('Warehouse entry creation error: unable to determine entry identifier.', entryData);
      return res.status(500).json({
        message: 'No fue posible determinar el identificador de la entrada de almacén.',
      });
    }

    const linePayloads = sanitizedLines.map((line) => {
      const subtotal = roundCurrency(line.cantidad * line.costo_unitario);

      const detailPayload = {
        entrada_id: entryId,
        orden_compra_id: orderId,
        articulo_id: line.articulo_id ?? null,
        cantidad: line.cantidad,
        costo_unitario: line.costo_unitario,
        subtotal,
        descripcion: line.descripcion,
        linea_orden_id: line.linea_orden_id,
        creado_en: timestamp,
        actualizado_en: timestamp,
      };

      applyActorAuditFields(detailPayload, actorId);

      if (actorName) {
        if (!detailPayload.creado_por_nombre) {
          detailPayload.creado_por_nombre = actorName;
        }

        detailPayload.modificado_por_nombre = actorName;
      }

      return Object.fromEntries(Object.entries(detailPayload).filter(([, value]) => value !== undefined));
    });

    const { data: entryLinesData, error: entryLinesError } = await supabaseClient
      .from(LINEAS_ENTRADA_ALMACEN_TABLE)
      .insert(linePayloads)
      .select();

    if (entryLinesError) {
      console.error('Warehouse entry lines insertion error:', entryLinesError);
      await supabaseClient.from(ENTRADAS_ALMACEN_TABLE).delete().eq('id', entryId);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating warehouse entry lines.', entryLinesError));
    }

    const stockAdjustments = [];
    const articleExistenceAdjustments = [];

    const revertStockAdjustments = async () => {
      for (const adjustment of stockAdjustments.slice().reverse()) {
        try {
          const revertPayload = {
            articulo_id: adjustment.articuloId,
            almacen_id: adjustment.almacenId,
            existencia: adjustment.previousExistence,
            actualizado_en: timestamp,
          };

          applyActorAuditFields(revertPayload, actorId, { includeCreated: false });

          if (actorName) {
            revertPayload.modificado_por_nombre = actorName;
          }

          await supabaseClient
            .from(INVENTARIO_ARTICULOS_TABLE)
            .upsert([revertPayload], { onConflict: 'articulo_id,almacen_id' });
        } catch (revertError) {
          console.error('Warehouse entry revert stock error:', revertError);
        }
      }
    };

    const revertArticleExistenceAdjustments = async () => {
      for (const adjustment of articleExistenceAdjustments.slice().reverse()) {
        try {
          const revertPayload = {
            existencia: adjustment.previousExistence,
            actualizado_en: timestamp,
          };

          applyActorAuditFields(revertPayload, actorId, { includeCreated: false });

          if (actorName) {
            revertPayload.modificado_por_nombre = actorName;
          }

          const cleanedPayload = Object.fromEntries(
            Object.entries(revertPayload).filter(([, value]) => value !== undefined)
          );

          await supabaseClient.from(ARTICULOS_TABLE).update(cleanedPayload).eq('id', adjustment.articuloId);
        } catch (revertError) {
          console.error('Warehouse entry revert article existence error:', revertError);
        }
      }
    };

    const revertAllAdjustments = async () => {
      await revertArticleExistenceAdjustments();
      await revertStockAdjustments();
    };

    try {
      for (const line of sanitizedLines) {
        const articuloId = normalizeIdentifier(line.articulo_id) ?? null;

        if (articuloId === null || articuloId === undefined) {
          continue;
        }

        let previousExistence = 0;
        let existingStockId = null;

        const { data: stockRecord, error: stockLookupError } = await supabaseClient
          .from(INVENTARIO_ARTICULOS_TABLE)
          .select('id, existencia')
          .eq('articulo_id', articuloId)
          .eq('almacen_id', warehouseId)
          .maybeSingle();

        if (stockLookupError && stockLookupError.code !== 'PGRST116' && stockLookupError.code !== 'PGRST204') {
          throw stockLookupError;
        }

        if (stockRecord) {
          previousExistence = roundQuantity(stockRecord.existencia ?? 0);
          existingStockId = stockRecord.id ?? null;
        }

        const newExistence = roundQuantity(previousExistence + line.cantidad);

        const stockPayload = {
          articulo_id: articuloId,
          almacen_id: warehouseId,
          existencia: newExistence,
          actualizado_en: timestamp,
        };

        applyActorAuditFields(stockPayload, actorId);

        if (actorName) {
          if (!stockPayload.creado_por_nombre) {
            stockPayload.creado_por_nombre = actorName;
          }

          stockPayload.modificado_por_nombre = actorName;
        }

        if (existingStockId !== null && existingStockId !== undefined) {
          stockPayload.id = existingStockId;
        }

        const { data: stockData, error: stockError } = await supabaseClient
          .from(INVENTARIO_ARTICULOS_TABLE)
          .upsert([stockPayload], { onConflict: 'articulo_id,almacen_id' })
          .select()
          .maybeSingle();

        if (stockError) {
          throw stockError;
        }

        const updatedStockId = normalizeIdentifier(stockData?.id) ?? existingStockId;

        stockAdjustments.push({
          articuloId,
          almacenId: warehouseId,
          previousExistence,
          stockId: updatedStockId,
        });
      }

      const articleIdsToRefresh = Array.from(
        new Set(
          stockAdjustments
            .map((adjustment) => normalizeIdentifier(adjustment.articuloId))
            .filter((identifier) => identifier !== null && identifier !== undefined)
        )
      );

      if (articleIdsToRefresh.length) {
        const { data: existingArticles, error: existingArticlesError } = await supabaseClient
          .from(ARTICULOS_TABLE)
          .select('id, existencia')
          .in('id', articleIdsToRefresh);

        if (existingArticlesError) {
          throw existingArticlesError;
        }

        const previousExistenceMap = new Map();

        for (const record of Array.isArray(existingArticles) ? existingArticles : []) {
          const recordId = normalizeIdentifier(record?.id);

          if (recordId === null || recordId === undefined) {
            continue;
          }

          previousExistenceMap.set(recordId, roundQuantity(record?.existencia ?? 0));
        }

        const { data: inventoryTotals, error: inventoryTotalsError } = await supabaseClient
          .from(INVENTARIO_ARTICULOS_TABLE)
          .select('articulo_id, existencia')
          .in('articulo_id', articleIdsToRefresh);

        if (inventoryTotalsError) {
          throw inventoryTotalsError;
        }

        const totalsByArticle = new Map();

        for (const record of Array.isArray(inventoryTotals) ? inventoryTotals : []) {
          const recordArticleId = normalizeIdentifier(record?.articulo_id);

          if (recordArticleId === null || recordArticleId === undefined) {
            continue;
          }

          const previousTotal = totalsByArticle.get(recordArticleId) ?? 0;
          const newTotal = roundQuantity(previousTotal + roundQuantity(record?.existencia ?? 0));
          totalsByArticle.set(recordArticleId, newTotal);
        }

        for (const articleId of articleIdsToRefresh) {
          const totalExistencia = roundQuantity(totalsByArticle.get(articleId) ?? 0);
          const previousExistence = previousExistenceMap.has(articleId)
            ? previousExistenceMap.get(articleId)
            : null;

          const updatePayload = {
            existencia: totalExistencia,
            actualizado_en: timestamp,
          };

          applyActorAuditFields(updatePayload, actorId, { includeCreated: false });

          if (actorName) {
            updatePayload.modificado_por_nombre = actorName;
          }

          const cleanedPayload = Object.fromEntries(
            Object.entries(updatePayload).filter(([, value]) => value !== undefined)
          );

          const { error: articleUpdateError } = await supabaseClient
            .from(ARTICULOS_TABLE)
            .update(cleanedPayload)
            .eq('id', articleId);

          if (articleUpdateError) {
            throw articleUpdateError;
          }

          articleExistenceAdjustments.push({
            articuloId: articleId,
            previousExistence,
          });
        }
      }
    } catch (stockError) {
      console.error('Warehouse entry inventory update error:', stockError);
      await revertAllAdjustments();
      await supabaseClient.from(LINEAS_ENTRADA_ALMACEN_TABLE).delete().eq('entrada_id', entryId);
      await supabaseClient.from(ENTRADAS_ALMACEN_TABLE).delete().eq('id', entryId);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while updating inventory.', stockError));
    }

    const updatedDetail = buildPurchaseOrderComputedDetail(
      await fetchPurchaseOrderDetail(orderId)
    );

    const newStatus = updatedDetail.resumen?.recepcion_completa
      ? 'Recibida en almacén'
      : 'Recepción parcial';

    const orderUpdatePayload = {
      estado: newStatus,
      actualizado_en: timestamp,
    };

    if (updatedDetail.resumen?.recepcion_completa) {
      orderUpdatePayload.fecha_recepcion = updatedDetail.order?.fecha_recepcion ?? timestamp;
    } else if (!updatedDetail.order?.fecha_recepcion) {
      orderUpdatePayload.fecha_recepcion = timestamp;
    }

    applyActorAuditFields(orderUpdatePayload, actorId, { includeCreated: false });

    if (actorName) {
      orderUpdatePayload.modificado_por_nombre = actorName;
    }

    const { error: orderUpdateError } = await supabaseClient
      .from(ORDENES_COMPRA_TABLE)
      .update(Object.fromEntries(Object.entries(orderUpdatePayload).filter(([, value]) => value !== undefined)))
      .eq('id', orderId);

    if (orderUpdateError) {
      console.error('Warehouse entry order status update error:', orderUpdateError);
    }

    const entryOrderNumber =
      updatedDetail.order?.numero_orden ??
      entryData?.numero_orden ??
      entryData?.orden_compra_numero ??
      null;

    const enrichedEntryData = {
      ...entryData,
      numero_orden: entryOrderNumber ?? entryData?.numero_orden ?? null,
      orden_compra_numero: entryOrderNumber ?? entryData?.orden_compra_numero ?? null,
    };

    return res.status(201).json({
      message: 'Entrada de almacén registrada correctamente.',
      entrada: enrichedEntryData,
      lineas: entryLinesData ?? [],
      orden: updatedDetail.order,
      resumen: updatedDetail.resumen,
    });
  } catch (err) {
    console.error('Unhandled warehouse entry creation error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while creating warehouse entry.', err));
  }
});

const ordenesCompraRouter = express.Router();

ordenesCompraRouter.use(ensureSupabaseConfigured);

const extractPurchaseOrderSupplierIdentifier = (payload = {}) => {
  const candidates = [
    payload.id_proveedor,
    payload.proveedor_id,
    payload.proveedorId,
    payload.supplier_id,
    payload.supplierId,
    payload.idProveedor,
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

const extractPurchaseOrderLines = (payload = {}) => {
  const candidates = [
    payload.lineas_orden,
    payload.lineasOrden,
    payload.detalle,
    payload.detalles,
    payload.lineas,
    payload.items,
    payload.line_items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item) => item !== undefined && item !== null);
    }
  }

  return [];
};

const normalizePurchaseOrderLineType = (value, hasArticle = false) => {
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();

    if (['producto', 'product', 'goods', 'item'].includes(lowered)) {
      return 'Producto';
    }

    if (['servicio', 'service'].includes(lowered)) {
      return 'Servicio';
    }

    if (['gasto', 'expense'].includes(lowered)) {
      return 'Gasto';
    }
  }

  return hasArticle ? 'Producto' : 'Servicio';
};

ordenesCompraRouter.get('/', async (_req, res) => {
  try {
    const { data: ordenesData, error: ordenesError } = await supabaseClient
      .from(ORDENES_COMPRA_TABLE)
      .select('*')
      .order('fecha_orden', { ascending: false })
      .order('creado_en', { ascending: false });

    if (ordenesError) {
      console.error('Purchase order list error:', ordenesError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Unexpected error while fetching purchase orders.',
            ordenesError
          )
        );
    }

    const ordenes = Array.isArray(ordenesData) ? ordenesData : [];

    const orderEntries = ordenes.map((orden) => {
      const rawSupplierIdentifier = extractPurchaseOrderSupplierIdentifier(orden);
      const normalizedSupplierIdentifier = normalizeIdentifier(rawSupplierIdentifier);
      const supplierKey =
        normalizedSupplierIdentifier !== null && normalizedSupplierIdentifier !== undefined
          ? String(normalizedSupplierIdentifier)
          : null;

      return {
        orden,
        supplierKey,
        normalizedSupplierIdentifier,
      };
    });

    const numericSupplierIds = new Set();
    const stringSupplierIds = new Set();

    for (const entry of orderEntries) {
      if (entry.normalizedSupplierIdentifier === null || entry.normalizedSupplierIdentifier === undefined) {
        continue;
      }

      if (typeof entry.normalizedSupplierIdentifier === 'number') {
        numericSupplierIds.add(entry.normalizedSupplierIdentifier);
      } else if (typeof entry.normalizedSupplierIdentifier === 'string') {
        stringSupplierIds.add(entry.normalizedSupplierIdentifier);
      }
    }

    const supplierLookup = new Map();

    const addSuppliersToLookup = (records = []) => {
      for (const record of records ?? []) {
        const key = buildThirdPartyLookupKey(record);

        if (key) {
          supplierLookup.set(key, record);
        }
      }
    };

    const fetchSuppliersByColumn = async (column, values) => {
      if (!values.length) {
        return;
      }

      const { data, error } = await supabaseClient
        .from(TERCEROS_TABLE)
        .select('*')
        .in(column, values);

      if (error) {
        if (error.code === '42703') {
          console.warn(`Purchase order list warning: column ${column} is not available on terceros table.`);
          return;
        }

        throw error;
      }

      addSuppliersToLookup(data);
    };

    try {
      const numericValues = Array.from(numericSupplierIds);
      const stringValues = Array.from(stringSupplierIds);

      if (numericValues.length) {
        await fetchSuppliersByColumn('id', numericValues);
        await fetchSuppliersByColumn('tercero_id', numericValues);
      }

      if (stringValues.length) {
        await fetchSuppliersByColumn('id', stringValues);
        await fetchSuppliersByColumn('tercero_id', stringValues);
        await fetchSuppliersByColumn('identificacion_fiscal', stringValues);
      }
    } catch (supplierError) {
      console.error('Purchase order list supplier lookup error:', supplierError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Unexpected error while fetching purchase order suppliers.',
            supplierError
          )
        );
    }

    const enrichedOrdenes = orderEntries.map((entry) => {
      const existingSupplier = entry.orden?.proveedor ?? null;

      if (entry.supplierKey && supplierLookup.has(entry.supplierKey)) {
        const supplierRecord = supplierLookup.get(entry.supplierKey);
        const enhancedSupplier =
          supplierRecord && !supplierRecord.display_name
            ? { ...supplierRecord, display_name: getSupplierDisplayName(supplierRecord) }
            : supplierRecord;

        const normalizedSupplier = enhancedSupplier ?? supplierRecord ?? null;

        if (
          normalizedSupplier &&
          existingSupplier &&
          typeof normalizedSupplier === 'object' &&
          typeof existingSupplier === 'object'
        ) {
          return {
            ...entry.orden,
            proveedor: { ...existingSupplier, ...normalizedSupplier },
          };
        }

        return {
          ...entry.orden,
          proveedor: normalizedSupplier ?? existingSupplier ?? null,
        };
      }

      return {
        ...entry.orden,
        proveedor: existingSupplier,
      };
    });

    return res.json({
      ordenes: enrichedOrdenes,
      total: enrichedOrdenes.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Unhandled purchase order list error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while fetching purchase orders.', err));
  }
});

ordenesCompraRouter.get('/:id', async (req, res) => {
  const { id } = req.params ?? {};
  const normalizedId = normalizeIdentifier(id);

  if (normalizedId === null || normalizedId === undefined) {
    return res.status(400).json({ message: 'Identificador de orden inválido.' });
  }

  try {
    const detail = await fetchPurchaseOrderDetail(normalizedId);

    if (!detail.order) {
      return res.status(404).json({ message: 'Orden de compra no encontrada.' });
    }

    const computed = buildPurchaseOrderComputedDetail(detail);

    return res.json({
      orden: computed.order,
      lineas: computed.lines,
      resumen: computed.resumen,
      pagos: computed.pagos,
      entradas: computed.entries,
      lineas_entrada: computed.entryLines,
      pagos_registrados: computed.payments,
    });
  } catch (err) {
    console.error('Unhandled purchase order detail error:', err);
    return res
      .status(500)
      .json(
        formatUnexpectedErrorResponse(
          'Unexpected error while fetching purchase order detail.',
          err
        )
      );
  }
});

ordenesCompraRouter.post('/', async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? { ...req.body } : {};

  const supplierIdentifierRaw =
    payload.id_proveedor ??
    payload.proveedor_id ??
    payload.supplier_id ??
    payload.supplierId ??
    payload.idProveedor ??
    null;

  const supplierId = coerceToNumericId(supplierIdentifierRaw);

  if (supplierId === null) {
    return res.status(400).json({ message: 'El proveedor es obligatorio.' });
  }

  const rawLines = extractPurchaseOrderLines(payload);

  if (!rawLines.length) {
    return res.status(400).json({ message: 'La orden debe incluir al menos una línea.' });
  }

  const roundTo = (value, decimals) => {
    const factor = 10 ** decimals;
    const numericValue = Number.isFinite(value) ? value : toNumber(value, 0);
    return Math.round((numericValue + Number.EPSILON) * factor) / factor;
  };

  const normalizedLines = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    const base = rawLine && typeof rawLine === 'object' ? { ...rawLine } : {};

    const cantidadValue = base.cantidad ?? base.quantity ?? base.qty ?? base.cant ?? null;
    const cantidad = toNumber(cantidadValue, Number.NaN);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return res
        .status(400)
        .json({ message: `La cantidad de la línea ${index + 1} debe ser mayor a cero.` });
    }

    const articuloIdentifierRaw =
      base.id_articulo ??
      base.articulo_id ??
      base.articuloId ??
      base.producto_id ??
      base.productoId ??
      null;
    const articuloId = normalizeIdentifier(articuloIdentifierRaw);
    const hasArticulo = articuloId !== null && articuloId !== undefined;

    const lineType = normalizePurchaseOrderLineType(base.tipo, hasArticulo);

    if (lineType === 'Producto' && !hasArticulo) {
      return res.status(400).json({
        message: `La línea ${index + 1} es de tipo Producto y requiere un artículo asociado.`,
      });
    }

    const descripcion =
      typeof base.descripcion === 'string' && base.descripcion.trim()
        ? base.descripcion.trim()
        : null;

    const costoUnitario = toNumber(
      base.costo_unitario ??
        base.precio_unitario ??
        base.precioUnitario ??
        base.costoUnitario ??
        base.unit_price ??
        base.unitPrice ??
        0,
      0
    );
    const totalImpuestos = toNumber(
      base.total_impuestos ??
        base.totalImpuestos ??
        base.impuestos ??
        base.tax ??
        base.taxes ??
        0,
      0
    );
    const totalLinea = toNumber(
      base.total_linea ?? base.totalLinea ?? base.total ?? costoUnitario * cantidad + totalImpuestos,
      0
    );

    const normalizedLine = {
      tipo: lineType,
      descripcion,
      cantidad: roundTo(cantidad, 4),
      costo_unitario: roundTo(costoUnitario, 4),
      total_impuestos: roundTo(totalImpuestos, 4),
      total_linea: roundTo(totalLinea, 4),
    };

    if (hasArticulo && lineType === 'Producto') {
      normalizedLine.id_articulo = articuloId;
    }

    normalizedLines.push(normalizedLine);
  }

  const subtotalFallback = normalizedLines.reduce(
    (acc, line) => acc + (line.total_linea - line.total_impuestos),
    0
  );
  const taxesFallback = normalizedLines.reduce((acc, line) => acc + line.total_impuestos, 0);
  const totalFallback = normalizedLines.reduce((acc, line) => acc + line.total_linea, 0);

  const subtotal = roundCurrency(
    payload.sub_total ?? payload.subtotal ?? payload.subTotal ?? subtotalFallback
  );
  const taxes = roundCurrency(
    payload.total_impuestos ?? payload.totalImpuestos ?? payload.impuestos ?? taxesFallback
  );
  const total = roundCurrency(
    payload.total ??
      payload.monto_total ??
      payload.totalOrden ??
      (Number.isFinite(totalFallback) ? totalFallback : subtotal + taxes)
  );

  const actorId = extractActorId(req, payload);
  const actorName = extractActorName(req, payload);
  const timestamp = new Date().toISOString();

  let numeroOrden =
    typeof payload.numero_orden === 'string' && payload.numero_orden.trim()
      ? payload.numero_orden.trim()
      : null;

  if (!numeroOrden) {
    try {
      numeroOrden = await generatePurchaseOrderNumber();
    } catch (sequenceError) {
      console.error('Purchase order creation: unable to generate sequential number.', sequenceError);
      return res.status(500).json({
        message: 'No fue posible generar el número correlativo de la orden de compra.',
      });
    }
  }

  const headerPayload = {
    id_proveedor: supplierId,
    estado:
      typeof payload.estado === 'string' && payload.estado.trim()
        ? payload.estado.trim()
        : 'Pendiente',
    sub_total: subtotal,
    total_impuestos: taxes,
    total,
    creado_en: timestamp,
    modificado_en: timestamp,
  };

  if (numeroOrden) {
    headerPayload.numero_orden = numeroOrden;
  }

  const fechaOrden =
    typeof payload.fecha_orden === 'string' && payload.fecha_orden.trim()
      ? payload.fecha_orden.trim()
      : null;

  if (fechaOrden) {
    headerPayload.fecha_orden = fechaOrden;
  }

  const fechaEntrega =
    typeof payload.fecha_entrega_estimada === 'string' && payload.fecha_entrega_estimada.trim()
      ? payload.fecha_entrega_estimada.trim()
      : null;

  if (fechaEntrega) {
    headerPayload.fecha_entrega_estimada = fechaEntrega;
  }

  const condicionesPago =
    typeof payload.condiciones_pago === 'string' && payload.condiciones_pago.trim()
      ? payload.condiciones_pago.trim()
      : null;

  if (condicionesPago) {
    headerPayload.condiciones_pago = condicionesPago;
  }

  const metodoEnvio =
    typeof payload.metodo_envio === 'string' && payload.metodo_envio.trim()
      ? payload.metodo_envio.trim()
      : null;

  if (metodoEnvio) {
    headerPayload.metodo_envio = metodoEnvio;
  }

  const lugarEntrega =
    typeof payload.lugar_entrega === 'string' && payload.lugar_entrega.trim()
      ? payload.lugar_entrega.trim()
      : null;

  if (lugarEntrega) {
    headerPayload.lugar_entrega = lugarEntrega;
  }

  const notas = typeof payload.notas === 'string' && payload.notas.trim() ? payload.notas.trim() : null;

  if (notas) {
    headerPayload.notas = notas;
  }

  applyActorAuditFields(headerPayload, actorId);

  if (actorName) {
    headerPayload.creado_por_nombre = headerPayload.creado_por_nombre ?? actorName;
    headerPayload.modificado_por_nombre = headerPayload.modificado_por_nombre ?? actorName;
  }

  let cleanedHeaderPayload = {};
  let ordenData = null;
  let ordenError = null;
  let insertAttempts = 0;

  try {
    while (insertAttempts < 3) {
      insertAttempts += 1;
      cleanedHeaderPayload = Object.fromEntries(
        Object.entries(headerPayload).filter(([, value]) => value !== undefined)
      );

      const { data, error } = await supabaseClient
        .from(ORDENES_COMPRA_TABLE)
        .insert([cleanedHeaderPayload])
        .select()
        .maybeSingle();

      ordenData = data ?? null;
      ordenError = error ?? null;

      if (!ordenError) {
        break;
      }

      const errorPayload = `${ordenError.message ?? ''} ${ordenError.details ?? ''} ${ordenError.hint ?? ''}`;
      const duplicateNumber =
        ordenError.code === '23505' && errorPayload.toLowerCase().includes('numero_orden');

      if (!duplicateNumber) {
        break;
      }

      try {
        numeroOrden = await generatePurchaseOrderNumber();
        headerPayload.numero_orden = numeroOrden;
      } catch (sequenceError) {
        console.error('Purchase order creation: unable to regenerate sequential number.', sequenceError);
        break;
      }
    }

    if (ordenError) {
      console.error('Purchase order creation: header insertion failed.', ordenError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Unexpected error while creating purchase order header.',
            ordenError
          )
        );
    }

    let ordenId =
      ordenData?.id ??
      ordenData?.orden_id ??
      cleanedHeaderPayload?.id ??
      cleanedHeaderPayload?.orden_id ??
      null;

    if (!ordenId) {
      const { data: recoveredOrder, error: recoveryError } = await supabaseClient
        .from(ORDENES_COMPRA_TABLE)
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recoveryError) {
        console.error('Purchase order creation: unable to recover header after insert.', recoveryError);
        return res
          .status(500)
          .json({ message: 'No fue posible determinar el identificador de la orden de compra.' });
      }

      ordenId = recoveredOrder?.id ?? recoveredOrder?.orden_id ?? null;

      if (!ordenId) {
        return res
          .status(500)
          .json({ message: 'No fue posible determinar el identificador de la orden de compra.' });
      }
    }

    const detailPayloads = normalizedLines.map((line) => ({
      ...line,
      id_orden: ordenId,
      creado_en: timestamp,
    }));

    let lineasData = [];

    if (detailPayloads.length) {
      const { data: insertedLines, error: lineasError } = await supabaseClient
        .from(LINEAS_ORDEN_COMPRA_TABLE)
        .insert(detailPayloads)
        .select();

      if (lineasError) {
        console.error('Purchase order creation: detail insertion failed, triggering rollback.', lineasError);

        try {
          await supabaseClient.from(ORDENES_COMPRA_TABLE).delete().eq('id', ordenId);
        } catch (rollbackError) {
          console.error('Purchase order creation: error while rolling back header.', rollbackError);
        }

        return res
          .status(500)
          .json(
            formatUnexpectedErrorResponse(
              'Unexpected error while creating purchase order details.',
              lineasError
            )
          );
      }

      lineasData = Array.isArray(insertedLines) ? insertedLines : [];
    }

    let ordenRecord = ordenData ?? null;

    if (!ordenRecord) {
      const { data: refetchedOrder, error: refetchOrderError } = await supabaseClient
        .from(ORDENES_COMPRA_TABLE)
        .select('*')
        .eq('id', ordenId)
        .maybeSingle();

      if (!refetchOrderError && refetchedOrder) {
        ordenRecord = refetchedOrder;
      } else if (refetchOrderError && refetchOrderError.code !== 'PGRST116') {
        console.error('Purchase order creation: unable to refetch order after insert.', refetchOrderError);
      }
    }

    if (ordenRecord && ordenRecord.id === undefined) {
      ordenRecord.id = ordenId;
    }

    if (!lineasData.length && detailPayloads.length) {
      const { data: refetchedLines, error: refetchLinesError } = await supabaseClient
        .from(LINEAS_ORDEN_COMPRA_TABLE)
        .select('*')
        .eq('id_orden', ordenId);

      if (!refetchLinesError && Array.isArray(refetchedLines)) {
        lineasData = refetchedLines;
      } else if (refetchLinesError && refetchLinesError.code !== 'PGRST116') {
        console.error('Purchase order creation: unable to refetch lines after insert.', refetchLinesError);
      }
    }

    let proveedor = null;

    try {
      const { data: supplierData, error: supplierError } = await supabaseClient
        .from(TERCEROS_TABLE)
        .select('*')
        .eq('id', supplierId)
        .maybeSingle();

      if (supplierError) {
        console.error('Purchase order creation: supplier lookup error.', supplierError);
      } else {
        proveedor = supplierData ?? null;
      }
    } catch (supplierLookupError) {
      console.error('Purchase order creation: unhandled supplier lookup error.', supplierLookupError);
    }

    return res.status(201).json({
      message: 'Orden de compra registrada correctamente.',
      orden: ordenRecord ?? { ...cleanedHeaderPayload, id: ordenId },
      lineas: lineasData,
      totales: {
        subtotal,
        taxes,
        total,
      },
      proveedor,
    });
  } catch (err) {
    console.error('Unhandled purchase order creation error:', err);
    return res
      .status(500)
      .json(formatUnexpectedErrorResponse('Unexpected error while creating purchase order.', err));
  }
});

ordenesCompraRouter.post('/:id/procesar_pago', async (req, res) => {
  const { id } = req.params ?? {};
  const payload = req.body ?? {};
  const orderId = normalizeIdentifier(id);

  if (orderId === null || orderId === undefined) {
    return res.status(400).json({ message: 'Identificador de orden inválido.' });
  }

  try {
    const actorId = extractActorId(req, payload);
    const actorName = extractActorName(req, payload);

    const amountRaw =
      payload.monto_pago ??
      payload.montoPago ??
      payload.monto ??
      payload.amount ??
      payload.monto_pagado ??
      payload.total_pago ??
      null;

    const paymentAmount = roundCurrency(amountRaw);

    if (!(paymentAmount > 0)) {
      return res.status(400).json({ message: 'El monto del pago debe ser mayor a cero.' });
    }

    const currentDetail = buildPurchaseOrderComputedDetail(
      await fetchPurchaseOrderDetail(orderId)
    );

    if (!currentDetail.order) {
      return res.status(404).json({ message: 'La orden de compra no existe.' });
    }

    if (!currentDetail.resumen?.recepcion_completa) {
      return res.status(409).json({
        message: 'La orden aún tiene productos pendientes de recibir en almacén.',
      });
    }

    const saldoPendienteAntes = currentDetail.pagos?.saldo_pendiente ?? 0;

    if (paymentAmount > roundCurrency(saldoPendienteAntes + 0.01)) {
      return res.status(400).json({
        message: 'El pago excede el saldo pendiente de la orden de compra.',
        saldoPendiente: saldoPendienteAntes,
      });
    }

    const timestamp = new Date().toISOString();
    const fechaPago = parseDateToIso(
      payload.fecha_pago ?? payload.fechaPago ?? payload.fecha ?? payload.fecha_operacion
    ) ?? timestamp;

    const metodoPago =
      typeof payload.metodo_pago === 'string' && payload.metodo_pago.trim()
        ? payload.metodo_pago.trim()
        : typeof payload.metodoPago === 'string' && payload.metodoPago.trim()
        ? payload.metodoPago.trim()
        : null;

    const referencia =
      typeof payload.referencia === 'string' && payload.referencia.trim()
        ? payload.referencia.trim()
        : typeof payload.referencia_pago === 'string' && payload.referencia_pago.trim()
        ? payload.referencia_pago.trim()
        : null;

    const notas =
      typeof payload.notas === 'string' && payload.notas.trim()
        ? payload.notas.trim()
        : typeof payload.comentarios === 'string' && payload.comentarios.trim()
        ? payload.comentarios.trim()
        : null;

    const paymentPayload = {
      orden_compra_id: orderId,
      proveedor_id:
        currentDetail.order?.id_proveedor ??
        currentDetail.order?.proveedor_id ??
        currentDetail.order?.supplier_id ??
        null,
      monto_pagado: paymentAmount,
      fecha_pago: fechaPago,
      metodo_pago: metodoPago,
      referencia,
      notas,
      registrado_por: formatActorLabel(actorId, actorName),
      creado_en: timestamp,
      actualizado_en: timestamp,
    };

    applyActorAuditFields(paymentPayload, actorId);

    if (actorName) {
      if (!paymentPayload.creado_por_nombre) {
        paymentPayload.creado_por_nombre = actorName;
      }

      paymentPayload.modificado_por_nombre = actorName;
    }

    const cleanedPaymentPayload = Object.fromEntries(
      Object.entries(paymentPayload).filter(([, value]) => value !== undefined)
    );

    const { data: paymentData, error: paymentError } = await supabaseClient
      .from(PAGOS_PROVEEDORES_TABLE)
      .insert([cleanedPaymentPayload])
      .select()
      .maybeSingle();

    if (paymentError) {
      console.error('Purchase order payment creation error:', paymentError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Unexpected error while registering purchase order payment.',
            paymentError
          )
        );
    }

    const updatedDetail = buildPurchaseOrderComputedDetail(
      await fetchPurchaseOrderDetail(orderId)
    );

    const saldoPendienteDespues = updatedDetail.pagos?.saldo_pendiente ?? 0;

    let nuevoEstado = updatedDetail.order?.estado ?? 'Registrada';

    if (saldoPendienteDespues <= 0) {
      nuevoEstado = 'Finalizada';
    } else if (updatedDetail.pagos?.total_pagado > 0) {
      nuevoEstado = 'Pago parcial';
    }

    const orderUpdatePayload = {
      estado: nuevoEstado,
      actualizado_en: timestamp,
    };

    if (saldoPendienteDespues <= 0) {
      orderUpdatePayload.pagada_en = timestamp;
    }

    applyActorAuditFields(orderUpdatePayload, actorId, { includeCreated: false });

    if (actorName) {
      orderUpdatePayload.modificado_por_nombre = actorName;
    }

    const { error: orderUpdateError } = await supabaseClient
      .from(ORDENES_COMPRA_TABLE)
      .update(
        Object.fromEntries(Object.entries(orderUpdatePayload).filter(([, value]) => value !== undefined))
      )
      .eq('id', orderId);

    if (orderUpdateError) {
      console.error('Purchase order payment status update error:', orderUpdateError);
    }

    const updatedOrder = {
      ...updatedDetail.order,
      estado: nuevoEstado,
      pagada_en: orderUpdatePayload.pagada_en ?? updatedDetail.order?.pagada_en,
    };

    return res.status(201).json({
      message: 'Pago registrado correctamente.',
      pago: paymentData ?? cleanedPaymentPayload,
      orden: updatedOrder,
      resumen: updatedDetail.resumen,
      pagos: updatedDetail.pagos,
      pagos_registrados: updatedDetail.payments,
    });
  } catch (err) {
    console.error('Unhandled purchase order payment error:', err);
    return res
      .status(500)
      .json(
        formatUnexpectedErrorResponse(
          'Unexpected error while registering purchase order payment.',
          err
        )
      );
  }
});

const cxcRouter = express.Router();

cxcRouter.use(ensureSupabaseConfigured);

cxcRouter.get('/facturas/:invoiceId/pagos', async (req, res) => {
  const invoiceIdentifierRaw = req.params?.invoiceId ?? null;
  const normalizedInvoiceId = normalizeIdentifier(invoiceIdentifierRaw);

  if (normalizedInvoiceId === null || normalizedInvoiceId === undefined) {
    return res.status(400).json({ message: 'El identificador de la factura es obligatorio.' });
  }

  const fetchInvoiceByColumn = async (column, value) => {
    const { data, error } = await supabaseClient
      .from(FACTURAS_VENTA_TABLE)
      .select('*')
      .eq(column, value)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }

      throw error;
    }

    return data ?? null;
  };

  try {
    let facturaRecord = null;

    if (typeof normalizedInvoiceId === 'number') {
      facturaRecord = await fetchInvoiceByColumn('id', normalizedInvoiceId);

      if (!facturaRecord) {
        facturaRecord = await fetchInvoiceByColumn('factura_id', normalizedInvoiceId);
      }
    } else {
      facturaRecord = await fetchInvoiceByColumn('factura_id', normalizedInvoiceId);

      if (!facturaRecord) {
        facturaRecord = await fetchInvoiceByColumn('id', normalizedInvoiceId);
      }
    }

    if (!facturaRecord) {
      return res.status(404).json({ message: 'La factura especificada no existe.' });
    }

    const invoiceNumericId =
      coerceToNumericId(facturaRecord?.id) ??
      coerceToNumericId(facturaRecord?.factura_id) ??
      coerceToNumericId(normalizedInvoiceId);

    const paymentQuery = supabaseClient
      .from(PAGOS_RECIBIDOS_TABLE)
      .select('*')
      .order('fecha_pago', { ascending: false })
      .order('creado_en', { ascending: false });

    if (invoiceNumericId !== null) {
      paymentQuery.eq('id_factura', invoiceNumericId);
    } else {
      const fallbackInvoiceId =
        facturaRecord?.factura_id ?? facturaRecord?.id ?? normalizedInvoiceId;
      paymentQuery.eq('id_factura', fallbackInvoiceId);
    }

    const { data: pagosData, error: pagosError } = await paymentQuery;

    if (pagosError) {
      console.error('Customer payment detail: payments fetch error.', pagosError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Ocurrió un error al consultar los pagos registrados de la factura.',
            pagosError
          )
        );
    }

    const pagos = Array.isArray(pagosData) ? pagosData : [];

    let totalPagado = 0;
    let fechaUltimoPago = null;

    for (const pago of pagos) {
      const amount = roundCurrency(toNumber(pago?.monto_pago ?? pago?.monto ?? 0, 0));
      totalPagado = roundCurrency(totalPagado + amount);

      const pagoDateIso = parseDateToIso(pago?.fecha_pago ?? pago?.fecha ?? pago?.creado_en);

      if (pagoDateIso) {
        if (!fechaUltimoPago || pagoDateIso > fechaUltimoPago) {
          fechaUltimoPago = pagoDateIso;
        }
      }
    }

    const totalFactura = roundCurrency(
      toNumber(
        facturaRecord?.pagos_resumen?.total_factura ??
          facturaRecord?.total ??
          facturaRecord?.total_factura ??
          facturaRecord?.monto_total ??
          facturaRecord?.importe_total ??
          facturaRecord?.gran_total ??
          0,
        0
      )
    );

    const resumen = {
      total_factura: totalFactura,
      total_pagado: roundCurrency(totalPagado),
      saldo_pendiente: roundCurrency(Math.max(0, totalFactura - totalPagado)),
      cantidad_pagos: pagos.length,
    };

    if (fechaUltimoPago) {
      resumen.fecha_ultimo_pago = fechaUltimoPago;
    }

    return res.json({
      factura: facturaRecord,
      pagos,
      resumen,
    });
  } catch (err) {
    console.error('Customer payment detail: unexpected error.', err);
    return res
      .status(500)
      .json(
        formatUnexpectedErrorResponse(
          'Ocurrió un error inesperado al consultar los pagos de la factura.',
          err
        )
      );
  }
});

cxcRouter.post('/registrar_pago', async (req, res) => {
  try {
    const actorId = extractActorId(req);
    const actorName = extractActorName(req);

    const {
      id_factura,
      factura_id,
      idFactura,
      facturaId,
      invoice_id,
      invoiceId,
      id_cliente,
      cliente_id,
      clienteId,
      client_id,
      clientId,
      id_tercero,
      tercero_id,
      terceroId,
      monto_pago,
      montoPago,
      monto,
      amount,
      fecha_pago,
      fechaPago,
      payment_date,
      metodo_pago,
      metodoPago,
      metodo,
      forma_pago,
      referencia,
      referencia_pago,
      numero_referencia,
      notas,
      comentarios,
      observaciones,
    } = req.body ?? {};

    const invoiceIdentifierRaw =
      id_factura ??
      factura_id ??
      idFactura ??
      facturaId ??
      invoice_id ??
      invoiceId ??
      null;
    const clientIdentifierRaw =
      id_cliente ??
      cliente_id ??
      clienteId ??
      client_id ??
      clientId ??
      id_tercero ??
      tercero_id ??
      terceroId ??
      null;
    const paymentAmountRaw = monto_pago ?? montoPago ?? monto ?? amount ?? null;

    const invoiceIdNormalized = normalizeIdentifier(invoiceIdentifierRaw);
    const clientIdNormalized = normalizeIdentifier(clientIdentifierRaw);
    const paymentAmount = roundCurrency(paymentAmountRaw);

    if (invoiceIdNormalized === null || invoiceIdNormalized === undefined) {
      return res.status(400).json({ message: 'El identificador de la factura es obligatorio.' });
    }

    if (clientIdNormalized === null || clientIdNormalized === undefined) {
      return res.status(400).json({ message: 'El identificador del cliente es obligatorio.' });
    }

    if (!(paymentAmount > 0)) {
      return res.status(400).json({ message: 'El monto del pago debe ser un valor positivo.' });
    }

    const { data: invoiceData, error: invoiceError } = await supabaseClient
      .from(FACTURAS_VENTA_TABLE)
      .select('id, id_cliente, cliente_id, tercero_id, total, estado')
      .eq('id', invoiceIdNormalized)
      .maybeSingle();

    if (invoiceError) {
      console.error('Customer payment: invoice lookup failed.', invoiceError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Ocurrió un error al validar la factura antes de registrar el pago.',
            invoiceError
          )
        );
    }

    if (!invoiceData) {
      return res.status(404).json({ message: 'La factura indicada no existe.' });
    }

    const invoiceClientCandidates = [
      invoiceData.id_cliente,
      invoiceData.cliente_id,
      invoiceData.tercero_id,
    ]
      .map((value) => normalizeIdentifier(value))
      .filter((value) => value !== null && value !== undefined);

    const invoiceClientMatches = invoiceClientCandidates.some((candidate) => {
      if (candidate === clientIdNormalized) {
        return true;
      }

      if (candidate !== null && candidate !== undefined) {
        return String(candidate) === String(clientIdNormalized);
      }

      return false;
    });

    if (!invoiceClientMatches) {
      return res.status(404).json({ message: 'La factura no pertenece al cliente indicado.' });
    }

    const invoiceStatus =
      typeof invoiceData.estado === 'string' ? invoiceData.estado.trim().toLowerCase() : null;

    if (invoiceStatus === 'pagada') {
      return res.status(409).json({ message: 'La factura ya figura como pagada.' });
    }

    const invoiceTotalCandidates = [invoiceData.total, invoiceData.monto_total];
    const invoiceTotal = roundCurrency(
      invoiceTotalCandidates.reduce((acc, candidate) => acc ?? candidate, null)
    );

    const { data: existingPaymentsData, error: existingPaymentsError } = await supabaseClient
      .from(PAGOS_RECIBIDOS_TABLE)
      .select('monto_pago')
      .eq('id_factura', invoiceIdNormalized);

    if (existingPaymentsError) {
      console.error('Customer payment: unable to fetch existing payments.', existingPaymentsError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Ocurrió un error al calcular el saldo pendiente de la factura.',
            existingPaymentsError
          )
        );
    }

    const totalPagadoAnterior = Array.isArray(existingPaymentsData)
      ? existingPaymentsData.reduce(
          (acc, pago) => acc + toNumber(pago?.monto_pago ?? pago?.monto ?? 0, 0),
          0
        )
      : 0;

    const totalPagadoNormalizado = roundCurrency(totalPagadoAnterior);
    const saldoPendiente = roundCurrency(invoiceTotal - totalPagadoNormalizado);

    if (saldoPendiente <= 0) {
      return res.status(409).json({ message: 'La factura no tiene saldo pendiente.' });
    }

    if (paymentAmount > saldoPendiente) {
      return res.status(400).json({ message: 'El monto del pago excede el saldo pendiente.' });
    }

    const timestamp = new Date().toISOString();
    const paymentDateIso = parseDateToIso(fecha_pago ?? fechaPago ?? payment_date) ?? timestamp;
    const paymentMethod =
      metodo_pago ?? metodoPago ?? metodo ?? forma_pago ?? null;
    const paymentReference = referencia ?? referencia_pago ?? numero_referencia ?? null;
    const paymentNotes = notas ?? comentarios ?? observaciones ?? null;

    const paymentPayload = {
      id_factura: invoiceIdNormalized,
      id_cliente: clientIdNormalized,
      monto_pago: paymentAmount,
      fecha_pago: paymentDateIso,
      metodo_pago: paymentMethod ?? undefined,
      referencia: paymentReference ?? undefined,
      notas: paymentNotes ?? undefined,
      creado_en: timestamp,
      modificado_en: timestamp,
    };

    applyActorAuditFields(paymentPayload, actorId);

    if (actorName) {
      paymentPayload.creado_por_nombre = paymentPayload.creado_por_nombre ?? actorName;
      paymentPayload.modificado_por_nombre = paymentPayload.modificado_por_nombre ?? actorName;
    }

    const cleanedPaymentPayload = Object.fromEntries(
      Object.entries(paymentPayload).filter(([, value]) => value !== undefined)
    );

    const { data: insertedPayment, error: paymentInsertError } = await supabaseClient
      .from(PAGOS_RECIBIDOS_TABLE)
      .insert([cleanedPaymentPayload])
      .select()
      .maybeSingle();

    if (paymentInsertError) {
      console.error('Customer payment: insertion failed.', paymentInsertError);
      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Ocurrió un error al registrar el pago del cliente.',
            paymentInsertError
          )
        );
    }

    const saldoDespuesDelPago = roundCurrency(saldoPendiente - paymentAmount);
    const estadoFacturaActualizado = saldoDespuesDelPago <= 0 ? 'Pagada' : 'Pendiente de Pago';

    const invoiceUpdatePayload = {
      estado: estadoFacturaActualizado,
      modificado_en: timestamp,
      actualizado_en: timestamp,
      updated_at: timestamp,
    };

    applyActorAuditFields(invoiceUpdatePayload, actorId, { includeCreated: false });

    if (actorName) {
      invoiceUpdatePayload.modificado_por_nombre = invoiceUpdatePayload.modificado_por_nombre ?? actorName;
    }

    const cleanedInvoiceUpdatePayload = Object.fromEntries(
      Object.entries(invoiceUpdatePayload).filter(([, value]) => value !== undefined)
    );

    const {
      data: updatedInvoice,
      error: invoiceUpdateError,
    } = await supabaseClient
      .from(FACTURAS_VENTA_TABLE)
      .update(cleanedInvoiceUpdatePayload)
      .eq('id', invoiceIdNormalized)
      .select()
      .maybeSingle();

    if (invoiceUpdateError) {
      console.error('Customer payment: invoice update failed, reverting payment.', invoiceUpdateError);

      if (insertedPayment?.id !== undefined && insertedPayment?.id !== null) {
        try {
          await supabaseClient
            .from(PAGOS_RECIBIDOS_TABLE)
            .delete()
            .eq('id', insertedPayment.id);
        } catch (rollbackError) {
          console.error('Customer payment: rollback failed after invoice update error.', rollbackError);
        }
      }

      return res
        .status(500)
        .json(
          formatUnexpectedErrorResponse(
            'Ocurrió un error al actualizar el estado de la factura después de registrar el pago.',
            invoiceUpdateError
          )
        );
    }

    let facturaActualizada = updatedInvoice;

    if (!facturaActualizada) {
      try {
        const { data: refetchedInvoice } = await supabaseClient
          .from(FACTURAS_VENTA_TABLE)
          .select('*')
          .eq('id', invoiceIdNormalized)
          .maybeSingle();

        if (refetchedInvoice) {
          facturaActualizada = refetchedInvoice;
        }
      } catch (refetchError) {
        console.warn('Customer payment: unable to refetch invoice after update.', refetchError);
      }
    }

    const totalPagadoActual = roundCurrency(totalPagadoNormalizado + paymentAmount);

    return res.status(201).json({
      message: 'Pago registrado correctamente.',
      pago: insertedPayment,
      factura: facturaActualizada ?? {
        ...invoiceData,
        estado: estadoFacturaActualizado,
      },
      resumen_saldo: {
        saldo_anterior: saldoPendiente,
        monto_pagado: paymentAmount,
        saldo_pendiente: saldoDespuesDelPago < 0 ? 0 : saldoDespuesDelPago,
        total_pagado: totalPagadoActual,
      },
    });
  } catch (err) {
    console.error('Customer payment: unexpected error.', err);
    return res
      .status(500)
      .json(
        formatUnexpectedErrorResponse(
          'Ocurrió un error inesperado al registrar el pago del cliente.',
          err
        )
      );
  }
});

app.use('/api/dashboard', dashboardRouter);
app.use('/api/finanzas', financialAnalyticsRouter);
app.use('/api/terceros', tercerosRouter);
app.use('/api/articulos', articulosRouter);
app.use('/api/facturas', facturasRouter);
app.use('/api/almacenes', almacenesRouter);
app.use('/api/entradas-almacen', entradasAlmacenRouter);
app.use('/api/ordenes-compra', ordenesCompraRouter);
app.use('/api/cxc', cxcRouter);

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
