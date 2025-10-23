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

app.use('/api/terceros', tercerosRouter);
app.use('/api/articulos', articulosRouter);

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
