// Lee el Excel de Solicitudes SNL (formato ACHS/Progesys) y produce el mismo
// dataset que usa el panel: { master, modulesMeta, causas }.
//
// Usa como fuente de verdad las hojas "Auditoria_*" del propio archivo para
// todo lo que ya viene auditado ahí (validez de RUT, duplicados, estado de
// gestión, calidad de la redacción) — así el panel queda alineado con la
// auditoría que el equipo ya revisa en Excel. Lo que no viene en esas hojas
// (inconsistencia de fecha, filas de prueba, motivo de "Otras Solicitudes",
// corrección sugerida de fecha) se calcula aquí con reglas fijas.

const XLSX = require("xlsx");
const { analizarRut } = require("./rutUtils");

const REFERENCE_DATE = new Date(2026, 7, 15); // 15-08-2026, misma fecha que usa el panel

const MOTIVO_CATS = [
  ["licencia", [/licencia/]],
  ["receta", [/receta/, /medicament/]],
  ["examen", [/orden de examen/, /orden medic/, /orden clinic/, /examen/, /\brx\b/, /radiograf/, /resonanc/, /\btac\b/, /ecg/, /electrocardiogram/, /escaner/, /scanner/]],
  ["informe", [/informe/, /certificad/, /ficha medic/, /hoja de atencion/]],
  ["reembolso", [/boleta/, /reembolso/, /devoluci/, /isapre/, /banmedica/, /doble cobro/]],
  ["agendar", [/reagend/, /confirmar/, /\bhora\b/, /\bcita\b/, /agend/, /link/]],
  ["correccion", [/correg/, /modific/, /\berror\b/, /equivocaci/, /incorrect/, /mal escrit/, /cambiar fecha/]],
  ["derivacion", [/kinesiolog/, /psicolog/, /derivaci/, /especialist/, /terapia/]],
  ["demora", [/no ha llegado/, /no le lleg/, /no llega/, /no ha recibido/, /no recibi/, /aun no/, /todavia no/, /demora/, /espera/]],
  ["prueba", [/^prueba/, /\btest\b/, /^1234$/]],
];

function stripAccents(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function detectarMotivo(texto) {
  if (!texto) return null;
  const t = stripAccents(texto).toLowerCase();
  const matched = MOTIVO_CATS.filter(([, pats]) => pats.some((p) => p.test(t))).map(([slug]) => slug);
  return (matched.length ? matched : ["otro"]).join(",");
}

function esPrueba(nombre, rutNumero, detalle) {
  const n = String(nombre || "");
  const d = String(detalle || "");
  if (/^\s*(solo\s+)?prueba\b/i.test(n)) return true;
  if (/^\s*prueba\s*$/i.test(d)) return true;
  if (rutNumero === "1234") return true;
  return false;
}

function cell(row, i) {
  const v = row[i];
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Excel puede traer la fecha como objeto Date (si la celda tiene formato fecha)
// o como texto "dd-mm-aaaa". Normalizamos siempre a texto "dd-mm-aaaa".
function fechaATexto(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const d = String(v.getDate()).padStart(2, "0");
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const y = v.getFullYear();
    return `${d}-${m}-${y}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}`;
  return null; // texto que no es una fecha reconocible (ej. errores de tipeo en la celda)
}

function parseDMY(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getMonth() !== Number(mo) - 1) return null; // fecha inválida (ej. 31-02)
  return date;
}

function sugerirSwap(fechaTexto) {
  const m = String(fechaTexto || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (d === mo) return null;
  const dNum = Number(d);
  if (dNum < 1 || dNum > 12) return null; // el día no puede pasar a ser mes si es >12
  return `${mo}-${d}-${y}`;
}

function calcularInconsistencia(ingresoTexto, atencionTexto) {
  const ingreso = parseDMY(ingresoTexto);
  const atencion = parseDMY(atencionTexto);
  if (ingreso && ingreso > REFERENCE_DATE) {
    const sug = sugerirSwap(ingresoTexto);
    const swapped = sug ? parseDMY(sug) : null;
    return { texto: "Fecha de ingreso futura", ok: false, ingresoSugerido: swapped && swapped <= REFERENCE_DATE ? sug : null };
  }
  if (ingreso && atencion && atencion > ingreso) {
    const sug = sugerirSwap(atencionTexto);
    const swapped = sug ? parseDMY(sug) : null;
    return { texto: "Atención posterior al ingreso", ok: false, atencionSugerida: swapped && swapped <= ingreso ? sug : null };
  }
  return { texto: "OK", ok: true };
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toUpperCase();
  return s === "TRUE" || s === "SI" || s === "SÍ" || s === "X" || s === "1";
}

function leerAuditoria(wb, sheetName, cols) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1, defval: null });
  const map = new Map();
  for (const row of rows) {
    const fila = row[cols.fila];
    if (fila === null || fila === undefined || fila === "") continue;
    map.set(Number(fila), row);
  }
  return map;
}

