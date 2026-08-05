// SCRIPT_URL se hereda de auth.js (cargado antes en el HTML).
const NEGOCIO = {
  nombre: "Inversiones y Servicios para el desarrollo de Santiago Puringla",
  direccion: "Santiago Puringla, La Paz, Bo. El Centro. Honduras.",
  telefono: "2774-5283",
  whatsapp: "9762-4974",
  email: "puringlense@gmail.com"
};

// Encabezados para mostrar en la tabla (Transacción al final)
const CAMPOS_TABLA = [
  { campo: 'Cuenta', label: 'Cuenta' },
  { campo: 'tipoCuenta', label: 'Tipo Cuenta' },
  { campo: 'FechaHora', label: 'Fecha' },
  { campo: 'Tipo', label: 'Tipo' },
  { campo: 'Monto', label: 'Monto' },
  { campo: 'Interes', label: 'Interés' },
  { campo: 'Saldo', label: 'Saldo' },
  { campo: 'Caja', label: 'Caja' },
  { campo: 'Sucursal', label: 'Sucursal' },
  { campo: 'Observaciones', label: 'Observaciones' },
  { campo: 'idTransacción', label: 'Transacción' }
];
const CAMPOS_CLIENTE = ['CodigoCliente', 'NombreCliente', 'Cuenta'];
const MONEDA_CAMPOS = ['Monto', 'Interes', 'Saldo'];
const REGISTROS_POR_PAGINA = 10;

// resultadosBase: todos los registros que matchean la búsqueda (sin filtro de cuenta)
// resultadosFiltrados: resultadosBase filtrado por la cuenta seleccionada en el filtro
let resultadosBase = [];
let resultadosFiltrados = [];
let paginaActual = 1;
let datosCliente = {};

