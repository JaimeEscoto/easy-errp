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

const extractActorId = (req, payload = {}) => {
  const headerCandidates = ['x-admin-id', 'x-user-id', 'x-actor-id'];

  for (const header of headerCandidates) {
    const value = req.headers?.[header];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorId(value);
    }
  }

  const bodyCandidates = ['updated_by', 'modified_by', 'changed_by', 'created_by', 'admin_id', 'user_id'];

  for (const key of bodyCandidates) {
    const value = payload?.[key] ?? req.body?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return normalizeActorId(value);
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
  'created_by',
  'updated_by',
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

const recordArticuloLog = async ({
  articuloId,
  action,
  actorId = null,
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
    realizado_por: actorId ?? null,
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

const articulosRouter = express.Router();

articulosRouter.use(ensureSupabaseConfigured);

articulosRouter.post('/', async (req, res) => {
  try {
    const payload = req.body ?? {};

    const actorId = extractActorId(req, payload);

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

articulosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body ?? {};

  try {
    const actorId = extractActorId(req, updates);

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
      updatesWithAudit.updated_by = actorId;
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
