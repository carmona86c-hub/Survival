// ---------- Hacienda: se rellena sola con las ventas y gastos, y deja todo listo para imprimir ----------
// Los importes se calculan aquí, con aritmética exacta (no los decide la IA).
// Cada movimiento: { tipo:'ingreso'|'gasto', imp (base imponible), iva (%), ret (% retención IRPF), con, fecha (ISO), num, cliente, nif, auto }

const PLAZOS = { 1: '1 al 20 de abril', 2: '1 al 20 de julio', 3: '1 al 20 de octubre', 4: '1 al 30 de enero del año siguiente' };
const r2 = n => Math.round((+n || 0) * 100) / 100;

function fechaMov(m) { // admite ISO y las fechas antiguas «dd/mm/aaaa»
  const t = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(m.fecha || '');
  return t ? new Date(+t[3], +t[2] - 1, +t[1]) : new Date(m.fecha || Date.now());
}
const trimestreDe = d => Math.floor(d.getMonth() / 3) + 1;
const cuotaIva = m => r2(m.imp * (+m.iva || 0) / 100);
const cuotaRet = m => r2(m.imp * (+m.ret || 0) / 100);

function movimientos(anio, hastaT, soloT) {
  return S.fiscal.filter(m => { const d = fechaMov(m), t = trimestreDe(d); return d.getFullYear() === anio && (soloT ? t === soloT : t <= hastaT); })
    .sort((a, b) => fechaMov(a) - fechaMov(b));
}

// Cálculo de un trimestre: modelo 303 (IVA) y modelo 130 (pago fraccionado IRPF, estimación directa).
function calcularTrimestre(anio, t) {
  const del = movimientos(anio, t, t), acu = movimientos(anio, t);
  const suma = (l, tipo, f) => r2(l.filter(m => m.tipo === tipo).reduce((a, m) => a + f(m), 0));
  const iva = {
    base_ventas: suma(del, 'ingreso', m => m.imp), repercutido: suma(del, 'ingreso', cuotaIva),
    base_gastos: suma(del, 'gasto', m => m.imp), soportado: suma(del, 'gasto', cuotaIva)
  };
  iva.resultado = r2(iva.repercutido - iva.soportado);
  const ing = suma(acu, 'ingreso', m => m.imp), gas = suma(acu, 'gasto', m => m.imp), ret = suma(acu, 'ingreso', cuotaRet);
  let previos = 0;
  for (let k = 1; k < t; k++) previos = r2(previos + calcularTrimestre(anio, k).irpf.resultado);
  const veinte = r2(Math.max(0, ing - gas) * 0.2);
  const irpf = { ingresos: ing, gastos: gas, rendimiento: r2(ing - gas), veinte, retenciones: ret, previos, resultado: r2(Math.max(0, veinte - ret - previos)) };
  irpf.exento = ing > 0 && suma(acu, 'ingreso', m => m.ret ? m.imp : 0) / ing >= 0.7; // >70 % con retención: puede no estar obligado al 130
  return { anio, t, iva, irpf, del, acu };
}

// Venta automática: cuando das la conformidad a una factura, se apunta sola en el libro de ingresos.
function siguienteNumFactura(anio) {
  S.numFactura = S.numFactura || {};
  S.numFactura[anio] = (S.numFactura[anio] || 0) + 1;
  return `${anio}-${String(S.numFactura[anio]).padStart(3, '0')}`;
}
function registrarFactura(f) {
  if (!f.factura || f.registrada) return;
  const x = f.factura;
  S.fiscal.push({ tipo: 'ingreso', imp: r2(x.base_eur), iva: +x.iva_pct || 0, ret: +x.retencion_pct || 0, con: x.concepto || f.titulo, cliente: x.cliente || f.donde, nif: x.nif_cliente || '', num: x.num, fecha: new Date().toISOString(), auto: true });
  f.registrada = true;
  log('hacienda', `Venta registrada: factura ${x.num} · ${eur(r2(x.base_eur))} + IVA (${x.cliente || f.donde})`);
}