function formatoMoneda(valor) {
  if (valor === undefined || valor === null || valor === '') return 'L 0.00';
  let num = parseFloat(valor.toString().replace(/[^\d.-]/g, ''));
  if (isNaN(num)) num = 0;
  return 'L ' + num.toLocaleString('es-HN', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function filtrarPorFechas(data, fechaInicial, fechaFinal) {
  if (!fechaInicial && !fechaFinal) return data;
  return data.filter(row => {
    let fechaRaw = row['FechaHora'] ? row['FechaHora'].trim() : '';
    let fecha = '';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(fechaRaw)) {
      let partes = fechaRaw.split(" ")[0].split("/");
      fecha = `${partes[2]}-${partes[1].padStart(2,"0")}-${partes[0].padStart(2,"0")}`;
    } else if (/^\d{4}\/\d{2}\/\d{2}/.test(fechaRaw)) {
      fecha = fechaRaw.split(" ")[0].replace(/\//g,"-");
    } else {
      fecha = fechaRaw.split(" ")[0];
    }
    if (fechaInicial && fecha < fechaInicial) return false;
    if (fechaFinal && fecha > fechaFinal) return false;
    return true;
  });
}

function poblarFiltroCuenta(data) {
  const cuentas = [...new Set(data.map(row => row['Cuenta'] ?? '').filter(Boolean))].sort();
  const sel = document.getElementById('filtro-cuenta');
  sel.innerHTML = '<option value="">— Todas las cuentas —</option>';
  cuentas.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  const section = document.getElementById('filtro-cuenta-section');
  section.style.display = cuentas.length > 1 ? 'flex' : 'none';
}

function aplicarFiltroCuenta() {
  const cuentaSel = document.getElementById('filtro-cuenta').value;
  if (!cuentaSel) {
    resultadosFiltrados = resultadosBase.slice();
  } else {
    resultadosFiltrados = resultadosBase.filter(row => (row['Cuenta'] ?? '') === cuentaSel);
  }
  paginaActual = 1;
  mostrarPagina(paginaActual);
}

document.addEventListener('DOMContentLoaded', function () {

// ---- SESIÓN: precarga del cliente autenticado ----
// Recupera idCliente y usuario del sessionStorage para evitar ingreso manual
const sesion = getSession();
if (!sesion) {
  // Sin sesión activa: redirigir al login
  window.location.href = 'login.html';
} else {
  // Mostrar nombre de usuario en la barra superior
  const authUserEl = document.getElementById('authUserName');
  if (authUserEl) authUserEl.textContent = sesion.usuario;

  // Precargar y bloquear el campo de código de cliente
  const inputCliente = document.getElementById('codigoCliente');
  if (inputCliente && sesion.idCliente) {
    inputCliente.value = sesion.idCliente;
    inputCliente.setAttribute('readonly', true);
    const badge = document.getElementById('clientePrecargadoBadge');
    if (badge) badge.style.display = 'inline-flex';
  }
}

// Botón de cerrar sesión
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', function () {
    clearSession();
    // Limpiar datos en memoria antes de redirigir
    resultadosBase = [];
    resultadosFiltrados = [];
    datosCliente = {};
    window.location.replace('login.html');
  });
}

document.getElementById('filtro-cuenta').addEventListener('change', aplicarFiltroCuenta);

document.getElementById('consultaForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const codigoCliente = document.getElementById('codigoCliente').value.trim();
    const cuentaBusqueda = document.getElementById('cuenta').value.trim();
    const fechaInicial = document.getElementById('fecha-inicial').value;
    const fechaFinal = document.getElementById('fecha-final').value;

    if (!codigoCliente && !cuentaBusqueda) {
      document.getElementById('resultados').innerHTML = `
        <div class="alert alert-warning text-center">
          Por favor ingresa al menos un Código de Cliente o Número de Cuenta para consultar.
        </div>`;
      return;
    }

    document.getElementById('resultados').innerHTML = `
      <div class="text-center">
        <div class="spinner-border"></div> Buscando...
      </div>`;
    document.getElementById('paginacion').innerHTML = '';
    document.getElementById('datos-cliente-section').style.display = "none";
    document.getElementById('datos-cliente').innerHTML = "";
    document.getElementById('filtro-cuenta-section').style.display = "none";

    fetch(`${SCRIPT_URL}?action=getTransacciones&codigoCliente=${encodeURIComponent(codigoCliente)}&cuenta=${encodeURIComponent(cuentaBusqueda)}`)
        .then(response => {
            if (!response.ok) throw new Error('No se pudo acceder a los datos');
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data)) throw new Error(data.error || 'Respuesta inesperada del servidor');

            let filtrados = data;

            filtrados = filtrarPorFechas(filtrados, fechaInicial, fechaFinal);
            filtrados.forEach((row, idx) => row._rowNum = idx + 2);
            filtrados.sort((a, b) => b._rowNum - a._rowNum);

            resultadosBase = filtrados;

            if (filtrados.length > 0) {
              datosCliente = {};
              CAMPOS_CLIENTE.forEach(campo => datosCliente[campo] = filtrados[0][campo] ?? "");
              let clienteHtml =
                `<div class="datos-row">
                  <span><strong>Código Cliente:</strong> ${datosCliente.CodigoCliente}</span>
                  <span><strong>Nombre:</strong> ${datosCliente.NombreCliente}</span>
                </div>`;
              document.getElementById('datos-cliente').innerHTML = clienteHtml;

              // Resumen de saldos por cuenta
              const consolidadoResumen = calcularConsolidado(filtrados);
              const totalSaldoResumen = consolidadoResumen.reduce((sum, c) => {
                const num = parseFloat((c.UltimoSaldo ?? '').toString().replace(/[^\d.-]/g, ''));
                return sum + (isNaN(num) ? 0 : num);
              }, 0);
              let saldosHtml = '<div class="resumen-saldos-table">';
              consolidadoResumen.forEach(c => {
                saldosHtml += `<div class="resumen-saldo-row">
                  <span class="resumen-cuenta">${c.Cuenta}</span>
                  <span class="resumen-monto">${formatoMoneda(c.UltimoSaldo)}</span>
                </div>`;
              });
              saldosHtml += `<div class="resumen-saldo-row resumen-total">
                <span class="resumen-cuenta">Total</span>
                <span class="resumen-monto">${formatoMoneda(totalSaldoResumen)}</span>
              </div>`;
              saldosHtml += '</div>';
              document.getElementById('resumen-saldos').innerHTML = saldosHtml;

              document.getElementById('datos-cliente-section').style.display = "grid";
              poblarFiltroCuenta(filtrados);
            } else {
              document.getElementById('datos-cliente-section').style.display = "none";
            }

            // Aplicar filtro de cuenta (inicialmente sin filtro)
            document.getElementById('filtro-cuenta').value = '';
            resultadosFiltrados = filtrados;
            paginaActual = 1;
            mostrarPagina(paginaActual);
        })
        .catch(error => {
            document.getElementById('resultados').innerHTML = `
              <div class="alert alert-warning text-center">
                Error al consultar los datos. Intente nuevamente más tarde.
              </div>`;
        });
});