function procesarModulo({ wb, moduleId, rawSheet, rawCols, auditSheet, auditCols }) {
  const wsRaw = wb.Sheets[rawSheet];
  if (!wsRaw) throw new Error(`No se encontró la hoja "${rawSheet}" en el archivo.`);
  const rawRows = XLSX.utils.sheet_to_json(wsRaw, { header: 1, range: 1, defval: null });
  const audit = leerAuditoria(wb, auditSheet, auditCols);

  // duplicados: se recalculan aquí también, por si el archivo no trae "Repeticiones RUT" al día.
  const rutCount = new Map();
  const parsedRows = [];

  rawRows.forEach((row, idx) => {
    const fila = idx + 2; // fila 1 = encabezado
    const algunDato = row.some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!algunDato) return; // fila totalmente vacía
    const nombre = cell(row, rawCols.nombre) || "(sin nombre)";

    const rutOriginal = cell(row, rawCols.rut);
    const rutInfo = analizarRut(rutOriginal);
    if (rutInfo.estado === "valido") {
      rutCount.set(rutInfo.numero, (rutCount.get(rutInfo.numero) || 0) + 1);
    }

    const a = audit.get(fila) || [];
    const detalle = rawCols.detalle !== undefined ? cell(row, rawCols.detalle) : (auditCols.detalle !== undefined ? cell(a, auditCols.detalle) : null);

    const ingresoTexto = fechaATexto(rawCols.ingreso !== undefined ? row[rawCols.ingreso] : null);
    const atencionTexto = fechaATexto(rawCols.atencion !== undefined ? row[rawCols.atencion] : null);
    const inc = calcularInconsistencia(ingresoTexto, atencionTexto);

    const estadoGestion = auditCols.estadoGestion !== undefined ? cell(a, auditCols.estadoGestion) : null;

    const q = auditCols.calidadAuto !== undefined
      ? {
          calidad: cell(a, auditCols.calidadAuto),
          allcaps: truthy(a[auditCols.allcaps]),
          corto: truthy(a[auditCols.corto]),
          dobleEsp: truthy(a[auditCols.dobleEsp]),
          faltaTilde: truthy(a[auditCols.faltaTilde]),
        }
      : { calidad: null, allcaps: null, corto: null, dobleEsp: null, faltaTilde: null };

    parsedRows.push({
      fila,
      nombre,
      rutOriginal,
      rutInfo,
      correo: rawCols.correo !== undefined ? cell(row, rawCols.correo) : null,
      servicio: rawCols.servicio !== undefined ? cell(row, rawCols.servicio) : null,
      paciente: rawCols.canal !== undefined ? cell(row, rawCols.canal) : null,
      ejecutivo: auditCols.ejecutivo !== undefined ? cell(a, auditCols.ejecutivo) : (rawCols.ejecutivo !== undefined ? cell(row, rawCols.ejecutivo) : null),
      estadoBO: rawCols.estadoBO !== undefined ? cell(row, rawCols.estadoBO) : null,
      responsableBO: rawCols.responsableBO !== undefined ? cell(row, rawCols.responsableBO) : null,
      ingreso: ingresoTexto,
      ingresoSugerido: inc.ingresoSugerido || null,
      atencion: atencionTexto,
      atencionSugerida: inc.atencionSugerida || null,
      incTexto: inc.texto,
      incOk: inc.ok,
      estadoGestion,
      detalle,
      calidad: q,
    });
  });

  const otrasSlug = moduleId === "otras";
  const rows = parsedRows.map((r) => {
    const rutEstado = r.rutInfo.estado;
    const repeticionesRut = rutEstado === "valido" ? rutCount.get(r.rutInfo.numero) || 1 : null;
    return {
      fila: r.fila,
      nombre: r.nombre,
      rut: r.rutOriginal ? String(r.rutOriginal).trim() : null,
      rutEstado,
      rutSugerencia: r.rutInfo.sugerencia,
      correo: r.correo,
      servicio: r.servicio,
      paciente: r.paciente,
      ejecutivo: r.ejecutivo,
      estadoBO: r.estadoBO,
      responsableBO: r.responsableBO,
      ingreso: r.ingreso,
      ingresoSugerido: r.ingresoSugerido,
      atencion: r.atencion,
      atencionSugerida: r.atencionSugerida,
      incTexto: r.incTexto,
      incOk: r.incOk,
      slaEstado: null,
      dias: null,
      secEstado: null,
      esPrueba: esPrueba(r.nombre, r.rutInfo.numero, r.detalle),
      estadoGestion: r.estadoGestion,
      repeticionesRut,
      calidadTexto: r.calidad.calidad,
      todoMayusculas: r.calidad.allcaps,
      dobleEspacio: r.calidad.dobleEsp,
      faltaTilde: r.calidad.faltaTilde,
      detalle: otrasSlug ? r.detalle : null,
      motivoDetalle: otrasSlug ? detectarMotivo(r.detalle) : null,
    };
  });

  return rows;
}

