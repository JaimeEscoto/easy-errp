# Manual de funcionalidades del sistema

**Fecha de publicación:** 27 de octubre de 2025

Este manual describe el alcance funcional actual de Easy ERRP. Se organiza por módulos para facilitar la comprensión de los flujos disponibles tanto en la API (backend) como en la interfaz web (frontend).

## 1. Panorama general

- **Arquitectura:** API REST en Node.js/Express que opera sobre Supabase y un frontend estático desarrollado con HTML, Tailwind CSS y JavaScript modular.
- **Módulos clave:** autenticación de administradores, panel de control, maestros (artículos, terceros, almacenes), compras (órdenes, entradas, pagos a proveedores) y ventas/cobranzas (emisión de facturas y registro de pagos recibidos).
- **Recursos de apoyo:** scripts SQL en `docs/sql/` para preparar tablas de referencia y documentación de configuración inicial.

## 2. Autenticación y gestión de sesión

### 2.1 Inicio de sesión de administradores

- Formulario disponible en `index.html` que envía credenciales a `POST /api/login`.
- El backend valida el correo contra la tabla `admins` de Supabase y compara contraseñas con `bcrypt`.
- Respuestas exitosas devuelven el identificador y correo del administrador autenticado.

### 2.2 Sesiones en el frontend

- Al autenticarse se persiste un objeto de sesión en `localStorage`, incluyendo `adminId`, correo y nombre visible.
- Todas las pantallas internas invocan `requireSession()` para redirigir al login si no hay sesión.
- El botón “Cerrar sesión” elimina la sesión almacenada y vuelve al inicio.

## 3. Panel principal (Dashboard)

### 3.1 Resumen consolidado (`GET /api/dashboard/resumen`)

- Consolida ingresos (facturas de venta) y gastos (órdenes de compra) del mes actual y del anterior para mostrar variaciones porcentuales.
- Calcula inventario activo vs. inactivo a partir de los artículos y arma una lista de actividades recientes (creación/actualización de maestros y documentos).

### 3.2 Interfaz de dashboard (`dashboard.html`)

- Muestra tarjetas con totales de ingresos/gastos y resumen de artículos, incluyendo porcentajes vs. el mes anterior.
- Lista cronológica de actividades con fecha, usuario, módulo y detalle.
- Indicadores de estado y mensajes de error cuando el backend no está disponible.

## 4. Gestión de maestros de datos

### 4.1 Artículos (`/api/articulos`)

**Funciones de la API**

- Creación de artículos con auditoría de actor y registro en tablas de log.
- Listado enriquecido con resumen de inventario por almacén (`inventario_articulos`).
- Consulta puntual por identificador y recuperación de historial desde tablas de auditoría.
- Actualización con registro de cambios y detección de activaciones/desactivaciones.

**Interfaz web (`maestros-articulos.html`)**

- Tabla con búsqueda por texto, contador total e indicador para mostrar/ocultar artículos inactivos.
- Formulario modal para altas y edición que valida campos obligatorios.
- Visor modal de historial con línea de tiempo de cambios, responsable y fecha.
- Botones para refrescar datos, crear registros y alternar el estado activo.

### 4.2 Terceros – Clientes y proveedores (`/api/terceros`)

**Funciones de la API**

- Listado completo de registros con soporte para varios identificadores (ID interno, fiscal, NIT).
- Alta de terceros con validación de identificación fiscal y nombre comercial.
- Actualización que preserva campos de auditoría y escribe en la bitácora histórica.
- Consulta de historial por tercero, utilizando tablas candidatas `terceros_log*`.

**Interfaz web (`maestros-clientes.html`)**

- Tabla filtrable por nombre o identificación con etiquetas que señalan si el tercero es cliente, proveedor o ambos.
- Formularios para crear o editar que permiten gestionar datos de contacto, clasificación y estado.
- Visualización de actividad reciente e indicadores de estado (activo/inactivo).

### 4.3 Almacenes (`/api/almacenes`)

**Funciones de la API**

- Listado ordenado alfabéticamente, con manejo de escenarios sin tabla (mensaje de configuración faltante).
- Alta de almacenes que registra datos de auditoría (creador/modificador) y sellos de tiempo.

**Interfaz web (`maestros-almacenes.html`)**

- Tarjetas con datos de nombre, código, ubicación y capacidad.
- Formulario simple para crear nuevos almacenes, con confirmación visual y limpieza automática del formulario.

## 5. Compras e inventario

### 5.1 Órdenes de compra (`/api/ordenes-compra`)

**Funciones de la API**

