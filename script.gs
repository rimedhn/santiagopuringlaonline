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
    spreadsheetId: '1gZp6E_s8Te6nrbA48dgSKGCmPjce2-ZdLjPYx3rLiC8', // Hoja con columnas: idCliente, Usuario, Clave, Estado
    sheetName: 'AccesoClientes'
  },
  transacciones: {
    spreadsheetId: '1SKE-SnL9XwrXLX46p3uVf2c6UF2AU19UOSSsFsSuWGs', // Hoja con las transacciones de clientes
    sheetName: 'TransaccionesAhorros'
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
    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) {
      const hojasDisponibles = ss.getSheets().map(s => s.getName()).join(', ');
      Logger.log('Hoja de acceso no encontrada. Disponibles: ' + hojasDisponibles);
      return { success: false, message: 'Configuración incorrecta: hoja "' + config.sheetName + '" no existe. Hojas disponibles: ' + hojasDisponibles };
    }
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
    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) {
      const hojasDisponibles = ss.getSheets().map(s => s.getName()).join(', ');
      Logger.log('Hoja de transacciones no encontrada. Disponibles: ' + hojasDisponibles);
      return { error: 'Configuración incorrecta: hoja "' + config.sheetName + '" no existe. Hojas disponibles: ' + hojasDisponibles };
    }
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

// ---- Diagnóstico: ejecuta desde el editor de Apps Script para verificar conexiones ----
function testConexiones() {
  Logger.log('=== TEST CONEXIONES SANTIAGO PURINGLA ===');

  // Test hoja de Acceso
  try {
    const cfgA = SPREADSHEET_CONFIG.acceso;
    const ssA = SpreadsheetApp.openById(cfgA.spreadsheetId);
    const hojasA = ssA.getSheets().map(s => s.getName());
    Logger.log('Hojas en spreadsheet de Acceso (' + cfgA.spreadsheetId + '): ' + hojasA.join(', '));
    const sheetA = ssA.getSheetByName(cfgA.sheetName);
    if (sheetA) {
      Logger.log('✓ Hoja "' + cfgA.sheetName + '" encontrada. Filas: ' + sheetA.getLastRow());
      Logger.log('  Headers: ' + sheetA.getRange(1, 1, 1, sheetA.getLastColumn()).getValues()[0].join(', '));
    } else {
      Logger.log('✗ Hoja "' + cfgA.sheetName + '" NO encontrada.');
    }
  } catch (e) {
    Logger.log('✗ Error al abrir spreadsheet de Acceso: ' + e.toString());
  }

  // Test hoja de Transacciones
  try {
    const cfgT = SPREADSHEET_CONFIG.transacciones;
    const ssT = SpreadsheetApp.openById(cfgT.spreadsheetId);
    const hojasT = ssT.getSheets().map(s => s.getName());
    Logger.log('Hojas en spreadsheet de Transacciones (' + cfgT.spreadsheetId + '): ' + hojasT.join(', '));
    const sheetT = ssT.getSheetByName(cfgT.sheetName);
    if (sheetT) {
      Logger.log('✓ Hoja "' + cfgT.sheetName + '" encontrada. Filas: ' + sheetT.getLastRow());
      Logger.log('  Headers: ' + sheetT.getRange(1, 1, 1, sheetT.getLastColumn()).getValues()[0].join(', '));
    } else {
      Logger.log('✗ Hoja "' + cfgT.sheetName + '" NO encontrada.');
    }
  } catch (e) {
    Logger.log('✗ Error al abrir spreadsheet de Transacciones: ' + e.toString());
  }
}
