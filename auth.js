// ============================================================
// AUTENTICACIÓN — AccesoClientes
// Valida credenciales contra el CSV de Google Sheets y gestiona
// la sesión del usuario autenticado en sessionStorage.
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
// Devuelve una Promise que resuelve con { ok, idCliente, usuario, mensaje }
async function validateLogin(usuario, clave) {
  try {
    const response = await fetch(AUTH_CSV_URL);
    if (!response.ok) throw new Error("No se pudo acceder al servicio de autenticación.");

    const csv = await response.text();
    // PapaParse debe estar cargado antes de auth.js
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data;

    // Buscar coincidencia exacta por Usuario y Clave (trim para robustez)
    const match = rows.find(row => {
      const uRow   = (row["Usuario"] ?? "").trim();
      const cRow   = (row["Clave"]   ?? "").trim();
      const estado = (row["Estado"]  ?? "").trim().toLowerCase();
      return uRow === usuario.trim() && cRow === clave.trim() && estado === "activo";
    });

    if (!match) {
      // Verificar si el usuario existe pero está inactivo para dar mensaje más claro
      const existe = rows.find(row =>
        (row["Usuario"] ?? "").trim() === usuario.trim() &&
        (row["Clave"]   ?? "").trim() === clave.trim()
      );
      if (existe) {
        return { ok: false, mensaje: "Tu cuenta se encuentra inactiva. Contacta a la institución." };
      }
      return { ok: false, mensaje: "Usuario o contraseña incorrectos." };
    }

    const idCliente = (match["idCliente"] ?? "").trim();
    return { ok: true, idCliente, usuario: match["Usuario"].trim() };

  } catch (err) {
    return { ok: false, mensaje: "Error de red: no se pudo verificar las credenciales. Intenta nuevamente." };
  }
}