// Recordatorio de cada trimestre: en plazo, deja en Firmas la presentación lista.
function avisoTrimestral() {
  const hoy = new Date(), m = hoy.getMonth(), dia = hoy.getDate();
  if (![0, 3, 6, 9].includes(m) || dia > (m === 0 ? 30 : 20)) return;
  const t = m === 0 ? 4 : m / 3, anio = m === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear(), clave = `${anio}T${t}`;
  if (!S.fiscal.length || (S.avisosFiscales || []).includes(clave)) return;
  const c = calcularTrimestre(anio, t);
  S.avisosFiscales = [...(S.avisosFiscales || []), clave];
  S.firmas.push({ id: uid(), estado: 'pendiente', titulo: `Hacienda ${t}T ${anio}: modelos 303 y 130`, donde: 'sede.agenciatributaria.gob.es (o tu gestor)', que_firmar: `Presentar antes del ${PLAZOS[t]}. Imprime el dossier en la pestaña Hacienda.`,
    documento: `Modelo 303 (IVA): ${c.iva.resultado >= 0 ? 'a ingresar ' : 'a compensar '}${eur(Math.abs(c.iva.resultado))}\nModelo 130 (IRPF): a ingresar ${eur(c.irpf.resultado)}${c.irpf.exento ? ' (posiblemente no obligado: más del 70 % de tus ingresos llevan retención; confírmalo con tu gestor)' : ''}\n\nEl dossier completo, con libros de ingresos y gastos, está en Hacienda → Imprimir.` });
  log('hacienda', `Preparada la presentación del ${t}T ${anio}`);
}

function htmlTrimestre(c) {
  const fila = m => `<tr><td>${fechaMov(m).toLocaleDateString('es-ES')}</td><td>${esc(m.num || '')}</td><td>${esc(m.tipo === 'ingreso' ? (m.cliente || '') : (m.cliente || m.con || ''))}${m.nif ? '<br><small>' + esc(m.nif) + '</small>' : ''}</td><td>${esc(m.con || '')}</td><td class="n">${eur(m.imp)}</td><td class="n">${+m.iva || 0} %</td><td class="n">${eur(cuotaIva(m))}</td>${m.tipo === 'ingreso' ? `<td class="n">${m.ret ? '-' + eur(cuotaRet(m)) : '—'}</td>` : ''}<td class="n">${eur(m.imp + cuotaIva(m) - (m.tipo === 'ingreso' ? cuotaRet(m) : 0))}</td></tr>`;
  const ven = c.del.filter(m => m.tipo === 'ingreso'), gas = c.del.filter(m => m.tipo === 'gasto');
  return `<h2>${c.t}.º trimestre ${c.anio} · plazo: ${PLAZOS[c.t]}</h2>
  <div class="cajas"><div class="caja"><h3>Modelo 303 · IVA</h3><table>
    <tr><td>Base imponible de tus ventas</td><td class="n">${eur(c.iva.base_ventas)}</td></tr>
    <tr><td>IVA repercutido (cobrado a tus clientes)</td><td class="n">${eur(c.iva.repercutido)}</td></tr>
    <tr><td>Base de tus gastos</td><td class="n">${eur(c.iva.base_gastos)}</td></tr>
    <tr><td>IVA soportado deducible</td><td class="n">${eur(c.iva.soportado)}</td></tr>
    <tr class="tot"><td>${c.iva.resultado >= 0 ? 'A ingresar' : (c.t === 4 ? 'A devolver o compensar' : 'A compensar')}</td><td class="n">${eur(Math.abs(c.iva.resultado))}</td></tr></table></div>
  <div class="caja"><h3>Modelo 130 · IRPF (acumulado del año)</h3><table>
    <tr><td>Ingresos del 1 de enero al fin del trimestre</td><td class="n">${eur(c.irpf.ingresos)}</td></tr>
    <tr><td>Gastos deducibles en el mismo periodo</td><td class="n">${eur(c.irpf.gastos)}</td></tr>
    <tr><td>Rendimiento neto</td><td class="n">${eur(c.irpf.rendimiento)}</td></tr>
    <tr><td>20 % del rendimiento</td><td class="n">${eur(c.irpf.veinte)}</td></tr>
    <tr><td>Retenciones que te han hecho tus clientes</td><td class="n">${c.irpf.retenciones ? '-' : ''}${eur(c.irpf.retenciones)}</td></tr>
    <tr><td>Pagos de trimestres anteriores</td><td class="n">${c.irpf.previos ? '-' : ''}${eur(c.irpf.previos)}</td></tr>
    <tr class="tot"><td>A ingresar</td><td class="n">${eur(c.irpf.resultado)}</td></tr></table>
    ${c.irpf.exento ? '<p class="av">Más del 70 % de tus ingresos llevan retención: puede que no estés obligado a presentar el 130. Confírmalo con tu gestor.</p>' : ''}</div></div>
  <h3>Libro registro de facturas emitidas</h3>${ven.length ? `<table class="lib"><tr><th>Fecha</th><th>N.º</th><th>Cliente</th><th>Concepto</th><th>Base</th><th>IVA</th><th>Cuota</th><th>Ret.</th><th>Total</th></tr>${ven.map(fila).join('')}</table>` : '<p>Sin ventas este trimestre.</p>'}
  <h3>Libro registro de gastos y facturas recibidas</h3>${gas.length ? `<table class="lib"><tr><th>Fecha</th><th>N.º</th><th>Proveedor</th><th>Concepto</th><th>Base</th><th>IVA</th><th>Cuota</th><th>Total</th></tr>${gas.map(fila).join('')}</table>` : '<p>Sin gastos este trimestre.</p>'}`;
}

