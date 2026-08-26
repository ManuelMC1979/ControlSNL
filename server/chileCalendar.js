// Feriados legales de Chile (nacionales) para 2025 y 2026, usados para calcular
// días hábiles (se excluyen sábados, domingos y estos feriados).
//
// Nota: esta lista se armó con las fechas conocidas/confirmadas de los feriados
// nacionales fijos y los móviles de este período (Viernes/Sábado Santo y el Día
// Nacional de los Pueblos Indígenas, que depende del solsticio de invierno). Si
// el Congreso agrega un feriado nuevo o cambia una fecha, hay que sumarla aquí.

const FERIADOS_CL = new Set([
  // 2025
  "2025-01-01", // Año Nuevo
  "2025-04-18", // Viernes Santo
  "2025-04-19", // Sábado Santo
  "2025-05-01", // Día del Trabajo
  "2025-05-21", // Glorias Navales
  "2025-06-20", // Día Nacional de los Pueblos Indígenas
  "2025-06-29", // San Pedro y San Pablo
  "2025-07-16", // Virgen del Carmen
  "2025-08-15", // Asunción de la Virgen
  "2025-09-18", // Independencia Nacional
  "2025-09-19", // Glorias del Ejército
  "2025-10-12", // Encuentro de Dos Mundos
  "2025-10-31", // Día de las Iglesias Evangélicas y Protestantes
  "2025-11-01", // Día de Todos los Santos
  "2025-12-08", // Inmaculada Concepción
  "2025-12-25", // Navidad
  // 2026
  "2026-01-01",
  "2026-04-03", // Viernes Santo
  "2026-04-04", // Sábado Santo
  "2026-05-01",
  "2026-05-21",
  "2026-06-21", // Día Nacional de los Pueblos Indígenas (cae domingo)
  "2026-06-29",
  "2026-07-16",
  "2026-08-15",
  "2026-09-18",
  "2026-09-19",
  "2026-10-12",
  "2026-10-31",
  "2026-11-01",
  "2026-12-08",
  "2026-12-25",
]);

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function esHabil(date) {
  const dow = date.getDay(); // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return false;
  return !FERIADOS_CL.has(toKey(date));
}

// Cuenta los días hábiles ESTRICTAMENTE ENTRE dos fechas (no cuenta el día de inicio).
// Si "hasta" es anterior o igual a "desde", devuelve 0.
function diasHabilesEntre(desde, hasta) {
  if (!desde || !hasta || hasta <= desde) return 0;
  let dias = 0;
  const cursor = new Date(desde);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= hasta) {
    if (esHabil(cursor)) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

module.exports = { diasHabilesEntre, esHabil };
