// ---------- Ciclo: lo justo y necesario, varias cosas a la vez ----------
async function ciclo() {
  if (ocupado) return;
  if (!S.viva) { msg('Está apagada: se quedó sin capital. Reinicia en Ajustes.'); return; }
  ocupado = true; $('bCiclo').disabled = true;
  try {
    const par = Math.max(1, C.par || 3);
    const tareas = tareasComerciales().slice(0, par);
    const activos = S.proyectos.filter(p => p.estado === 'activo');
    activos.slice(0, Math.max(0, par - tareas.length)).forEach(p => tareas.push(() => ejecutarPaso(p)));
    if (activos.length < par && tareas.length < par) {
      const nuevas = S.oportunidades.filter(o => o.estado === 'nueva').sort((a, b) => b.puntuacion - a.puntuacion);
      nuevas.filter(o => o.puntuacion <= 0).forEach(o => { o.estado = 'descartada'; log('evaluar', 'Descartada por poco rentable: ' + o.titulo); });
      const hueco = par - tareas.length;
      const estudiadas = S.oportunidades.filter(o => o.estado === 'estudiada').sort((a, b) => b.puntuacion - a.puntuacion);
      const porEstudiar = nuevas.filter(o => o.puntuacion > 0);
      estudiadas.slice(0, Math.min(hueco, par - activos.length)).forEach(o => tareas.push(() => planificar(o)));
      porEstudiar.slice(0, Math.max(0, par - tareas.length)).forEach(o => tareas.push(() => estudiar(o)));
      if (!estudiadas.length && !porEstudiar.length) {
        // Exploración: general y radar de Play Store, alternando o a la vez si hay hueco.
        S.ronda = (S.ronda || 0) + 1;
        if (par - tareas.length >= 2) tareas.push(explorar, explorarApps);
        else tareas.push(S.ronda % 2 ? explorar : explorarApps);
      }
    }
    msg(`Trabajando en ${tareas.length} tarea(s) a la vez…`);
    const res = await Promise.allSettled(tareas.map(f => f()));
    res.filter(x => x.status === 'rejected').forEach(x => log('error', x.reason?.message || String(x.reason)));
    S.oportunidades.filter(o => o.estado === 'en_estudio' && !o.estudio).forEach(o => o.estado = 'nueva'); // si un estudio falló, se repite
    if (S.capitalIni - S.gasto <= 0) { S.viva = false; log('apagado', 'Sin capital: la IA se apaga'); pararAuto(); }
    const errs = res.filter(x => x.status === 'rejected');
    msg(errs.length ? 'Error: ' + (errs[0].reason?.message || '') : `Ciclo terminado (${tareas.length} tareas)`);
  } catch (e) { log('error', e.message); msg('Error: ' + e.message); }
  ocupado = false; $('bCiclo').disabled = false; save(); pintar();
}

function pararAuto() { clearInterval(timer); timer = null; $('bAuto').textContent = 'Modo continuo: OFF'; try { wake?.release(); } catch (e) {} wake = null; }
async function toggleAuto() {
  if (timer) return pararAuto();
  timer = setInterval(ciclo, Math.max(1, C.min) * 60000);
  $('bAuto').textContent = 'Modo continuo: ON';
  try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  ciclo();
}

// ---------- Hacienda ----------
async function borradorFiscal() {
  $('hOut').classList.remove('hide'); $('hOut').textContent = 'Preparando…';
  try {
    const r = await pensar(`Con estos movimientos del año ${new Date().getFullYear()} (España), prepara un borrador de la documentación fiscal que necesitaría el dueño: qué modelos de Hacienda aplican según el tipo de actividad, cómo se calcularían, qué casillas o apartados y qué documentos debe guardar. Indica qué tiene que firmar y qué debe confirmar con un gestor.
Movimientos: ${JSON.stringify(S.fiscal)}
Devuelve JSON: {"resumen","modelos":[{"modelo","para_que","importe_estimado","plazo"}],"documentos":["..."],"a_firmar":["..."],"avisos":["..."]}`, { buscar: true });
    $('hOut').textContent = JSON.stringify(r, null, 2);
    log('hacienda', 'Borrador fiscal preparado');
  } catch (e) { $('hOut').textContent = 'Error: ' + e.message; }
  save(); pintar();
}

