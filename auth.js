// ============================================================
// AUTENTICACIÓN — AccesoClientes
// Valida credenciales vía Google Apps Script (backend seguro) y
// gestiona la sesión del usuario autenticado en sessionStorage.
// ============================================================

// URL del Web App de Google Apps Script desplegado.
// Después de desplegar script.gs, reemplaza este valor con la URL /exec generada.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxE3XqITPK4Qe-OvX20cYc1I7ncrVvir1UTeujYhCCTxGQ70Qk4Y1D_LIm_C4HVwnQ/exec";

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

// Valida usuario y clave contra el Google Apps Script backend.
// El script valida las credenciales server-side leyendo directamente la hoja de Acceso.
// Devuelve una Promise que resuelve con { ok, idCliente, usuario, mensaje }
async function validateLogin(usuario, clave) {
  try {
    const formData = new URLSearchParams();
    formData.append('action', 'login');
    formData.append('username', usuario.trim());
    formData.append('password', clave.trim());

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error("HTTP " + response.status);

    const result = await response.json();

    if (result.success) {
      return { ok: true, idCliente: result.idCliente || '', usuario: result.usuario || usuario.trim() };
    }

    return { ok: false, mensaje: result.message || 'Usuario o contraseña incorrectos.' };

  } catch (err) {
    return { ok: false, mensaje: "Error de red: no se pudo verificar las credenciales. Intenta nuevamente." };
  }
}

