// Carga los datos ya procesados (data/*.json) a la base Neon.
// Uso:
//   1) npm install
//   2) psql "$DATABASE_URL" -f db/schema.sql   (crea las tablas)
//   3) DATABASE_URL="postgres://..." node db/load_data.js
//
// No requiere que compartas el DATABASE_URL con nadie: lo corres tú mismo, localmente.

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta la variable de entorno DATABASE_URL (connection string de Neon).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requiere SSL
});

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8"));
}

async function main() {
  const master = readJson("master_data.json");   // { reembolsos: [...], informes: [...], otras: [...], cd: [...] }
  const modulesMeta = readJson("modules_meta.json"); // [ {id, nombre, icon, descripcion, total, sinError, conError, gestion, observacion, issues, rut, ...} ]
  const causas = readJson("causas.json");        // [ {sev, h, p, s} ]

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Limpiando tablas...");
    await client.query("TRUNCATE master_records, modules_meta, causas RESTART IDENTITY");

    console.log("Cargando modules_meta...");
    for (const m of modulesMeta) {
      await client.query(
        `INSERT INTO modules_meta (id, nombre, icon, descripcion, gestion, observacion, sla_dias, issues)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          m.id, m.nombre, m.icon, m.descripcion, m.gestion, m.observacion,
          m.id === "reembolsos" ? 14 : 10,
          JSON.stringify(m.issues || []),
        ]
      );
    }

    console.log("Cargando causas...");
    let ordenCausa = 0;
    for (const c of causas) {
      await client.query(
        `INSERT INTO causas (sev, h, p, s, orden) VALUES ($1,$2,$3,$4,$5)`,
        [c.sev, c.h, c.p, c.s, ordenCausa++]
      );
    }

    console.log("Cargando master_records...");
    let total = 0;
    for (const [moduleId, rows] of Object.entries(master)) {
      for (const r of rows) {
        await client.query(
          `INSERT INTO master_records
            (module_id, fila, nombre, rut, rut_estado, rut_sugerencia, correo, servicio, paciente,
             ejecutivo, estado_bo, responsable_bo, ingreso, ingreso_sugerido, atencion, atencion_sugerida,
             inc_texto, inc_ok, sla_estado, dias, sec_estado, es_prueba, estado_gestion,
             repeticiones_rut, calidad_texto, todo_mayusculas, doble_espacio, falta_tilde)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
           ON CONFLICT (module_id, fila) DO NOTHING`,
          [
            moduleId, r.fila, r.nombre, r.rut, r.rutEstado, r.rutSugerencia, r.correo, r.servicio,
            r.paciente, r.ejecutivo, r.estadoBO, r.responsableBO, r.ingreso, r.ingresoSugerido, r.atencion,
            r.atencionSugerida, r.incTexto, r.incOk, r.slaEstado, r.dias, r.secEstado, r.esPrueba,
            r.estadoGestion, r.repeticionesRut, r.calidadTexto, r.todoMayusculas, r.dobleEspacio, r.faltaTilde,
          ]
        );
        total++;
      }
    }

    await client.query("COMMIT");
    console.log(`Listo. ${total} registros cargados en master_records.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error cargando datos:", err);
  process.exit(1);
});
