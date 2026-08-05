const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS0H2b-KE2VaKy7u7whTbXkGyImP_V8X5jeecCalPen3QTfiC8IczD8gx9kJgImsAmAUP50DAPPZKtx/pub?gid=0&single=true&output=csv";
const NEGOCIO = {
  nombre: "Inversiones y Servicios para el desarrollo de Santiago Puringla",
  direccion: "Santiago Puringla, La Paz, Bo. El Centro. Honduras.",
  telefono: "2774-5283",
  whatsapp: "9762-4974",
  email: "puringlense@gmail.com"
};

// Encabezados para mostrar en la tabla (Transacción al final)
const CAMPOS_TABLA = [
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
const CAMPOS_CLIENTE = ['Cliente', 'NombreCliente', 'Cuenta'];
const MONEDA_CAMPOS = ['Monto', 'Interes', 'Saldo'];
const REGISTROS_POR_PAGINA = 10;
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

document.getElementById('consultaForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const cliente = document.getElementById('cliente').value.trim();
    const fechaInicial = document.getElementById('fecha-inicial').value;
    const fechaFinal = document.getElementById('fecha-final').value;

    if (!cliente) return;

    document.getElementById('resultados').innerHTML = `
      <div class="text-center">
        <div class="spinner-border"></div> Buscando...
      </div>`;
    document.getElementById('paginacion').innerHTML = '';
    document.getElementById('datos-cliente-section').style.display = "none";
    document.getElementById('datos-cliente').innerHTML = "";

    fetch(SHEET_CSV_URL)
        .then(response => {
            if (!response.ok) throw new Error('No se pudo acceder a los datos');
            return response.text();
        })
        .then(csv => {
            const data = Papa.parse(csv, { header: true }).data;

            let filtrados = data.filter(row => row['Cliente'] === cliente && row['Estado'] === 'Activo');
            filtrados = filtrarPorFechas(filtrados, fechaInicial, fechaFinal);

            filtrados.forEach((row, idx) => row._rowNum = idx + 2);
            filtrados.sort((a, b) => b._rowNum - a._rowNum);

            resultadosFiltrados = filtrados;

            if (filtrados.length > 0) {
              datosCliente = {};
              CAMPOS_CLIENTE.forEach(campo => datosCliente[campo] = filtrados[0][campo] ?? "");
              let clienteHtml =
                `<div class="datos-row">
                  <span><strong>ID Cliente:</strong> ${datosCliente.Cliente}</span>
                  <span><strong>Nombre:</strong> ${datosCliente.NombreCliente}</span>
                  <span><strong>Cuenta:</strong> ${datosCliente.Cuenta}</span>
                </div>`;
              document.getElementById('datos-cliente').innerHTML = clienteHtml;
              document.getElementById('datos-cliente-section').style.display = "block";
            } else {
              document.getElementById('datos-cliente-section').style.display = "none";
            }

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

function mostrarPagina(numPagina) {
    const totalPaginas = Math.ceil(resultadosFiltrados.length / REGISTROS_POR_PAGINA);
    if (resultadosFiltrados.length === 0) {
        document.getElementById('resultados').innerHTML = `
          <div class="alert alert-danger text-center">
            No se encontraron transacciones para este cliente con estado "Activo" en el rango de fechas seleccionado.
          </div>`;
        document.getElementById('paginacion').innerHTML = '';
        return;
    }

    let html = `<div style="overflow-x:auto;"><table class="table-financiera"><thead><tr>`;
    CAMPOS_TABLA.forEach(obj => {
        let align = MONEDA_CAMPOS.includes(obj.campo) ? ' class="moneda-th"' : '';
        html += `<th${align}>${obj.label}</th>`;
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
                let tdClass = campo === "Observaciones" ? " class='observaciones-col'" : "";
                html += `<td${tdClass}>${fila[campo] ?? ''}</td>`;
            }
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    document.getElementById('resultados').innerHTML = html;

    let pagHtml = `<div class="pagination">`;
    for (let i = 1; i <= totalPaginas; i++) {
        pagHtml += `<button class="${i === numPagina ? 'active' : ''}" onclick="mostrarPagina(${i})">${i}</button>`;
    }
    pagHtml += `</div>`;
    document.getElementById('paginacion').innerHTML = pagHtml;
    paginaActual = numPagina;
}

// Exportar PDF
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
      doc.setFontSize(11);
      doc.text(`ID Cliente: ${datosCliente.Cliente}`, 14, 36);
      doc.text(`Nombre: ${datosCliente.NombreCliente}`, 80, 36);
      doc.text(`Cuenta: ${datosCliente.Cuenta}`, 160, 36);
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

// Exportar Excel
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

window.mostrarPagina = mostrarPagina;
