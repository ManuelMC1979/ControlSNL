require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { pool } = require("./db");
const { requireAuth, login, logout } = require("./auth");
const { procesarWorkbook } = require("./importExcel");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.set("trust proxy", 1); // Render está detrás de un proxy (necesario para cookies "secure")

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cambia-esta-clave-en-produccion",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12, // 12 horas
    },
  })
);

// ---------- Login (público) ----------
app.get("/login", (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect("/");
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});
app.post("/login", login);
app.get("/logout", logout);

// ---------- Todo lo demás requiere contraseña ----------
app.use(requireAuth);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.get("/manual", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "manual.html"));
});

app.get("/actualizar", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "actualizar.html"));
});

app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- API: datos del panel, leídos desde Neon ----------
app.get("/api/dashboard-data", async (req, res) => {
  try {
    const [modulesRes, causasRes, masterRes] = await Promise.all([
      pool.query("SELECT * FROM modules_meta ORDER BY id"),
      pool.query("SELECT sev, h, p, s FROM causas ORDER BY orden"),
      pool.query(
        `SELECT module_id, fila, nombre, rut, rut_estado, rut_sugerencia, correo, servicio,
                paciente, ejecutivo, estado_bo, responsable_bo, ingreso, ingreso_sugerido, atencion,
                atencion_sugerida, inc_texto, inc_ok, sla_estado, dias, sec_estado, es_prueba,
                estado_gestion, repeticiones_rut, calidad_texto, todo_mayusculas, doble_espacio, falta_tilde,
                detalle, motivo_detalle
         FROM master_records ORDER BY module_id, fila`
      ),
    ]);

    const master = {};
    for (const row of masterRes.rows) {
      const mod = row.module_id;
      if (!master[mod]) master[mod] = [];
      master[mod].push({
        fila: row.fila,
        nombre: row.nombre,
        rut: row.rut,
        rutEstado: row.rut_estado,
        rutSugerencia: row.rut_sugerencia,
        correo: row.correo,
        servicio: row.servicio,
        paciente: row.paciente,
        ejecutivo: row.ejecutivo,
        estadoBO: row.estado_bo,
        responsableBO: row.responsable_bo,
        ingreso: row.ingreso,
        ingresoSugerido: row.ingreso_sugerido,
        atencion: row.atencion,
        atencionSugerida: row.atencion_sugerida,
        incTexto: row.inc_texto,
        incOk: row.inc_ok,
        slaEstado: row.sla_estado,
        dias: row.dias,
        secEstado: row.sec_estado,
        esPrueba: row.es_prueba,
        estadoGestion: row.estado_gestion,
        repeticionesRut: row.repeticiones_rut,
        calidadTexto: row.calidad_texto,
        todoMayusculas: row.todo_mayusculas,
        dobleEspacio: row.doble_espacio,
        faltaTilde: row.falta_tilde,
        detalle: row.detalle,
        motivoDetalle: row.motivo_detalle,
      });
    }

    const modulesMeta = modulesRes.rows.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      icon: m.icon,
      descripcion: m.descripcion,
      gestion: m.gestion,
      observacion: m.observacion,
      slaDias: m.sla_dias,
      issues: m.issues,
    }));

    res.json({
      modulesMeta,
      causas: causasRes.rows,
      master,
      excelShareLink: process.env.EXCEL_SHARE_LINK || "",
      referenceDate: process.env.REFERENCE_DATE || "13-08-2026",
    });
  } catch (err) {
    console.error("Error /api/dashboard-data:", err);
    res.status(500).json({ error: "No se pudo leer la base de datos." });
  }
});

// ---------- Actualizar datos: sube el Excel y reemplaza todo en Neon ----------
app.post("/api/actualizar-excel", upload.single("excel"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ningún archivo." });
  }

  let datos;
  try {
    datos = procesarWorkbook(req.file.buffer);
  } catch (err) {
    console.error("Error leyendo el Excel:", err);
    return res.status(400).json({ error: `No se pudo leer el archivo: ${err.message}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE master_records, modules_meta, causas RESTART IDENTITY");

    for (const m of datos.modulesMeta) {
      await client.query(
        `INSERT INTO modules_meta (id, nombre, icon, descripcion, gestion, observacion, sla_dias, issues)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [m.id, m.nombre, m.icon, m.descripcion, m.gestion, m.observacion, m.id === "reembolsos" ? 14 : 10, JSON.stringify(m.issues || [])]
      );
    }

    let ordenCausa = 0;
    for (const c of datos.causas) {
      await client.query(`INSERT INTO causas (sev, h, p, s, orden) VALUES ($1,$2,$3,$4,$5)`, [c.sev, c.h, c.p, c.s, ordenCausa++]);
    }

    let total = 0;
    for (const [moduleId, rows] of Object.entries(datos.master)) {
      for (const r of rows) {
        await client.query(
          `INSERT INTO master_records
            (module_id, fila, nombre, rut, rut_estado, rut_sugerencia, correo, servicio, paciente,
             ejecutivo, estado_bo, responsable_bo, ingreso, ingreso_sugerido, atencion, atencion_sugerida,
             inc_texto, inc_ok, sla_estado, dias, sec_estado, es_prueba, estado_gestion,
             repeticiones_rut, calidad_texto, todo_mayusculas, doble_espacio, falta_tilde, detalle, motivo_detalle)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
           ON CONFLICT (module_id, fila) DO NOTHING`,
          [
            moduleId, r.fila, r.nombre, r.rut, r.rutEstado, r.rutSugerencia, r.correo, r.servicio,
            r.paciente, r.ejecutivo, r.estadoBO, r.responsableBO, r.ingreso, r.ingresoSugerido, r.atencion,
            r.atencionSugerida, r.incTexto, r.incOk, null, null, null, r.esPrueba,
            r.estadoGestion, r.repeticionesRut, r.calidadTexto, r.todoMayusculas, r.dobleEspacio, r.faltaTilde,
            r.detalle, r.motivoDetalle,
          ]
        );
        total++;
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, total, porModulo: Object.fromEntries(Object.entries(datos.master).map(([k, v]) => [k, v.length])) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error actualizando la base de datos:", err);
    res.status(500).json({ error: "Se leyó el archivo pero no se pudo guardar en la base de datos." });
  } finally {
    client.release();
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    console.error("Error subiendo archivo:", err.message);
    return res.status(400).json({ error: `No se pudo procesar el archivo: ${err.message}` });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Panel de Auditoría SNL escuchando en el puerto ${PORT}`);
});