// ---------- Interfaz ----------
function pintarID() {
  const VC = { adelante: 'ok', ajustar: 'w', descartar: 'b' };
  const es = S.oportunidades.filter(o => o.estudio || o.estado === 'en_estudio').reverse();
  $('lId').innerHTML = es.length ? es.map(o => {
    const d = o.estudio;
    if (!d) return `<div class="item"><b>${esc(o.titulo)}</b> <span class="tag w">estudiando…</span></div>`;
    return `<div class="item"><b>${esc(o.titulo)}</b> <span class="tag ${d.decision === 'adelante' ? 'ok' : 'b'}">${esc(d.decision)}</span>${o.origen === 'radar-apps' ? '<span class="tag">📱 radar Play Store</span>' : ''}
    <div class="mut">${esc(d.enfoque_recomendado || '')}</div><div class="mut">Motivo: ${esc(d.motivo || '')}</div>
    <div class="row" style="margin:6px 0">${(d.informes || []).map(i => `<span class="tag ${VC[i.veredicto] || ''}">${esc(i.rol)}: ${esc(i.veredicto || 'error')}</span>`).join('')}</div>
    <details><summary>Informes del grupo de estudio</summary>${(d.informes || []).map(i => `<div class="item"><b>${esc(i.rol)}</b> — ${esc(i.motivo || i.error || '')}
      <div class="mut">${(i.conclusiones || []).map(esc).join('<br>')}</div>
      ${(i.datos || []).length ? `<div class="mut">Datos: ${i.datos.map(x => `${esc(x.dato)}${/^https?:/.test(x.fuente || '') ? ` <a href="${esc(x.fuente)}" target="_blank" style="color:inherit">[fuente]</a>` : ' (sin fuente)'}`).join(' · ')}</div>` : ''}
      ${(i.riesgos || []).length ? `<div class="mut b">Riesgos: ${i.riesgos.map(esc).join(' · ')}</div>` : ''}</div>`).join('')}</details>
    ${d.plan ? `<details><summary>Plan de estudio y desarrollo</summary><div class="mut"><b>Especificación:</b> ${esc(d.plan.especificacion)}</div>
      <div class="mut"><b>Objetivos:</b> ${(d.plan.objetivos || []).map(esc).join(' · ')}</div>
      <div class="mut"><b>Hitos:</b><br>${(d.plan.hitos || []).map((h, i) => `${i + 1}. ${esc(h.hito)} — <i>${esc(h.criterio_de_terminado)}</i>`).join('<br>')}</div>
      <div class="mut"><b>Métricas:</b> ${(d.plan.metricas || []).map(esc).join(' · ')}</div>
      <div class="mut"><b>Riesgos y cómo evitarlos:</b><br>${(d.plan.riesgos_clave || []).map(r => `${esc(r.riesgo)} → ${esc(r.mitigacion)}`).join('<br>')}</div></details>` : ''}</div>`;
  }).join('') : 'Aún no ha estudiado ninguna oportunidad.';
}

