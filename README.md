# Easy ERRP – Gestión básica de ERP

Este repositorio contiene un prototipo de ERP enfocado en los flujos clave para controlar artículos, terceros, almacenes y órdenes de compra. Incluye autenticación inicial basada en Supabase, un backend con Express y un frontend estático con múltiples módulos transaccionales.

## Estructura del proyecto

```
├── backend          # API REST con Express que opera contra Supabase
├── frontend         # Sitio estático con dashboards y pantallas operativas
├── docs             # Documentación adicional (SQL de referencia, etc.)
└── README.md
```

## Funcionalidades principales

- **Maestros**
  - Artículos con registro, listado y trazabilidad básica.
  - Clientes y proveedores centralizados en el módulo de terceros.
  - Almacenes con altas desde el frontend y CRUD vía API (`/api/almacenes`).
- **Inventario y compras**
  - Registro de órdenes de compra y sus líneas.
  - Entradas de almacén vinculadas a órdenes de compra que actualizan existencias (`/api/entradas-almacen`).
  - Control de inventario por artículo y almacén, con sumatorias automáticas.
  - Pagos a proveedores asociados a órdenes de compra y actualización de estados (`/api/pagos-proveedores`).
- **Panel y navegación**
  - Dashboard con accesos rápidos a todos los módulos.
  - Menús consistentes entre secciones maestras, transacciones y configuraciones.

## Requisitos previos

- Cuenta activa en [Supabase](https://supabase.com/) con un proyecto creado.
- Cuenta en [Render](https://render.com/) para desplegar el backend (servicio web) y el frontend (sitio estático).
- Node.js 18+ y npm instalados en tu máquina para ejecutar el proyecto localmente.

## Configuración de Supabase

1. Ingresa al panel SQL de Supabase y ejecuta el siguiente script para crear la tabla de administradores y el usuario inicial. Ajusta correo y contraseña antes de correrlo.

   ```sql
   -- Habilita funciones criptográficas (normalmente ya está activo en Supabase)
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

   > **Importante:** guarda la contraseña que definas porque será la que uses para iniciar sesión.

2. Copia la **Service Role Key** y la **Project URL** desde la sección *Project Settings → API*. Se utilizarán en el backend.
3. Ejecuta el script de referencia `docs/sql/almacenes-y-entradas.sql` para crear las tablas auxiliares de almacenes, inventario, entradas y pagos a proveedores.

## Configuración local

### Backend

1. Copia el archivo de variables de entorno y completa los valores necesarios:

   ```bash
   cd backend
   cp .env.example .env
   ```

   Edita `.env` con tus credenciales de Supabase.

2. Instala dependencias y ejecuta el servidor en modo desarrollo:

   ```bash
   npm install
   npm run dev
   ```

   El servidor se ejecutará en `http://localhost:4000` y expone, entre otros, los endpoints:

   - `GET /api/health` – Verifica el estado del servicio.
   - `POST /api/login` – Recibe `{ email, password }` y valida contra Supabase.
   - `GET /api/almacenes` y `POST /api/almacenes` – Consulta y creación de almacenes.
   - `POST /api/entradas-almacen` – Registra recepciones y actualiza inventario.
   - `POST /api/pagos-proveedores` – Registra pagos de órdenes de compra y marca las órdenes como pagadas.

### Frontend

1. Dentro de `frontend/`, ejecuta el generador de configuración indicando la URL del backend:

   ```bash
   BACKEND_URL="https://tu-backend.onrender.com" npm run build --prefix frontend
   ```

   Si no estableces `BACKEND_URL`, se utilizará `http://localhost:4000` como valor por defecto.

2. Durante desarrollo puedes abrir `index.html` directamente en el navegador o servirlo con tu herramienta estática preferida. El formulario hará peticiones `fetch` al backend configurado.

3. Para navegar por los módulos del ERP, inicia sesión y utiliza las pantallas disponibles en `frontend/`:

   - `dashboard.html` – Vista general y accesos directos.
   - `maestros-*.html` – Secciones de administración de artículos, terceros y almacenes.
   - `transacciones-*.html` – Órdenes de compra, entradas de almacén, pagos a proveedores y ventas.

## Despliegue en Render

### Backend (Web Service)

1. Crea un nuevo *Web Service* en Render apuntando al repositorio.
2. Selecciona un runtime de Node.js y establece el comando de inicio a `cd backend && npm install && npm start` (Render instalará dependencias y ejecutará el servidor).
3. Añade las variables de entorno en la pestaña *Environment*:

   - `PORT` → `4000` (Render asigna su propio puerto vía `PORT`, pero mantener el valor por defecto es útil localmente).
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Despliega el servicio y guarda la URL pública, por ejemplo `https://easy-errp-backend.onrender.com`.

### Frontend (Static Site)

1. Crea un nuevo *Static Site* en Render apuntando al mismo repositorio.
2. Configura el directorio raíz como `frontend` y deja vacío el comando de build (es un sitio estático).
3. Define la ruta de publicación como `frontend` y despliega.
4. Antes de desplegar, define en Render la variable de entorno `BACKEND_URL` con la URL pública del backend y agrega como comando de build del sitio estático `npm run build` (con directorio `frontend`). El script generará `env.js` con ese valor y el frontend consumirá automáticamente la URL correcta.

## Uso del login

1. Abre la URL del sitio estático desplegado en Render.
2. Introduce el correo y la contraseña configurados en Supabase.
3. Si las credenciales son correctas, recibirás el mensaje de éxito y podrás redirigir al panel privado desde el frontend (ver comentario en `app.js`).

## Próximos pasos sugeridos

- Sustituir el mensaje de éxito por una redirección hacia el dashboard protegido.
- Implementar almacenamiento seguro de sesiones (JWT, cookies, etc.).
- Añadir registro de actividad o logs para intentos fallidos.

Para cualquier ajuste, recuerda sincronizar la configuración entre frontend, backend y Supabase.
