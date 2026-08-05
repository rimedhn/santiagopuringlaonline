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

// Valida usuario y clave contra el CSV remoto.
// - El usuario puede ser email o alfanumérico (comparación sin distinción de mayúsculas).
// - La clave se compara de forma exacta (sensible a mayúsculas).
// - Solo usuarios con Estado "activo" (insensible a mayúsculas/espacios) pueden acceder.
// Devuelve una Promise que resuelve con { ok, idCliente, usuario, mensaje }
async function validateLogin(usuario, clave) {
  try {
    const response = await fetch(AUTH_CSV_URL);
    if (!response.ok) throw new Error("No se pudo acceder al servicio de autenticación.");

    const csv = await response.text();

    // transformHeader: elimina BOM (\ufeff) y espacios en blanco de los nombres de columna.
    // Google Sheets suele añadir BOM al inicio del primer encabezado del CSV.
    const parsed = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: function (h) {
        return h.replace(/^\uFEFF/, '').trim();
      }
    });
    const rows = parsed.data;

    const usuarioInput = usuario.trim().toLowerCase();
    const claveInput   = clave.trim();

    // Buscar coincidencia: usuario case-insensitive (soporta email o alfanumérico),
    // clave exacta, estado activo (insensible a mayúsculas y espacios)
    const match = rows.find(function (row) {
      const uRow   = (row["Usuario"] ?? "").trim().toLowerCase();
      const cRow   = (row["Clave"]   ?? "").trim();
      const estado = (row["Estado"]  ?? "").trim().toLowerCase();
      return uRow === usuarioInput && cRow === claveInput && estado === "activo";
    });

    if (!match) {
      // Verificar si el usuario+clave existen pero la cuenta está inactiva
      const existeInactivo = rows.find(function (row) {
        const uRow = (row["Usuario"] ?? "").trim().toLowerCase();
        const cRow = (row["Clave"]   ?? "").trim();
        return uRow === usuarioInput && cRow === claveInput;
      });
      if (existeInactivo) {
        return { ok: false, mensaje: "Tu cuenta se encuentra inactiva. Contacta a la institución." };
      }
      return { ok: false, mensaje: "Usuario o contraseña incorrectos." };
    }

    const idCliente = (match["idCliente"] ?? "").trim();
    return { ok: true, idCliente, usuario: (match["Usuario"] ?? "").trim() };

  } catch (err) {
    return { ok: false, mensaje: "Error de red: no se pudo verificar las credenciales. Intenta nuevamente." };
  }
}