function tarjetaApp(p) {
  const a = p.app, est = a.estado || (a.repo ? 'aprobada' : 'por_revisar'), n = a.pruebas?.at(-1)?.notas;
  const ET = { por_revisar: ['w', 'pendiente de que la veas'], aprobada: ['ok', 'aprobada por ti'] };
  return `<div class="appcard"><div class="row"><span class="tag ok">📱 ${esc(a.nombre)} · v${a.version || 1}</span><span class="tag ${ET[est]?.[0] || ''}">${esc(ET[est]?.[1] || est)}</span>${a.diseno?.personalidad ? `<span class="tag">${esc(a.diseno.personalidad)}</span>` : ''}</div>
    ${a.diseno?.concepto ? `<div class="mut">${esc(a.diseno.concepto)}</div>` : ''}
    ${n ? `<div class="notas">${['visual', 'usabilidad', 'detalle', 'practica'].map(k => `<span class="nota ${+n[k] >= NOTA_MINIMA ? 'ok' : 'w'}"><b>${+n[k] || '–'}</b>${{ visual: 'visual', usabilidad: 'uso', detalle: 'detalle', practica: 'práctica' }[k]}</span>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:8px"><button data-ver="${p.id}">👁 Ver app</button>
      ${est === 'por_revisar' ? `<button class="sec" data-aprobar="${p.id}">✔ Aprobar${C.gh ? ' y subir' : ''}</button>` : ''}
      <button class="sec" data-zip="${p.id}">Descargar ZIP</button>
      ${a.repo ? `<a class="tag" href="${esc(a.repo)}" target="_blank">Ver repo</a>` : est === 'aprobada' && C.gh ? `<button class="sec" data-up="${p.id}">Subir a GitHub</button>` : ''}</div>
    <div class="row" style="margin-top:6px"><input data-mej="${p.id}" placeholder="Pídele cambios a la app: «más colorida», «añade gráficas»…" style="flex:1;min-width:160px"><button class="sec" data-mejorar="${p.id}">Rehacer app</button></div>
    ${(a.cambios || []).length ? `<div class="mut">Cambios pedidos: ${a.cambios.map(c => esc(c.instruccion)).join(' · ')}</div>` : ''}</div>`;
}

function pintar() {
  const ae = document.activeElement;
  const enEdicion = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && ae.closest?.('#lCo,#lFi,#lPr');
  if (enEdicion) { pintarID(); return; } // no tocar lo que el dueño está editando
  pintarID();
  const cap = S.capitalIni - S.gasto;
  $('sEstado').innerHTML = S.viva ? (timer ? '<span class="ok">Trabajando</span>' : 'En pausa') : '<span class="b">Apagada</span>';
  $('sCapital').textContent = eur(cap); $('sGasto').textContent = eur(S.gasto);
  $('sProy').textContent = S.proyectos.filter(p => p.estado === 'activo').length + ' / ' + S.proyectos.length;
  $('sFirma').textContent = S.firmas.filter(f => f.estado === 'pendiente').length;

  $('lOp').innerHTML = S.oportunidades.length ? S.oportunidades.slice().reverse().map(o => `<div class="item"><b>${esc(o.titulo)}</b> <span class="tag">${esc(o.tipo)}</span><span class="tag">${esc(o.estado)}</span><span class="tag">riesgo ${esc(o.riesgo)}</span>
    <div class="mut">${esc(o.descripcion)}</div>${o.clientes ? `<div class="mut">Clientes: ${esc(o.clientes)} · Canal: ${esc(o.canal)}</div>` : ''}${o.evidencia_demanda ? `<div class="mut">Demanda: ${esc(o.evidencia_demanda)}</div>` : ''}${(o.fuentes || []).length ? `<div class="mut">Fuentes: ${o.fuentes.filter(f => /^https?:/.test(f)).map((f, i) => `<a href="${esc(f)}" target="_blank" style="color:inherit">[${i + 1}]</a>`).join(' ')}</div>` : '<div class="mut w">Sin fuentes</div>'}<div class="mut">Inversión ${eur(o.inversion_eur || 0)} · Ingreso/mes ${eur(o.ingreso_mensual_eur || 0)} · Prob. ${Math.round((o.probabilidad || 0) * 100)}% · Puntuación ${o.puntuacion}</div></div>`).join('') : 'Aún no ha buscado nada.';

  $('lPr').innerHTML = S.proyectos.length ? S.proyectos.slice().reverse().map(p => `<div class="item"><b>${esc(p.titulo)}</b> <span class="tag">${esc(p.estado)}${p.valoracion ? ' · ' + esc(p.valoracion) : ''}</span>
    <div class="mut">Paso ${Math.min(p.paso + 1, p.plan.pasos.length)} de ${p.plan.pasos.length} · ${esc(p.plan.objetivo)}</div>
    ${p.app ? tarjetaApp(p) : ''}
    ${p.entregables.map(e => `<details><summary>${esc(e.paso)} — ${esc(e.resumen)}</summary>${e.contenido ? `<pre>${esc(e.contenido)}</pre>` : ''}</details>`).join('')}</div>`).join('') : 'Ninguno todavía.';

  $('lFi').innerHTML = S.firmas.length ? S.firmas.slice().reverse().map(f => `<div class="item"><b>${esc(f.titulo)}</b> <span class="tag ${f.estado === 'pendiente' ? 'w' : 'ok'}">${esc(f.estado)}</span>
    <div class="mut">Dónde: ${esc(f.donde)} · Qué firmar: ${esc(f.que_firmar)}</div>
    ${f.estado === 'pendiente'
      ? `<details><summary>Ver y editar documento</summary><textarea data-fed="${f.id}" rows="12">${esc(f.documento)}</textarea>
        <div class="row" style="margin-top:6px"><input data-fped="${f.id}" placeholder="O pídele cambios: «añade cláusula de pago a 30 días»…" style="flex:1;min-width:160px"><button class="sec" data-f="${f.id}" data-a="cambios">Rehacer</button><button class="sec" data-f="${f.id}" data-a="copiar">Copiar</button></div></details>
        <div class="row" style="margin-top:6px"><button data-f="${f.id}" data-a="firmado">Conforme / firmado</button><button class="sec" data-f="${f.id}" data-a="rechazado">Rechazar</button></div>`
      : `<details><summary>Ver documento</summary><pre>${esc(f.documento)}</pre></details>`}</div>`).join('') : '<div class="mut">Nada pendiente.</div>';

  const EST = { borrador: 'w', enviado: '', en_conversacion: 'ok', respondido: 'ok', sin_respuesta: 'b', descartado: 'b', baja: 'b' };
  $('sEnv').textContent = S.contactos.filter(c => c.estado === 'borrador').length;
  $('lCo').innerHTML = S.contactos.length ? S.contactos.slice().reverse().map(c => {
    const m = c.mensajes[c.mensajes.length - 1];
    return `<div class="item"><b>${esc(c.empresa)}</b> <span class="tag ${EST[c.estado] || ''}">${esc(c.estado.replace('_', ' '))}</span><span class="tag">${esc(c.proyecto)}</span>
    <div class="mut">${esc(c.sector)} · ${esc(c.ciudad)} · ${c.web ? `<a href="${esc(c.web)}" target="_blank" style="color:inherit">${esc(c.web)}</a>` : ''} · ${esc(c.email || 'formulario web')}</div>
    <div class="mut">Por qué encaja: ${esc(c.por_que_encaja)}${c.fuente_contacto ? ` · <a href="${esc(c.fuente_contacto)}" target="_blank" style="color:inherit">fuente del contacto</a>` : ''}</div>
    <div class="mut">${m.verificado ? '<span class="ok">✔ Verificado: no promete ni inventa nada</span>' : '<span class="w">⚠ Sin verificar: revísalo bien</span>'}${(m.problemas || []).length ? ' · Corregido: ' + esc(m.problemas.join('; ')) : ''}</div>
    ${c.estado === 'borrador'
      ? `<details open><summary>${esc(m.tipo)} · puedes editarlo antes de aprobar</summary><input data-ed-asunto="${c.id}" value="${esc(m.asunto)}"><textarea data-ed-cuerpo="${c.id}" rows="9" style="margin-top:6px">${esc(m.cuerpo)}</textarea>
        <div class="row" style="margin-top:6px"><input data-ped="${c.id}" placeholder="O pídele cambios: «más corto», «menciona su tienda online»…" style="flex:1;min-width:160px"><button class="sec" data-c="${c.id}" data-a="cambios">Rehacer</button></div></details>`
      : `<details><summary>${esc(m.tipo)}: ${esc(m.asunto)}</summary><pre>${esc(m.cuerpo)}</pre></details>`}
    ${c.mensajes.length > 1 ? `<details><summary>Historial (${c.mensajes.length} mensajes)</summary>${c.mensajes.map(x => `<div class="mut"><b>${esc(x.tipo)}</b> ${x.fecha ? new Date(x.fecha).toLocaleDateString('es-ES') : '(sin enviar)'} · ${esc(x.asunto)}</div>`).join('')}</details>` : ''}
    ${c.respuestas.map(r => `<div class="mut">↩ Respuesta: ${esc(r.texto.slice(0, 200))}${r.analisis ? '<br>Análisis: ' + esc(r.analisis) : ''}</div>`).join('')}
    <div class="row" style="margin-top:6px">
      ${c.estado === 'borrador' ? `<button data-c="${c.id}" data-a="enviar">Aprobar y enviar</button>` : ''}
      ${['enviado', 'en_conversacion', 'sin_respuesta'].includes(c.estado) ? `<button class="sec" data-c="${c.id}" data-a="resp">Ha respondido</button>` : ''}
      ${!['baja', 'descartado'].includes(c.estado) ? `<button class="sec" data-c="${c.id}" data-a="desc">Descartar</button>` : ''}
    </div>
    <div class="hide" id="r-${c.id}"><textarea rows="4" placeholder="Pega aquí su respuesta"></textarea><button data-c="${c.id}" data-a="guardar" style="margin-top:6px">Guardar y que prepare el siguiente paso</button></div></div>`;
  }).join('') : 'Aún no ha contactado con nadie. Lo hará cuando un proyecto llegue a la fase de captación.';

  const ing = S.fiscal.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.imp, 0), gas = S.fiscal.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.imp, 0);
  $('lHc').innerHTML = `<div class="mut">Ingresos ${eur(ing)} · Gastos ${eur(gas)} · Beneficio ${eur(ing - gas)}</div>` + S.fiscal.slice().reverse().map(m => `<div class="item">${m.fecha} · ${m.tipo === 'ingreso' ? '<span class="ok">+' : '<span class="b">-'}${eur(m.imp)}</span> · ${esc(m.con)}</div>`).join('');

  $('lDi').innerHTML = (S.lecciones.length ? '<b>Lecciones</b>' + S.lecciones.map(l => `<div class="item">💡 ${esc(l)}</div>`).join('') + '<br>' : '') +
    (S.diario.map(d => `<div class="item"><span class="tag">${esc(d.tipo)}</span>${new Date(d.t).toLocaleString('es-ES')} — ${esc(d.txt)}</div>`).join('') || 'Vacío.');
}