function imprimirHacienda(anio, t) {
  const tri = t === 'anual' ? [1, 2, 3, 4] : [+t];
  const tit = S.titular || {}, d = k => esc(tit[k] || '[COMPLETAR]');
  const faltan = ['nombre', 'nif', 'direccion'].filter(k => !tit[k]);
  const ia = S.informeFiscal;
  const w = open('', '_blank');
  if (!w) { msg('El navegador ha bloqueado la ventana de impresión: permite las ventanas emergentes.'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hacienda ${anio} ${t === 'anual' ? 'anual' : t + 'T'} · ${esc(tit.nombre || '')}</title><style>
  body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:24px;max-width:900px}h1{font-size:20px;margin:0}h2{font-size:15px;border-bottom:2px solid #111;padding-bottom:4px;margin-top:26px;page-break-after:avoid}h3{font-size:13px;margin:14px 0 6px}
  table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.n{text-align:right;white-space:nowrap}.tot td{font-weight:700;border-top:2px solid #111}
  .lib th{background:#eee;font-size:11px}.cajas{display:grid;grid-template-columns:1fr 1fr;gap:14px}.caja{border:1px solid #bbb;border-radius:6px;padding:8px}
  .av{background:#fff6d6;border:1px solid #e0c060;padding:6px 8px;border-radius:5px}.firma{margin-top:40px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:4px}
  .bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:10px}.bar button{font:inherit;padding:8px 14px;cursor:pointer}
  @media print{.bar{display:none}body{margin:0}.tri{page-break-before:always}.tri:first-of-type{page-break-before:auto}}</style></head><body>
  <div class="bar"><button onclick="print()">🖨 Imprimir</button></div>
  <h1>Documentación fiscal ${anio}${t === 'anual' ? ' · resumen anual' : ' · ' + t + '.º trimestre'}</h1>
  <p><b>${d('nombre')}</b> · NIF ${d('nif')}<br>${d('direccion')}<br>${esc(tit.actividad || '')} ${tit.email ? '· ' + esc(tit.email) : ''}<br>Preparado el ${new Date().toLocaleDateString('es-ES')}</p>
  ${faltan.length ? `<p class="av">Faltan tus datos (${faltan.map(k => CAMPOS_TIT[k]).join(', ')}): rellénalos en Ajustes para que salgan en el documento.</p>` : ''}
  ${tri.map(k => `<section class="tri">${htmlTrimestre(calcularTrimestre(anio, k))}</section>`).join('')}
  ${t === 'anual' ? (() => { const c = calcularTrimestre(anio, 4); return `<h2>Resumen del año</h2><table><tr><td>Ingresos totales (base)</td><td class="n">${eur(c.irpf.ingresos)}</td></tr><tr><td>Gastos deducibles</td><td class="n">${eur(c.irpf.gastos)}</td></tr><tr class="tot"><td>Rendimiento neto de la actividad (para la declaración de la renta, modelo 100)</td><td class="n">${eur(c.irpf.rendimiento)}</td></tr><tr><td>Pagos fraccionados ya hechos (130)</td><td class="n">${eur(r2(c.irpf.previos + c.irpf.resultado))}</td></tr><tr><td>Retenciones soportadas</td><td class="n">${eur(c.irpf.retenciones)}</td></tr></table><p>También corresponde el resumen anual de IVA (modelo 390), con los totales de los cuatro trimestres de arriba.</p>`; })() : ''}
  ${ia ? `<h2>Notas del asesor IA</h2><p>${esc(ia.resumen || '')}</p>${(ia.modelos || []).length ? `<table><tr><th>Modelo</th><th>Para qué</th><th>Plazo</th></tr>${ia.modelos.map(m => `<tr><td>${esc(m.modelo)}</td><td>${esc(m.para_que)}</td><td>${esc(m.plazo)}</td></tr>`).join('')}</table>` : ''}${(ia.documentos || []).length ? `<h3>Documentos que debes guardar</h3><ul>${ia.documentos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${(ia.avisos || []).length ? `<h3>Avisos</h3><ul>${ia.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : ''}
  <p class="av">Cifras calculadas automáticamente a partir de tus facturas y gastos registrados. Los modelos 303 y 130 se presentan por internet en sede.agenciatributaria.gob.es (con certificado digital o Cl@ve) o a través de tu gestor: este dossier te da las cifras y el respaldo. Revísalo con un gestor antes de presentarlo.</p>
  <div class="firma"><div>Firma del titular</div><div>Fecha</div></div>
  </body></html>`);
  w.document.close();
}

async function borradorFiscal() {
  $('hOut').classList.remove('hide'); $('hOut').textContent = 'Revisando tu situación fiscal…';
  try {
    const anio = new Date().getFullYear(), t = trimestreDe(new Date());
    const c = calcularTrimestre(anio, t);
    const r = await pensar(`Eres asesor fiscal en España. Situación del dueño: ${S.titular?.actividad || '[sin indicar]'}.
Cifras ya calculadas del ${t}T ${anio} (no las recalcules): ${JSON.stringify({ iva: c.iva, irpf: c.irpf })}
Movimientos del año: ${JSON.stringify(movimientos(anio, 4).map(m => ({ tipo: m.tipo, base: m.imp, iva: m.iva, ret: m.ret, con: m.con, fecha: m.fecha })))}
Busca la normativa vigente y di qué modelos de Hacienda le corresponden (303, 130, 390, 100, 349, 036/037…) según su situación, con su plazo, qué documentos debe guardar y avisos importantes (por ejemplo, si le falta el alta de actividad o si un gasto no es deducible). No inventes cifras.
Devuelve JSON: {"resumen","modelos":[{"modelo","para_que","plazo"}],"documentos":["..."],"avisos":["..."]}`, { buscar: true });
    S.informeFiscal = { ...r, fecha: new Date().toISOString() };
    $('hOut').textContent = (r.resumen || '') + '\n\n' + (r.modelos || []).map(m => `• ${m.modelo}: ${m.para_que} (${m.plazo})`).join('\n') + ((r.avisos || []).length ? '\n\nAvisos:\n' + r.avisos.map(a => '⚠ ' + a).join('\n') : '') + '\n\nSe incluirá en el dossier al imprimir.';
    log('hacienda', 'Revisión fiscal preparada');
  } catch (e) { $('hOut').textContent = 'Error: ' + e.message; }
  save(); pintar();
}

function pintarHacienda() {
  const hoy = new Date(), anio = hoy.getFullYear(), t = trimestreDe(hoy), c = calcularTrimestre(anio, t);
  const sel = $('hTri'); if (sel && !sel.options.length) sel.innerHTML = [1, 2, 3, 4].map(k => `<option value="${k}"${k === t ? ' selected' : ''}>${k}.º trimestre</option>`).join('') + '<option value="anual">Año completo</option>';
  const an = $('hAnio'); if (an && !an.value) an.value = anio;
  $('lHc').innerHTML = `<div class="grid" style="margin-bottom:8px">
    <div class="stat"><span class="mut">Ventas ${t}T (base)</span><b>${eur(c.iva.base_ventas)}</b></div>
    <div class="stat"><span class="mut">IVA · 303 (${c.iva.resultado >= 0 ? 'a pagar' : 'a tu favor'})</span><b>${eur(Math.abs(c.iva.resultado))}</b></div>
    <div class="stat"><span class="mut">IRPF a pagar · 130</span><b>${eur(c.irpf.resultado)}</b></div>
    <div class="stat"><span class="mut">Beneficio en ${anio}</span><b>${eur(c.irpf.rendimiento)}</b></div></div>
    <div class="mut">Plazo del ${t}T: ${PLAZOS[t]}. Las facturas que apruebes en Firmas se apuntan solas como ventas.</div>` +
    S.fiscal.slice().reverse().map(m => `<div class="item">${fechaMov(m).toLocaleDateString('es-ES')} · ${m.tipo === 'ingreso' ? '<span class="ok">+' : '<span class="b">-'}${eur(m.imp)}</span>${m.iva ? ` + IVA ${m.iva} %` : ''}${m.ret ? ` · ret. ${m.ret} %` : ''} · ${esc(m.con)}${m.num ? ` <span class="tag">${esc(m.num)}</span>` : ''}${m.auto ? '<span class="tag ok">automático</span>' : ''} <button class="sec" data-hdel="${S.fiscal.indexOf(m)}" style="padding:2px 8px;font-size:11px">quitar</button></div>`).join('');
}
