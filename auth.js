// ============================================================
// AUTENTICACIÓN — AccesoClientes
// Valida credenciales contra el CSV de Google Sheets y gestiona
// la sesión del usuario autenticado en sessionStorage.
// Columnas esperadas: idCliente, Usuario, Clave, Estado
// ============================================================

const AUTH_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRJLAt2vZXa-CVP_ij_oxwtoU6G_G3o5Y7YFwqted0RZSu52wsy1TQKcmWswMfqA5oRriZDh4kcBZyw/pub?gid=94960473&single=true&output=csv";

const SESSION_KEY = "authSession"; // clave en sessionStorage

// Devuelve la sesión activa o null
function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Guarda la sesión tras login exitoso
function saveSession(idCliente, usuario) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ idCliente, usuario }));
}

// Elimina la sesión (logout)
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// Redirige al login si no hay sesión activa (llamar al inicio de páginas protegidas)
function requireAuth() {
  if (!getSession()) {
    window.location.href = "login.html";
  }
}

// Busca en un objeto de fila el valor de una columna por nombre,
// comparando de forma insensible a mayúsculas y espacios.
// Soporta BOM y variaciones de casing en los encabezados del CSV.
function _getCol(row, nombre) {
  const nombreNorm = nombre.toLowerCase().replace(/\s/g, '');
  for (var key in row) {
    var keyNorm = key.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s/g, '');
    if (keyNorm === nombreNorm) return row[key] || '';
  }
  return '';
}

// Valida usuario y clave contra el CSV remoto.
// - El usuario puede ser email o alfanumérico (comparación sin distinción de mayúsculas).
// - La clave se compara de forma exacta (sensible a mayúsculas).
// - Solo usuarios con Estado "activo" (insensible a mayúsculas/espacios) pueden acceder.
// Devuelve una Promise que resuelve con { ok, idCliente, usuario, mensaje }
async function validateLogin(usuario, clave) {
  try {
    const response = await fetch(AUTH_CSV_URL);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const csv = await response.text();

    // Parsear con Papa.parse igual que lo hace app.js para las transacciones
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data;

    if (!rows || rows.length === 0) {
      return { ok: false, mensaje: "No se pudo leer la lista de acceso. Intenta nuevamente." };
    }

    const usuarioInput = usuario.trim().toLowerCase();
    const claveInput   = clave.trim();

    // Buscar coincidencia usando _getCol para tolerar cualquier variación
    // de nombre de columna (BOM, espacios, mayúsculas)
    var match = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var uRow   = _getCol(row, 'usuario').trim().toLowerCase();
      var cRow   = _getCol(row, 'clave').trim();
      var estado = _getCol(row, 'estado').trim().toLowerCase();
      if (uRow === usuarioInput && cRow === claveInput && estado === 'activo') {
        match = row;
        break;
      }
    }

    if (!match) {
      // Verificar si el usuario+clave existen pero la cuenta está inactiva
      var existeInactivo = false;
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        var u2 = _getCol(r, 'usuario').trim().toLowerCase();
        var c2 = _getCol(r, 'clave').trim();
        if (u2 === usuarioInput && c2 === claveInput) {
          existeInactivo = true;
          break;
        }
      }
      if (existeInactivo) {
        return { ok: false, mensaje: "Tu cuenta se encuentra inactiva. Contacta a la institución." };
      }
      return { ok: false, mensaje: "Usuario o contraseña incorrectos." };
    }

    var idCliente = _getCol(match, 'idcliente').trim();
    var usuarioVal = _getCol(match, 'usuario').trim();
    return { ok: true, idCliente: idCliente, usuario: usuarioVal };

  } catch (err) {
    return { ok: false, mensaje: "Error de red: no se pudo verificar las credenciales. Intenta nuevamente." };
  }
}