document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['op', 'id', 'pr', 'co', 'fi', 'hc', 'di', 'cf'].forEach(t => $('t-' + t).classList.toggle('hide', t !== b.dataset.t));
});
$('lFi').onclick = e => {
  const f = S.firmas.find(x => x.id === e.target.dataset.f); if (!f) return;
  const a = e.target.dataset.a, ed = document.querySelector(`[data-fed="${f.id}"]`);
  if (ed && ed.value !== f.documento) { f.documento = ed.value; f.editado = true; }
  if (a === 'copiar') { navigator.clipboard?.writeText(f.documento).then(() => msg('Copiado')).catch(() => {}); save(); return; }
  if (a === 'cambios') {
    const ins = document.querySelector(`[data-fped="${f.id}"]`).value.trim(); if (!ins) return;
    e.target.disabled = true; msg('Rehaciendo: ' + f.titulo + '…');
    const pr = S.proyectos.find(p => p.id === f.prId);
    reescribir({ asunto: f.titulo, cuerpo: f.documento }, ins, pr ? contextoPr(pr) : f.donde).then(v => { f.documento = v.cuerpo; log('firma', `Rehecho «${f.titulo}»: ${ins}`); msg('Documento rehecho'); save(); pintar(); }).catch(err => { msg('Error: ' + err.message); e.target.disabled = false; });
    return;
  }
  f.estado = a; log('firma', f.titulo + ': ' + f.estado); save(); pintar();
};
async function accionApp(d, boton, entrada) {
  const id = d.zip || d.up || d.ver || d.aprobar || d.mejorar; const p = S.proyectos.find(x => x.id === id); if (!p) return;
  try {
    if (d.ver) return verApp(p);
    if (d.zip) return await zipApp(p);
    boton.disabled = true;
    if (d.up) await subirApp(p);
    else if (d.aprobar) { await aprobarApp(p); cerrarVisor(); msg(`«${p.app.nombre}» aprobada${p.app.repo ? ' y subida' : ''}. Tienes la publicación en Firmas.`); }
    else if (d.mejorar) {
      const ins = (entrada || document.querySelector(`[data-mej="${p.id}"]`))?.value.trim(); if (!ins) { boton.disabled = false; return; }
      await mejorarApp(p, ins); save(); pintar(); msg(`Cambios aplicados: «${p.app.nombre}» v${p.app.version}`);
      if (!$('visor').classList.contains('hide')) verApp(p);
    }
  } catch (err) { msg('Error: ' + err.message); }
  boton.disabled = false; save(); pintar();
}
$('lPr').onclick = e => { const d = e.target.dataset; if (d.zip || d.up || d.ver || d.aprobar || d.mejorar) accionApp(d, e.target); };
$('visorCerrar').onclick = cerrarVisor;
$('visorCompleta').onclick = () => $('visor').classList.toggle('completa');
$('visorAprobar').onclick = e => accionApp({ aprobar: $('visor').dataset.pr }, e.target);
$('visorRehacer').onclick = e => accionApp({ mejorar: $('visor').dataset.pr }, e.target, $('visorPedir'));
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('visor').classList.contains('hide')) cerrarVisor(); });
$('cSync').onclick = conectarSync;
// Guarda las ediciones del dueño en cuanto escribe (no se pierden si la pantalla se refresca).
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (d.edAsunto || d.edCuerpo) { const c = S.contactos.find(x => x.id === (d.edAsunto || d.edCuerpo)); const m = c?.mensajes.at(-1); if (m) { if (d.edAsunto) m.asunto = t.value; else m.cuerpo = t.value; m.editado = true; save(); } }
  if (d.fed) { const f = S.firmas.find(x => x.id === d.fed); if (f) { f.documento = t.value; f.editado = true; save(); } }
});
$('lCo').onclick = e => {
  const c = S.contactos.find(x => x.id === e.target.dataset.c); if (!c) return;
  const a = e.target.dataset.a;
  const m = c.mensajes[c.mensajes.length - 1];
  const asu = document.querySelector(`[data-ed-asunto="${c.id}"]`), cue = document.querySelector(`[data-ed-cuerpo="${c.id}"]`);
  if (asu && cue && (asu.value !== m.asunto || cue.value !== m.cuerpo)) { m.asunto = asu.value; m.cuerpo = cue.value; m.editado = true; }
  if (a === 'cambios') {
    const ins = document.querySelector(`[data-ped="${c.id}"]`).value.trim(); if (!ins) return;
    e.target.disabled = true; msg('Rehaciendo el mensaje para ' + c.empresa + '…');
    const pr = S.proyectos.find(p => p.id === c.prId);
    reescribir(m, ins, pr ? contextoPr(pr) : c.proyecto).then(v => { Object.assign(m, v, { editado: false }); log('comercial', `Mensaje a ${c.empresa} rehecho: ${ins}`); msg('Mensaje rehecho'); save(); pintar(); }).catch(err => { msg('Error: ' + err.message); e.target.disabled = false; });
    return;
  }
  if (a === 'enviar') enviarContacto(c);
  else if (a === 'resp') { $('r-' + c.id).classList.toggle('hide'); return; }
  else if (a === 'guardar') { const t = $('r-' + c.id).querySelector('textarea').value.trim(); if (!t) return; c.respuestas.push({ texto: t, fecha: new Date().toISOString(), procesada: false }); c.estado = 'respondido'; log('comercial', `Respuesta de ${c.empresa} registrada`); msg('Respuesta guardada: la procesará en el próximo ciclo'); }
  else if (a === 'desc') { c.estado = 'descartado'; log('comercial', `${c.empresa} descartada`); }
  save(); pintar();
};
$('bCiclo').onclick = ciclo; $('bAuto').onclick = toggleAuto;
$('hAdd').onclick = () => { const imp = parseFloat($('hImp').value); if (!imp) return; S.fiscal.push({ tipo: $('hTipo').value, imp, con: $('hCon').value, fecha: new Date().toLocaleDateString('es-ES') }); $('hImp').value = $('hCon').value = ''; save(); pintar(); };
$('hDoc').onclick = borradorFiscal;
['key', 'model', 'cap', 'pin', 'pout', 'min', 'gh', 'gist', 'par'].forEach(k => $('c' + k[0].toUpperCase() + k.slice(1)).value = C[k]);
$('tit').innerHTML = Object.entries(CAMPOS_TIT).map(([k, l]) => `<label>${l}</label><input data-tit="${k}">`).join('');
function pintarTit() { document.querySelectorAll('[data-tit]').forEach(i => i.value = S.titular?.[i.dataset.tit] || ''); }
pintarTit();
$('cSave').onclick = () => {
  document.querySelectorAll('[data-tit]').forEach(i => S.titular[i.dataset.tit] = i.value.trim());
  C.par = Math.min(6, Math.max(1, +$('cPar').value || 3));
  C.gh = $('cGh').value.trim(); C.gist = $('cGist').value.trim();
  C.key = $('cKey').value.trim(); C.model = $('cModel').value.trim(); C.cap = +$('cCap').value; C.pin = +$('cPin').value; C.pout = +$('cPout').value; C.min = +$('cMin').value;
  if (!S.diario.length) S.capitalIni = C.cap; save(); pintar(); msg('Ajustes guardados');
};
$('cReset').onclick = () => { if (confirm('¿Borrar todo y empezar de cero?')) { pararAuto(); S = def(); S.capitalIni = C.cap; save(); pintar(); } };
$('cExp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = 'survival-datos.json'; a.click(); };
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (!ocupado) bajarSync();
  if (timer) try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
});
pintar(); bajarSync();