// Auto-consulta: si hay sesión con idCliente precargado, disparar la búsqueda automáticamente
if (sesion && sesion.idCliente) {
  document.getElementById('consultaForm').dispatchEvent(new Event('submit'));
}

function mostrarPagina(numPagina) {
    const totalPaginas = Math.ceil(resultadosFiltrados.length / REGISTROS_POR_PAGINA);
    if (resultadosFiltrados.length === 0) {
        document.getElementById('resultados').innerHTML = `
          <div class="alert alert-danger text-center">
            No se encontraron transacciones para los criterios de búsqueda con estado "Activo" en el rango de fechas seleccionado.
          </div>`;
        document.getElementById('paginacion').innerHTML = '';
        return;
    }

    let html = `<div class="table-wrapper"><table class="table-financiera"><thead><tr>`;
    CAMPOS_TABLA.forEach(obj => {
        let cls = MONEDA_CAMPOS.includes(obj.campo) ? 'moneda-th' : ('col-' + obj.campo.toLowerCase());
        html += `<th class="${cls}">${obj.label}</th>`;
    });
    html += `</tr></thead><tbody>`;
    const inicio = (numPagina - 1) * REGISTROS_POR_PAGINA;
    resultadosFiltrados.slice(inicio, inicio + REGISTROS_POR_PAGINA).forEach(fila => {
        html += `<tr>`;
        CAMPOS_TABLA.forEach(obj => {
            let campo = obj.campo;
            if (MONEDA_CAMPOS.includes(campo)) {
                let valor = formatoMoneda(fila[campo]);
                html += `<td class="moneda-td"><span class="moneda-simbolo">L</span><span class="moneda-num">${valor.slice(2)}</span></td>`;
            } else {
                let tdClass = 'col-' + campo.toLowerCase();
                html += `<td class="${tdClass}">${fila[campo] ?? ''}</td>`;
            }
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    document.getElementById('resultados').innerHTML = html;

    let pagHtml = `<div class="pagination">`;
    const VENTANA = 5; // botones numerados visibles a la vez
    let inicio_p = Math.max(1, numPagina - Math.floor(VENTANA / 2));
    let fin_p = Math.min(totalPaginas, inicio_p + VENTANA - 1);
    if (fin_p - inicio_p + 1 < VENTANA) inicio_p = Math.max(1, fin_p - VENTANA + 1);

    pagHtml += `<button ${numPagina === 1 ? 'disabled' : ''} onclick="mostrarPagina(1)" title="Primera">«</button>`;
    pagHtml += `<button ${numPagina === 1 ? 'disabled' : ''} onclick="mostrarPagina(${numPagina - 1})" title="Anterior">‹</button>`;
    if (inicio_p > 1) pagHtml += `<span class="pag-ellipsis">…</span>`;
    for (let i = inicio_p; i <= fin_p; i++) {
        pagHtml += `<button class="${i === numPagina ? 'active' : ''}" onclick="mostrarPagina(${i})">${i}</button>`;
    }
    if (fin_p < totalPaginas) pagHtml += `<span class="pag-ellipsis">…</span>`;
    pagHtml += `<button ${numPagina === totalPaginas ? 'disabled' : ''} onclick="mostrarPagina(${numPagina + 1})" title="Siguiente">›</button>`;
    pagHtml += `<button ${numPagina === totalPaginas ? 'disabled' : ''} onclick="mostrarPagina(${totalPaginas})" title="Última">»</button>`;
    pagHtml += `</div>`;
    document.getElementById('paginacion').innerHTML = pagHtml;
    paginaActual = numPagina;
}

function encabezadoPDFCliente(doc, yStart) {
  doc.setFontSize(11);
  doc.text(`Código Cliente: ${datosCliente.CodigoCliente}`, 14, yStart);
  doc.text(`Nombre: ${datosCliente.NombreCliente}`, 80, yStart);
  doc.text(`Cuenta: ${datosCliente.Cuenta}`, 200, yStart);
}

// Exportar PDF (transacciones filtradas)
document.getElementById('btn-pdf').addEventListener('click', function () {
    if (resultadosFiltrados.length === 0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(14);
    doc.text(NEGOCIO.nombre, 14, 14);
    doc.setFontSize(10);
    doc.text(`Dirección: ${NEGOCIO.direccion}`, 14, 22);
    doc.text(`Tel: ${NEGOCIO.telefono} | Whatsapp: ${NEGOCIO.whatsapp} | Email: ${NEGOCIO.email}`, 14, 28);

    if (datosCliente && Object.keys(datosCliente).length > 0) {
      encabezadoPDFCliente(doc, 36);
    }

    doc.setFontSize(13);
    doc.text('Reporte de Transacciones', 14, 44);

    let rows = resultadosFiltrados.map(fila =>
        CAMPOS_TABLA.map(obj =>
            MONEDA_CAMPOS.includes(obj.campo) ? formatoMoneda(fila[obj.campo]) : (fila[obj.campo] ?? '')
        )
    );

    doc.autoTable({
        head: [CAMPOS_TABLA.map(obj => obj.label)],
        body: rows,
        startY: 50,
        styles: { fontSize: 9, halign: 'right' },
        headStyles: { halign: 'center', fontSize: 10 },
        columnStyles: MONEDA_CAMPOS.reduce((acc, campo) => {
            let idx = CAMPOS_TABLA.findIndex(obj => obj.campo === campo);
            acc[idx] = { halign: 'right' };
            return acc;
        }, {})
    });

    doc.save('transacciones.pdf');
});

// Exportar Excel (transacciones filtradas)
document.getElementById('btn-excel').addEventListener('click', function () {
    if (resultadosFiltrados.length === 0) return;
    const ws_data = [
        CAMPOS_TABLA.map(obj => obj.label),
        ...resultadosFiltrados.map(fila =>
          CAMPOS_TABLA.map(obj =>
            MONEDA_CAMPOS.includes(obj.campo) ? formatoMoneda(fila[obj.campo]) : (fila[obj.campo] ?? '')
          )
        )
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    MONEDA_CAMPOS.forEach(campo => {
        const colIdx = CAMPOS_TABLA.findIndex(obj => obj.campo === campo);
        for (let i = 1; i <= resultadosFiltrados.length; i++) {
            const cell = XLSX.utils.encode_cell({ c: colIdx, r: i });
            if (ws[cell]) ws[cell].s = { alignment: { horizontal: 'right' } };
        }
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');
    XLSX.writeFile(wb, 'transacciones.xlsx');
});

// ---- REPORTE CONSOLIDADO ----
// Agrupa los resultados filtrados por Cuenta y calcula el saldo de cada una
function calcularConsolidado(datos) {
  const cuentas = {};
  datos.forEach(row => {
    const cuenta = row['Cuenta'] ?? '';
    if (!cuentas[cuenta]) {
      cuentas[cuenta] = {
        CodigoCliente: row['CodigoCliente'] ?? '',
        NombreCliente: row['NombreCliente'] ?? '',
        Cuenta: cuenta,
        UltimoSaldo: null,
        UltimaFecha: null,
        Transacciones: 0
      };
    }
    cuentas[cuenta].Transacciones++;
    // El saldo consolidado se toma del primer registro (ya están ordenados desc por _rowNum)
    if (cuentas[cuenta].UltimoSaldo === null) {
      cuentas[cuenta].UltimoSaldo = row['Saldo'] ?? '';
      cuentas[cuenta].UltimaFecha = row['FechaHora'] ?? '';
    }
  });
  return Object.values(cuentas);
}

document.getElementById('btn-consolidado-pdf').addEventListener('click', function () {
    if (resultadosFiltrados.length === 0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait' });

    doc.setFontSize(14);
    doc.text(NEGOCIO.nombre, 14, 14);
    doc.setFontSize(10);
    doc.text(`Dirección: ${NEGOCIO.direccion}`, 14, 22);
    doc.text(`Tel: ${NEGOCIO.telefono} | Whatsapp: ${NEGOCIO.whatsapp} | Email: ${NEGOCIO.email}`, 14, 28);

    if (datosCliente && Object.keys(datosCliente).length > 0) {
      doc.setFontSize(11);
      doc.text(`Código Cliente: ${datosCliente.CodigoCliente}`, 14, 36);
      doc.text(`Nombre: ${datosCliente.NombreCliente}`, 14, 43);
    }

    doc.setFontSize(13);
    doc.text('Reporte Consolidado de Cuentas', 14, 52);

    const consolidado = calcularConsolidado(resultadosFiltrados);
    const rows = consolidado.map(c => [
      c.CodigoCliente,
      c.NombreCliente,
      c.Cuenta,
      c.Transacciones,
      c.UltimaFecha ?? '',
      formatoMoneda(c.UltimoSaldo)
    ]);

    // Fila de total general de saldos
    const totalSaldo = consolidado.reduce((sum, c) => {
      const num = parseFloat((c.UltimoSaldo ?? '').toString().replace(/[^\d.-]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
    rows.push(['', '', '', '', 'TOTAL SALDOS', formatoMoneda(totalSaldo)]);

    doc.autoTable({
        head: [['Cód. Cliente', 'Nombre', 'Cuenta', '# Trans.', 'Última Fecha', 'Saldo Actual']],
        body: rows,
        startY: 58,
        styles: { fontSize: 10 },
        headStyles: { halign: 'center', fontSize: 11 },
        columnStyles: { 5: { halign: 'right' } },
        didParseCell: function (data) {
          // Resaltar la fila de totales
          if (data.row.index === rows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 230, 245];
          }
        }
    });

    doc.save('consolidado_cliente.pdf');
});

document.getElementById('btn-consolidado-excel').addEventListener('click', function () {
    if (resultadosFiltrados.length === 0) return;
    const consolidado = calcularConsolidado(resultadosFiltrados);
    const totalSaldoXls = consolidado.reduce((sum, c) => {
      const num = parseFloat((c.UltimoSaldo ?? '').toString().replace(/[^\d.-]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
    const ws_data = [
        ['Cód. Cliente', 'Nombre', 'Cuenta', '# Trans.', 'Última Fecha', 'Saldo Actual'],
        ...consolidado.map(c => [
          c.CodigoCliente,
          c.NombreCliente,
          c.Cuenta,
          c.Transacciones,
          c.UltimaFecha ?? '',
          formatoMoneda(c.UltimoSaldo)
        ]),
        ['', '', '', '', 'TOTAL SALDOS', formatoMoneda(totalSaldoXls)]
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
    XLSX.writeFile(wb, 'consolidado_cliente.xlsx');
});

window.mostrarPagina = mostrarPagina;

}); // end DOMContentLoaded
