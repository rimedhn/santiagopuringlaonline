// ============================================================
// Google Apps Script — Inversiones y Servicios Santiago Puringla
// Backend API para autenticación y consulta de transacciones.
//
// INSTRUCCIONES DE DESPLIEGUE:
// 1. Abre script.google.com y crea un nuevo proyecto.
// 2. Pega este código y guarda.
// 3. Menú → Implementar → Nueva implementación
//    - Tipo: Aplicación web
//    - Ejecutar como: Yo (your Google account)
//    - Acceso: Cualquier usuario (Anyone)
// 4. Autoriza los permisos requeridos.
// 5. Copia la URL generada (/exec) y pégala en auth.js y app.js
//    como valor de SCRIPT_URL.
// ============================================================

// IDs de las hojas de cálculo
const SPREADSHEET_CONFIG = {
  acceso: {
    spreadsheetId: 'TU_SPREADSHEET_ID_DE_ACCESO_AQUI', // Hoja con columnas: idCliente, Usuario, Clave, Estado
    sheetName: 'Acceso'
  },
  transacciones: {
    spreadsheetId: 'TU_SPREADSHEET_ID_DE_TRANSACCIONES_AQUI', // Hoja con las transacciones de clientes
    sheetName: 'Transacciones'
  }
};

// ---- Punto de entrada POST ----
function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (_) {
        data = parseFormData(e.postData.contents);
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    } else {
      return createResponse({ error: 'No se recibieron datos válidos' });
    }

    switch (data.action) {
      case 'login':
        return createResponse(handleLogin(data.username, data.password));
      case 'getTransacciones':
        return createResponse(getTransacciones(data.codigoCliente, data.cuenta));
      default:
        return createResponse({ error: 'Acción no válida: ' + (data.action || 'undefined') });
    }
  } catch (error) {
    Logger.log('Error en doPost: ' + error.toString());
    return createResponse({ error: 'Error del servidor: ' + error.toString() });
  }
}

// ---- Punto de entrada GET ----
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    switch (action) {
      case 'getTransacciones':
        return createResponse(
          getTransacciones(
            (e.parameter.codigoCliente || '').trim(),
            (e.parameter.cuenta || '').trim()
          )
        );
      case 'test':
        return createResponse({ message: 'API funcionando', timestamp: new Date().toISOString() });
      default:
        return createResponse({
          message: 'API Santiago Puringla activa',
          timestamp: new Date().toISOString(),
          acciones: ['login (POST)', 'getTransacciones (GET/POST)']
        });
    }
  } catch (error) {
    Logger.log('Error en doGet: ' + error.toString());
    return createResponse({ error: 'Error en GET: ' + error.toString() });
  }
}

// ---- Helpers ----
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseFormData(formString) {
  const params = {};
  if (!formString || typeof formString !== 'string') return params;
  try {
    formString.split('&').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq > -1) {
        params[decodeURIComponent(pair.substring(0, eq))] =
          decodeURIComponent(pair.substring(eq + 1));
      }
    });
  } catch (err) {
    Logger.log('Error parseando form data: ' + err.toString());
  }
  return params;
}

// ---- Login: valida usuario y clave contra la hoja de Acceso ----
function handleLogin(username, password) {
  try {
    if (!username || !password) {
      return { success: false, message: 'Usuario y contraseña son requeridos' };
    }

    const config = SPREADSHEET_CONFIG.acceso;
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(config.sheetName);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return { success: false, message: 'No se pudo leer la lista de acceso' };
    }

    const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g, ''));
    const usernameNorm = username.trim().toLowerCase();
    const passwordRaw  = password.trim();

    let matchRow = null;
    let existeInactivo = false;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowObj = {};
      headers.forEach((h, idx) => { rowObj[h] = (row[idx] || '').toString().trim(); });

      const uRow    = rowObj['usuario'] ? rowObj['usuario'].toLowerCase() : '';
      const cRow    = rowObj['clave'] || '';
      const estado  = rowObj['estado'] ? rowObj['estado'].toLowerCase() : '';

      if (uRow === usernameNorm && cRow === passwordRaw) {
        if (estado === 'activo') {
          matchRow = rowObj;
          break;
        } else {
          existeInactivo = true;
        }
      }
    }

    if (matchRow) {
      return {
        success: true,
        idCliente: matchRow['idcliente'] || '',
        usuario: matchRow['usuario'] || '',
        message: 'Login exitoso'
      };
    }

    return {
      success: false,
      message: existeInactivo
        ? 'Tu cuenta se encuentra inactiva. Contacta a la institución.'
        : 'Usuario o contraseña incorrectos.'
    };

  } catch (error) {
    Logger.log('Error en handleLogin: ' + error.toString());
    return { success: false, message: 'Error al validar credenciales: ' + error.toString() };
  }
}

// ---- Transacciones: devuelve registros activos para el cliente o cuenta indicados ----
function getTransacciones(codigoCliente, cuenta) {
  try {
    const config = SPREADSHEET_CONFIG.transacciones;
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(config.sheetName);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return { error: 'No hay datos disponibles' };
    }

    const headers = data[0].map(h => h.toString().trim());
    const result = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const record = {};
      headers.forEach((h, idx) => {
        let val = row[idx];
        // Convertir fechas de Sheets al formato legible
        if (val instanceof Date) {
          const dd = String(val.getDate()).padStart(2, '0');
          const mm = String(val.getMonth() + 1).padStart(2, '0');
          const yyyy = val.getFullYear();
          val = `${dd}/${mm}/${yyyy}`;
        }
        record[h] = val !== undefined && val !== null ? val.toString() : '';
      });

      if (record['Estado'] !== 'Activo') continue;

      const matchCodigo = codigoCliente ? record['CodigoCliente'].trim() === codigoCliente.trim() : true;
      const matchCuenta  = cuenta        ? record['Cuenta'].trim() === cuenta.trim()               : true;

      if (codigoCliente && cuenta) {
        if (matchCodigo && matchCuenta) result.push(record);
      } else if (codigoCliente) {
        if (matchCodigo) result.push(record);
      } else if (cuenta) {
        if (matchCuenta) result.push(record);
      }
    }

    return result;

  } catch (error) {
    Logger.log('Error en getTransacciones: ' + error.toString());
    return { error: 'Error al obtener transacciones: ' + error.toString() };
  }
}
