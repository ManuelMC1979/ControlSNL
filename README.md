# Panel de Auditoría SNL (Progesys)

Panel interno con la auditoría de fechas, RUT y cumplimiento de SLA de las solicitudes SNL.
Los datos viven en una base Postgres (Neon) y el panel se protege con una contraseña compartida.

## Estructura

```
db/schema.sql       Tablas en Neon (master_records, modules_meta, causas)
db/load_data.js      Script para cargar los datos precomputados en Neon
data/*.json          Los datos ya procesados (RUT, fechas, SLA) listos para cargar
server/index.js       Servidor Express: login + API que lee de Neon
public/dashboard.html El panel (pide los datos a /api/dashboard-data)
public/manual.html    El manual de uso, protegido igual que el panel
public/login.html     Pantalla de ingreso con contraseña
```

## 1) Crear la base en Neon

### Opción A — sin usar la terminal (más simple)

1. Entra a [neon.tech](https://neon.tech) → tu proyecto → **SQL Editor** (en el menú lateral).
2. Abre `db/seed_data.sql` de este repo, copia todo el contenido y pégalo en el editor.
3. Click en **Run**. Crea las 3 tablas y carga los 1.829 registros en un solo paso.
   Al final deberías poder correr `SELECT COUNT(*) FROM master_records;` y ver 1829.

### Opción B — con terminal (si prefieres)

1. Copia el **connection string** (Dashboard → Connection Details). Se ve así:
   `postgres://usuario:password@ep-xxxx.neon.tech/neondb?sslmode=require`
2. Crea las tablas y carga los datos con un solo archivo:
   ```bash
   psql "TU_CONNECTION_STRING" -f db/seed_data.sql
   ```
   (o, si prefieres el script de Node con más control/logs: `npm install && DATABASE_URL="TU_CONNECTION_STRING" npm run load-data`)

Si más adelante actualizas el Excel de solicitudes, vuelve a generar `data/master_data.json`
y `db/seed_data.sql` (pídemelo a mí, o corre de nuevo el análisis) y repite este paso — vuelve
a dejar los datos como en el archivo, reemplazando lo que hubiera antes.

## 2) Desplegar en Render

1. Sube este repo a GitHub (ya está conectado a `ManuelMC1979/ControlSNL`).
2. En [render.com](https://render.com) → **New → Blueprint**, selecciona este repositorio.
   Render va a leer `render.yaml` y crear el servicio automáticamente.
3. Cuando te pida las variables de entorno, completa:
   - `DATABASE_URL`: el connection string de Neon (el mismo del paso 1).
   - `APP_PASSWORD`: la contraseña con la que el equipo va a entrar al panel.
   - `EXCEL_SHARE_LINK`: el link para compartir del Excel en OneDrive/SharePoint.
   - `SESSION_SECRET`: Render la genera sola, no la toques.
4. Deploy. Render te da una URL tipo `https://controlsnl-panel.onrender.com`.

Si prefieres no usar el Blueprint: **New → Web Service**, conecta el repo, y configura a mano:
- Build command: `npm install`
- Start command: `npm start`
- Las mismas variables de entorno del paso 3.

## 3) Usar el panel

- Entra a la URL que te dio Render → pide la contraseña (`APP_PASSWORD`) → panel.
- `/manual` tiene la guía de uso completa.
- El botón "Cerrar sesión" en la barra lateral cierra el acceso.

## Notas

- La contraseña es única para todo el equipo (no hay usuarios individuales). Si necesitas
  revocar el acceso, cambia `APP_PASSWORD` en Render y redeploya.
- Los cálculos de días hábiles, SLA y validación de RUT ya vienen resueltos en los datos
  cargados (no se recalculan en el servidor). Si cambian las reglas de negocio (feriados,
  plazos de SLA), avísame para regenerar `data/master_data.json` antes de recargar.
- El botón "Abrir en la planilla" usa el link de OneDrive/SharePoint (`EXCEL_SHARE_LINK`)
  y arma la URL con la hoja y fila exactas; funciona mejor si todos en el equipo tienen
  acceso a ese archivo compartido.
