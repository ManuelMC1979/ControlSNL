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

1. Entra a [neon.tech](https://neon.tech) y crea un proyecto (o usa el que ya tienes).
2. Copia el **connection string** (Dashboard → Connection Details). Se ve así:
   `postgres://usuario:password@ep-xxxx.neon.tech/neondb?sslmode=require`
3. Crea las tablas:
   ```bash
   psql "TU_CONNECTION_STRING" -f db/schema.sql
   ```
4. Carga los datos (usa el connection string solo en tu máquina, no lo compartas):
   ```bash
   npm install
   DATABASE_URL="TU_CONNECTION_STRING" npm run load-data
   ```
   Debería terminar con `Listo. 1829 registros cargados en master_records.`

Si más adelante actualizas el Excel de solicitudes, vuelve a generar `data/master_data.json`
(pídemelo a mí, o corre de nuevo el análisis) y repite el paso 4 — `load-data` reemplaza los
datos existentes.

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