- Listado de órdenes con enriquecimiento automático del proveedor relacionado.
- Consulta detallada que incluye líneas, entradas de almacén vinculadas y pagos asociados.
- Creación de órdenes con generación automática de número correlativo, validaciones de líneas (cantidades, artículos obligatorios) y cálculo de totales.
- Registro de pagos de proveedor que actualiza estados de la orden y acumula importes pagados.

**Interfaz web (`transacciones-ordenes-compra.html` y `transacciones-ordenes-compra-registradas.html`)**

- Formulario dinámico para armar órdenes con múltiples líneas, selección de proveedores y artículos desde catálogos refrescables.
- Cálculo automático de subtotal, impuestos y total mientras se editan las líneas.
- Resumen de la orden recién creada con datos clave y enlaces para seguimiento.
- Listado de órdenes registradas con filtros y acceso al detalle consolidado.

### 5.2 Entradas de almacén (`/api/entradas-almacen`)

**Funciones de la API**

- Listado de entradas con posibilidad de recuperar orden y proveedor asociados.
- Registro de entradas que vincula la orden de compra, valida cantidades recibidas y actualiza inventario por almacén.
- Manejo de errores para tablas ausentes y reversión parcial ante inconsistencias.

**Interfaz web (`transacciones-entradas-almacen.html`)**

- Formulario para seleccionar orden pendiente, especificar almacén receptor y cargar líneas recibidas.
- Indicadores de progreso, mensajes de éxito/error y actualización automática de existencias visibles en la vista de artículos.

### 5.3 Pagos a proveedores (`/api/ordenes-compra/:id/procesar_pago`)

- Endpoint dedicado para registrar pagos parciales o totales de una orden, con validación de montos y actualización del saldo pendiente.
- El historial de pagos se refleja en la consulta detallada de la orden y en el dashboard.

## 6. Ventas y cuentas por cobrar

### 6.1 Emisión de facturas de venta (`POST /api/facturas/emitir`)

- Validación de cliente, artículos y líneas antes de confirmar la factura.
- Inserción de encabezado y líneas, actualización del inventario de artículos y registro en tablas de log.
- Cálculo de totales (subtotal, impuestos, total) y estructura de respuesta con la factura completa.

### 6.2 Consulta de facturas (`GET /api/facturas`)

- Listado cronológico con enriquecimiento del cliente asociado y totales de pagos registrados.
- Recupera pagos recibidos para mostrar saldo pendiente por factura.
- Manejo de columnas opcionales en Supabase (tolerante a esquemas parciales).

### 6.3 Registro de pagos de clientes (`/api/cxc`)

- `GET /api/cxc/facturas/:id/pagos` devuelve detalle de pagos con totales calculados (pagado, saldo, fecha del último pago).
- `POST /api/cxc/registrar_pago` valida montos, actualiza saldo de la factura y almacena el pago en `pagos_recibidos` con auditoría de actor.
- Respuestas incluyen resumen del movimiento y estado actualizado de la factura.

**Interfaz web (`transacciones-ventas.html` y `transacciones-facturas-emitidas.html`)**

- Formulario dinámico para emitir facturas con selección de clientes y artículos, cálculo automático de impuestos y totales.
- Resumen posterior a la emisión con información del cliente y enlaces rápidos.
- Listado de facturas emitidas con filtros, indicador de saldo y acceso al detalle de pagos.

## 7. Configuración y utilidades del frontend

- **Selector de tema:** botón accesible presente en todas las vistas privadas para alternar entre modo claro y oscuro, sincronizado con `localStorage`.
- **Gestión de navegación:** barra lateral responsive con control de apertura/cierre en dispositivos móviles.
- **Configuración de entorno:** `env.js` generado durante el build expone la URL del backend consumida por todas las solicitudes `fetch`.

## 8. Recursos adicionales de documentación

- `docs/configuracion-inicial.md` resume los pasos para configurar Supabase y Render.
- Directorio `docs/sql/` contiene scripts de creación de tablas para cuentas por cobrar, órdenes de compra y ajustes de auditoría.

## 9. Flujo de navegación recomendado

1. Configurar credenciales en Supabase y variables en el backend.
2. Ejecutar la API y acceder al login del frontend.
3. Registrar maestros clave (terceros, artículos, almacenes).
4. Crear órdenes de compra y registrar su recepción en almacén.
5. Emitir facturas de venta y dar seguimiento a los pagos de clientes desde el módulo de CxC.
6. Revisar el dashboard para validar indicadores y actividad reciente.

---

> **Nota:** Todas las operaciones aprovechan encabezados opcionales `x-admin-id` y `x-admin-name` para propagar información del usuario a las bitácoras de auditoría.
