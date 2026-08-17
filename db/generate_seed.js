// Genera db/seed_data.sql a partir de db/schema.sql + data/*.json.
// Uso: node db/generate_seed.js
//
// Este script no toca Neon — solo arma el archivo SQL que después se pega
// en el SQL Editor de Neon (o se corre con psql "$DATABASE_URL" -f db/seed_data.sql).

const fs = require("fs");
const path = require("path");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8"));
}

function sqlStr(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlBool(v) {
  if (v === null || v === undefined) return "NULL";
  return v ? "TRUE" : "FALSE";
}
function sqlNum(v) {
  return v === null || v === undefined ? "NULL" : Number(v);
}
function sqlJsonb(v) {
  return "'" + JSON.stringify(v || []).replace(/'/g, "''") + "'::jsonb";
}

function main() {
  const master = readJson("master_data.json");
  const modulesMeta = readJson("modules_meta.json");
  const causas = readJson("causas.json");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  const lines = [];
  lines.push("-- Script único: crea las tablas y carga todos los datos.");
  lines.push("-- Cómo usarlo: Neon → tu proyecto → SQL Editor → pega este archivo completo → Run.");
  lines.push('-- También sirve con: psql "$DATABASE_URL" -f db/seed_data.sql');
  lines.push("");
  lines.push(schema.trim());
  lines.push("");
  lines.push("");
  lines.push("TRUNCATE master_records, modules_meta, causas RESTART IDENTITY;");
  lines.push("");

  lines.push("-- modules_meta");
  for (const m of modulesMeta) {
    const slaDias = m.id === "reembolsos" ? 14 : 10;
    lines.push(
      `INSERT INTO modules_meta (id, nombre, icon, descripcion, gestion, observacion, sla_dias, issues) VALUES (` +
        [sqlStr(m.id), sqlStr(m.nombre), sqlStr(m.icon), sqlStr(m.descripcion), sqlStr(m.gestion), sqlStr(m.observacion), slaDias, sqlJsonb(m.issues)].join(", ") +
        `);`
    );
  }
  lines.push("");

  lines.push("-- causas");
  let orden = 0;
  for (const c of causas) {
    lines.push(
      `INSERT INTO causas (sev, h, p, s, orden) VALUES (` +
        [sqlStr(c.sev), sqlStr(c.h), sqlStr(c.p), sqlStr(c.s), orden++].join(", ") +
        `);`
    );
  }
  lines.push("");

  lines.push("-- master_records");
  const cols = [
    "module_id", "fila", "nombre", "rut", "rut_estado", "rut_sugerencia", "correo", "servicio",
    "paciente", "ejecutivo", "estado_bo", "responsable_bo", "ingreso", "ingreso_sugerido", "atencion",
    "atencion_sugerida", "inc_texto", "inc_ok", "sla_estado", "dias", "sec_estado", "es_prueba",
    "estado_gestion", "repeticiones_rut", "calidad_texto", "todo_mayusculas", "doble_espacio", "falta_tilde",
    "detalle", "motivo_detalle",
  ];

  for (const [moduleId, rows] of Object.entries(master)) {
    if (!rows.length) continue;
    lines.push(`INSERT INTO master_records (${cols.join(", ")}) VALUES`);
    const values = rows.map((r) => {
      const vals = [
        sqlStr(moduleId), sqlNum(r.fila), sqlStr(r.nombre), sqlStr(r.rut), sqlStr(r.rutEstado), sqlStr(r.rutSugerencia),
        sqlStr(r.correo), sqlStr(r.servicio), sqlStr(r.paciente), sqlStr(r.ejecutivo), sqlStr(r.estadoBO),
        sqlStr(r.responsableBO), sqlStr(r.ingreso), sqlStr(r.ingresoSugerido), sqlStr(r.atencion), sqlStr(r.atencionSugerida),
        sqlStr(r.incTexto), sqlBool(r.incOk), sqlStr(r.slaEstado), sqlNum(r.dias), sqlStr(r.secEstado), sqlBool(r.esPrueba),
        sqlStr(r.estadoGestion), sqlNum(r.repeticionesRut), sqlStr(r.calidadTexto), sqlBool(r.todoMayusculas),
        sqlBool(r.dobleEspacio), sqlBool(r.faltaTilde), sqlStr(r.detalle), sqlStr(r.motivoDetalle),
      ];
      return `(${vals.join(", ")})`;
    });
    lines.push(values.join(",\n") + ";");
    lines.push("");
  }

  fs.writeFileSync(path.join(__dirname, "seed_data.sql"), lines.join("\n") + "\n");
  console.log("db/seed_data.sql regenerado.");
}

main();
