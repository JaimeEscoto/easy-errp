# Configuración inicial

Sigue estos pasos para levantar el entorno completo desde cero.

## 1. Variables de entorno

1. Copia el archivo `.env.example` dentro de `backend/` y renómbralo a `.env`.
2. Completa los valores:
   - `SUPABASE_URL`: URL del proyecto de Supabase (`https://<project>.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY`: clave privada *Service Role* disponible en *Project Settings → API*.
   - `PORT`: puedes mantener `4000` para desarrollo local.

## 2. Preparar la base de datos en Supabase

Ejecuta el siguiente script en la consola SQL del proyecto. Ajusta el correo y la contraseña del administrador según tus necesidades.

```sql
create extension if not exists pgcrypto;

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default timezone('utc', now())
);

insert into admins (email, password_hash)
values (
  'admin@empresa.com',
  crypt('TuContraseñaSegura123', gen_salt('bf'))
)
on conflict (email) do update set password_hash = excluded.password_hash;
```

> Guarda el correo y la contraseña porque se utilizarán en el inicio de sesión.

## 3. Ejecutar backend localmente

```bash
cd backend
npm install
npm run dev
```

El servidor escuchará en `http://localhost:4000`.

## 4. Ajustar y probar el frontend

1. En `frontend/config.js` verifica que `backendUrl` sea `http://localhost:4000` mientras desarrollas localmente.
2. Abre `frontend/index.html` en el navegador y realiza una prueba de login con el usuario administrador creado.

## 5. Preparar despliegue en Render

### Backend

- Servicio: *Web Service*.
- Comando de inicio: `cd backend && npm install && npm start`.
- Variables de entorno: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y (opcional) `PORT`.

### Frontend

- Servicio: *Static Site*.
- Directorio de publicación: `frontend`.
- Antes de desplegar, modifica `frontend/config.js` con la URL pública del backend (`https://<tu-backend>.onrender.com`).

Con estos pasos tendrás el login funcionando en ambos entornos.