const MODULOS = [
  {
    id: "otras",
    nombre: "Otras Solicitudes",
    icon: "🗂️",
    descripcion: "Recetas, órdenes médicas, certificados y otras solicitudes generales.",
    rawSheet: "Otras solicitudes",
    rawCols: { ingreso: 0, canal: 1, servicio: 3, nombre: 5, rut: 6, correo: 7, atencion: 8, detalle: 9 },
    auditSheet: "Auditoria_OtrasSolicitudes",
    auditCols: { fila: 15, ejecutivo: 19, detalle: 20, estadoGestion: 22, allcaps: 30, corto: 31, dobleEsp: 32, faltaTilde: 33, calidadAuto: 34 },
  },
  {
    id: "cd",
    nombre: "CD Pendiente",
    icon: "🏥",
    descripcion: "Confirmaciones diagnósticas pendientes de agendamiento o respuesta.",
    rawSheet: "Cita pendiente Conf.Diag",
    rawCols: { ingreso: 0, canal: 1, servicio: 3, nombre: 5, rut: 6, correo: 7, atencion: 8, detalle: 9 },
    auditSheet: "Auditoria_CitasPendientes",
    auditCols: { fila: 15, ejecutivo: 19, detalle: 20, estadoGestion: 22, allcaps: 31, corto: 32, dobleEsp: 33, faltaTilde: 34, calidadAuto: 35 },
  },
  {
    id: "pacienteep",
    nombre: "Paciente Derivado EP",
    icon: "🧑‍⚕️",
    descripcion: "Pacientes derivados a Evaluación Preventiva (EP) desde otros servicios.",
    rawSheet: "Paciente derivado EP",
    rawCols: { ingreso: 0, canal: 1, servicio: 3, nombre: 5, rut: 6, correo: 7, atencion: 8, detalle: 9 },
    auditSheet: "Auditoria_PacienteEP",
    auditCols: { fila: 15, ejecutivo: 19, detalle: 20, estadoGestion: 23 },
  },
  {
    id: "reembolsos",
    nombre: "Reembolsos",
    icon: "💳",
    descripcion: "Solicitudes de reembolso de gastos médicos particulares.",
    rawSheet: "Reembolsos",
    rawCols: { canal: 1, servicio: 3, nombre: 4, rut: 5, correo: 6, ingreso: 7, estadoBO: 19, responsableBO: 20 },
    auditSheet: "Auditoria_Reembolsos",
    auditCols: { fila: 15, ejecutivo: 18, estadoGestion: 22 },
  },
  {
    id: "informes",
    nombre: "Informes Médicos",
    icon: "📄",
    descripcion: "Solicitudes de informes, certificados y licencias médicas.",
    rawSheet: "CDPendiente_BASE",
    rawCols: { ingreso: 0, canal: 1, servicio: 3, nombre: 8, rut: 9, correo: 10, atencion: 14, detalle: 15 },
    auditSheet: "Auditoria_InformeMedico",
    auditCols: { fila: 15, ejecutivo: 19, detalle: 20, estadoGestion: 22, allcaps: 30, corto: 31, dobleEsp: 32, faltaTilde: 33, calidadAuto: 34 },
  },
];

