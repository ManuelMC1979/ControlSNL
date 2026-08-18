// Validación de RUT chileno (algoritmo módulo 11).

function limpiar(rut) {
  return String(rut || "").replace(/[.\s]/g, "").toUpperCase();
}

function calcularDV(numero) {
  let suma = 0;
  let mult = 2;
  const digitos = String(numero).split("").reverse();
  for (const d of digitos) {
    suma += Number(d) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

// Devuelve { estado: 'valido'|'vacio'|'formato'|'dv', numero, dv, sugerencia }
function analizarRut(rutOriginal) {
  const limpio = limpiar(rutOriginal);
  if (!limpio) return { estado: "vacio", numero: null, dv: null, sugerencia: null };

  const m = limpio.match(/^(\d{7,8})-?([\dK])$/);
  if (!m) return { estado: "formato", numero: null, dv: null, sugerencia: null };

  const numero = m[1];
  const dvDeclarado = m[2];
  const dvCalculado = calcularDV(numero);

  if (dvDeclarado === dvCalculado) {
    return { estado: "valido", numero, dv: dvDeclarado, sugerencia: null };
  }
  return { estado: "dv", numero, dv: dvDeclarado, sugerencia: `${numero}-${dvCalculado}` };
}

module.exports = { limpiar, calcularDV, analizarRut };
