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

    const { data, error } = await supabaseClient
      .from('articulos')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Create articulo error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while creating articulo.', error));
    }

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
    const { data, error } = await supabaseClient.from('articulos').select('*');

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
      .from('articulos')
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
    const { data, error } = await supabaseClient
      .from('articulos')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Update articulo error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while updating articulo.', error));
    }

    if (!data) {
      return res.status(404).json({ message: 'Articulo not found.' });
    }

    return res.json(data);
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
    const { data, error } = await supabaseClient
      .from('articulos')
      .update({ activo: false })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error && error.code !== '42703') {
      console.error('Logical delete articulo error:', error);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while deleting articulo.', error));
    }

    if (!error) {
      if (!data) {
        return res.status(404).json({ message: 'Articulo not found.' });
      }

      return res.json({ message: 'Articulo disabled successfully.', articulo: data });
    }

    const { data: deletedData, error: deleteError } = await supabaseClient
      .from('articulos')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();

    if (deleteError) {
      console.error('Physical delete articulo error:', deleteError);
      return res
        .status(500)
        .json(formatUnexpectedErrorResponse('Unexpected error while deleting articulo.', deleteError));
    }

    if (!deletedData) {
      return res.status(404).json({ message: 'Articulo not found.' });
    }

    return res.json({ message: 'Articulo deleted successfully.', articulo: deletedData });
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