function construirModulesMetaYCausas(master, modulosBase) {
  const modulesMeta = modulosBase.map((mod) => {
    const rows = master[mod.id] || [];
    const total = rows.length;
    const con = rows.filter((r) => r.estadoGestion && !/SIN/i.test(r.estadoGestion)).length;
    const sin = rows.filter((r) => r.estadoGestion && /SIN/i.test(r.estadoGestion)).length;
    const gestion = sin > 0
      ? `${total ? ((100 * con) / total).toFixed(1) : "0.0"}% de los casos tiene gestión registrada — ${sin} sin gestión.`
      : `${total ? ((100 * con) / total).toFixed(1) : "0.0"}% de los casos tiene gestión registrada.`;

    const dupGrupos = new Set(rows.filter((r) => r.rutEstado === "valido" && r.repeticionesRut > 1).map((r) => r.rut)).size;
    const observacion = dupGrupos > 0
      ? `${dupGrupos} RUT distintos se repiten dentro de este módulo (posibles duplicados).`
      : "No se detectaron RUT repetidos en este módulo.";

    const futuras = rows.filter((r) => r.incTexto === "Fecha de ingreso futura").length;
    const posteriores = rows.filter((r) => r.incTexto === "Atención posterior al ingreso").length;
    const issues = [];
    if (posteriores > 0) issues.push({ t: "Atención posterior al ingreso", c: posteriores, sev: "critical" });
    if (futuras > 0) issues.push({ t: "Fecha de ingreso futura", c: futuras, sev: "serious" });
    issues.sort((a, b) => b.c - a.c);

    return { id: mod.id, nombre: mod.nombre, icon: mod.icon, descripcion: mod.descripcion, gestion, observacion, issues };
  });

  const totalRows = Object.values(master).flat();
  const totalSin = totalRows.filter((r) => r.estadoGestion && /SIN/i.test(r.estadoGestion)).length;
  const totalMal = totalRows.filter((r) => r.rutEstado !== "valido").length;
  const totalDup = new Set(totalRows.filter((r) => r.rutEstado === "valido" && r.repeticionesRut > 1).map((r) => r.rut)).size;
  const totalPrueba = totalRows.filter((r) => r.esPrueba).length;
  const totalRegular = totalRows.filter((r) => r.calidadTexto === "Regular").length;
  const totalDeficiente = totalRows.filter((r) => r.calidadTexto === "Deficiente").length;
  const totalPosteriores = totalRows.filter((r) => r.incTexto === "Atención posterior al ingreso").length;

  const causas = [
    { sev: "critical", h: `${totalSin} solicitudes sin gestión registrada`, p: `De las ${totalRows.length} solicitudes analizadas, ${totalSin} no tienen ninguna evidencia de que alguien las haya trabajado.`, s: "Priorizar el cierre de estos casos partiendo por los más antiguos. A futuro, hacer obligatorio dejar una nota de gestión antes de poder cerrar o archivar una solicitud." },
    { sev: "critical", h: `Atención registrada después del ingreso (${totalPosteriores} casos)`, p: "La fecha de atención debería ser siempre anterior a la fecha en que se ingresó el caso. Cuando aparece al revés, normalmente indica que se escribió mal una de las dos fechas.", s: "Revisar caso a caso en la sección de inconsistencias de cada módulo." },
    { sev: "serious", h: `${totalDup} RUT que se repiten dentro de un mismo módulo`, p: "Puede ser un paciente que pidió lo mismo varias veces, o un caso duplicado que ya se atendió y se volvió a registrar por error.", s: "Revisar los grupos de RUT repetido antes de gestionar un caso nuevo." },
    { sev: "serious", h: `${totalMal} RUT mal escritos`, p: "Registros con RUT vacío, con formato raro, o con un dígito verificador que no corresponde al número.", s: "Corregir estos casos en la base — el detalle exacto está disponible en la pestaña Auditoría de RUT." },
    { sev: "warning", h: `Al menos ${totalPrueba} filas de prueba mezcladas con datos reales`, p: "Se detectaron registros como \"Prueba\" o RUT \"1234\" mezclados entre las solicitudes reales.", s: "Eliminar o marcar claramente estas filas como \"prueba\" para que no se cuenten en las estadísticas." },
    { sev: "warning", h: `Calidad de la redacción: ${totalRegular} solicitudes "Regular" y ${totalDeficiente} "Deficiente"`, p: "Al revisar cómo quedó escrita la descripción de cada solicitud, algunas quedaron poco claras o muy cortas como para entender qué pide el paciente.", s: "Pedir al equipo que, al registrar el detalle, escriba al menos una frase completa y clara." },
  ];

  return { modulesMeta, causas };
}

function procesarWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const master = {};
  for (const mod of MODULOS) {
    master[mod.id] = procesarModulo({ wb, moduleId: mod.id, ...mod });
  }
  const { modulesMeta, causas } = construirModulesMetaYCausas(master, MODULOS);
  const totalRegistros = Object.values(master).reduce((a, rows) => a + rows.length, 0);
  return { master, modulesMeta, causas, totalRegistros };
}

module.exports = { procesarWorkbook };
