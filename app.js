// ===== Survival · núcleo del agente (modo pruebas) =====
const $ = id => document.getElementById(id);
const KEY = 'survival_state_v1', CFG = 'survival_cfg_v1';

const def = () => ({ capitalIni: 1000, gasto: 0, viva: true, oportunidades: [], proyectos: [], firmas: [], diario: [], lecciones: [], fiscal: [] });
let S = load(KEY) || def();
let C = load(CFG) || { key: '', model: 'claude-sonnet-5-5', cap: 1000, pin: 3, pout: 15, min: 10 };
let ocupado = false, timer = null, wake = null;

function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); localStorage.setItem(CFG, JSON.stringify(C)); } catch (e) {} }
const eur = n => (Math.round(n * 100) / 100).toLocaleString('es-ES') + ' €';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
function log(tipo, txt) { S.diario.unshift({ t: new Date().toISOString(), tipo, txt }); S.diario = S.diario.slice(0, 300); }
function msg(t) { $('sMsg').textContent = t; }

// ---------- Cerebro (Claude API) ----------
async function pensar(instruccion, { buscar = false, max = 4000 } = {}) {
  if (!C.key) throw new Error('Falta la clave API en Ajustes');
  const lecciones = S.lecciones.slice(0, 15).map(l => '- ' + l).join('\n') || '(ninguna todavía)';
  const body = {
    model: C.model, max_tokens: max,
    system: NORMAS + '\n\nLECCIONES APRENDIDAS:\n' + lecciones,
    messages: [{ role: 'user', content: instruccion }]
  };
  if (buscar) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': C.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || ('Error ' + r.status));
  const u = j.usage || {};
  const coste = ((u.input_tokens || 0) * C.pin + (u.output_tokens || 0) * C.pout) / 1e6 + (u.server_tool_use?.web_search_requests || 0) * 0.01;
  S.gasto += coste;
  const texto = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return extraerJSON(texto);
}
function extraerJSON(t) {
  const a = t.search(/[\[{]/); const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0 || b < a) throw new Error('Respuesta sin JSON');
  return JSON.parse(t.slice(a, b + 1));
}

// ---------- Fases del ciclo ----------
async function explorar() {
  msg('Buscando oportunidades…');
  const ya = S.oportunidades.map(o => o.titulo).join('; ') || 'ninguna';
  const r = await pensar(`Investiga en internet oportunidades ACTUALES y legales para ganar dinero, en cualquier ámbito (no solo bolsa). Ya conocidas (no repetir): ${ya}.
Devuelve un array JSON de 3 oportunidades: [{"titulo","tipo","descripcion","inversion_eur":número,"ingreso_mensual_eur":número,"plazo_dias":número,"riesgo":"bajo|medio|alto","probabilidad":0-1,"requiere_firma":["..."],"fuentes":["url"]}]`, { buscar: true });
  (Array.isArray(r) ? r : []).forEach(o => {
    o.id = uid(); o.estado = 'nueva';
    o.puntuacion = Math.round(((o.ingreso_mensual_eur || 0) * 6 * (o.probabilidad || 0.3) - (o.inversion_eur || 0)) / Math.max(1, o.plazo_dias || 30) * 10) / 10;
    S.oportunidades.push(o);
  });
  log('explorar', `Encontradas ${r.length || 0} oportunidades`);
}

async function planificar(o) {
  msg('Planificando: ' + o.titulo);
  const p = await pensar(`Elige esta oportunidad y diseña un plan para llevarla a cabo de principio a fin:\n${JSON.stringify(o)}
Devuelve JSON: {"objetivo","pasos":[{"accion","tipo":"investigar|crear|preparar_documento|publicar|vender|cobrar","autonomo":true|false,"detalle"}],"documentos_fiscales":["..."],"criterio_exito"}
Marca autonomo:false en todo lo que requiera la identidad, firma o dinero del dueño.`);
  o.estado = 'en_proyecto';
  S.proyectos.push({ id: uid(), opId: o.id, titulo: o.titulo, plan: p, paso: 0, entregables: [], estado: 'activo' });
  log('planificar', `Nuevo proyecto: ${o.titulo} (${p.pasos?.length || 0} pasos)`);
}

async function ejecutarPaso(pr) {
  const paso = pr.plan.pasos[pr.paso];
  msg(`Trabajando en «${pr.titulo}»: ${paso.accion}`);
  if (!paso.autonomo) {
    const d = await pensar(`Prepara TODO lo necesario para que el dueño solo tenga que firmar o aprobar este paso del proyecto «${pr.titulo}»:\n${JSON.stringify(paso)}
Devuelve JSON: {"titulo","que_firmar","documento":"texto completo del documento o instrucciones exactas","donde":"plataforma u organismo"}`);
    S.firmas.push({ id: uid(), prId: pr.id, ...d, estado: 'pendiente' });
    pr.entregables.push({ paso: paso.accion, tipo: 'firma', resumen: d.titulo });
    log('firma', `Preparado para firmar: ${d.titulo}`);
  } else {
    const e = await pensar(`Ejecuta este paso del proyecto «${pr.titulo}» y entrega el resultado completo (código, textos, análisis o lo que corresponda):\n${JSON.stringify(paso)}
Contexto de pasos previos: ${JSON.stringify(pr.entregables.slice(-3))}
Devuelve JSON: {"resumen","contenido":"el entregable completo","siguiente_recomendado"}`, { buscar: paso.tipo === 'investigar', max: 8000 });
    pr.entregables.push({ paso: paso.accion, tipo: 'entregable', resumen: e.resumen, contenido: e.contenido });
    log('ejecutar', `${pr.titulo}: ${e.resumen}`);
  }
  pr.paso++;
  if (pr.paso >= pr.plan.pasos.length) await aprender(pr);
}

async function aprender(pr) {
  msg('Aprendiendo de «' + pr.titulo + '»');
  const r = await pensar(`Revisa el proyecto terminado (en modo pruebas) y extrae lecciones para futuros proyectos:\n${JSON.stringify({ titulo: pr.titulo, plan: pr.plan, entregables: pr.entregables.map(e => e.resumen) })}
Devuelve JSON: {"valoracion":"viable|dudoso|descartar","lecciones":["..."]}`);
  pr.estado = 'terminado'; pr.valoracion = r.valoracion;
  (r.lecciones || []).forEach(l => S.lecciones.unshift(l));
  S.lecciones = S.lecciones.slice(0, 50);
  log('aprender', `${pr.titulo}: ${r.valoracion}`);
}

// ---------- Ciclo: lo justo y necesario ----------
async function ciclo() {
  if (ocupado) return;
  if (!S.viva) { msg('Está apagada: se quedó sin capital. Reinicia en Ajustes.'); return; }
  ocupado = true; $('bCiclo').disabled = true;
  try {
    const activo = S.proyectos.find(p => p.estado === 'activo');
    const nuevas = S.oportunidades.filter(o => o.estado === 'nueva').sort((a, b) => b.puntuacion - a.puntuacion);
    if (activo) await ejecutarPaso(activo);
    else if (nuevas.length) {
      const mejor = nuevas[0];
      if (mejor.puntuacion <= 0) { mejor.estado = 'descartada'; log('evaluar', 'Descartada por poco rentable: ' + mejor.titulo); }
      else await planificar(mejor);
    } else await explorar();
    if (S.capitalIni - S.gasto <= 0) { S.viva = false; log('apagado', 'Sin capital: la IA se apaga'); pararAuto(); }
    msg('Ciclo terminado');
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
function pintar() {
  const cap = S.capitalIni - S.gasto;
  $('sEstado').innerHTML = S.viva ? (timer ? '<span class="ok">Trabajando</span>' : 'En pausa') : '<span class="b">Apagada</span>';
  $('sCapital').textContent = eur(cap); $('sGasto').textContent = eur(S.gasto);
  $('sProy').textContent = S.proyectos.filter(p => p.estado === 'activo').length + ' / ' + S.proyectos.length;
  $('sFirma').textContent = S.firmas.filter(f => f.estado === 'pendiente').length;

  $('lOp').innerHTML = S.oportunidades.length ? S.oportunidades.slice().reverse().map(o => `<div class="item"><b>${esc(o.titulo)}</b> <span class="tag">${esc(o.tipo)}</span><span class="tag">${esc(o.estado)}</span><span class="tag">riesgo ${esc(o.riesgo)}</span>
    <div class="mut">${esc(o.descripcion)}</div><div class="mut">Inversión ${eur(o.inversion_eur || 0)} · Ingreso/mes ${eur(o.ingreso_mensual_eur || 0)} · Prob. ${Math.round((o.probabilidad || 0) * 100)}% · Puntuación ${o.puntuacion}</div></div>`).join('') : 'Aún no ha buscado nada.';

  $('lPr').innerHTML = S.proyectos.length ? S.proyectos.slice().reverse().map(p => `<div class="item"><b>${esc(p.titulo)}</b> <span class="tag">${esc(p.estado)}${p.valoracion ? ' · ' + esc(p.valoracion) : ''}</span>
    <div class="mut">Paso ${Math.min(p.paso + 1, p.plan.pasos.length)} de ${p.plan.pasos.length} · ${esc(p.plan.objetivo)}</div>
    ${p.entregables.map(e => `<details><summary>${esc(e.paso)} — ${esc(e.resumen)}</summary>${e.contenido ? `<pre>${esc(e.contenido)}</pre>` : ''}</details>`).join('')}</div>`).join('') : 'Ninguno todavía.';

  $('lFi').innerHTML = S.firmas.length ? S.firmas.slice().reverse().map(f => `<div class="item"><b>${esc(f.titulo)}</b> <span class="tag ${f.estado === 'pendiente' ? 'w' : 'ok'}">${esc(f.estado)}</span>
    <div class="mut">Dónde: ${esc(f.donde)} · Qué firmar: ${esc(f.que_firmar)}</div>
    <details><summary>Ver documento</summary><pre>${esc(f.documento)}</pre></details>
    ${f.estado === 'pendiente' ? `<div class="row"><button data-f="${f.id}" data-a="firmado">Marcar firmado</button><button class="sec" data-f="${f.id}" data-a="rechazado">Rechazar</button></div>` : ''}</div>`).join('') : '<div class="mut">Nada pendiente.</div>';

  const ing = S.fiscal.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.imp, 0), gas = S.fiscal.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.imp, 0);
  $('lHc').innerHTML = `<div class="mut">Ingresos ${eur(ing)} · Gastos ${eur(gas)} · Beneficio ${eur(ing - gas)}</div>` + S.fiscal.slice().reverse().map(m => `<div class="item">${m.fecha} · ${m.tipo === 'ingreso' ? '<span class="ok">+' : '<span class="b">-'}${eur(m.imp)}</span> · ${esc(m.con)}</div>`).join('');

  $('lDi').innerHTML = (S.lecciones.length ? '<b>Lecciones</b>' + S.lecciones.map(l => `<div class="item">💡 ${esc(l)}</div>`).join('') + '<br>' : '') +
    (S.diario.map(d => `<div class="item"><span class="tag">${esc(d.tipo)}</span>${new Date(d.t).toLocaleString('es-ES')} — ${esc(d.txt)}</div>`).join('') || 'Vacío.');
}

document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['op', 'pr', 'fi', 'hc', 'di', 'cf'].forEach(t => $('t-' + t).classList.toggle('hide', t !== b.dataset.t));
});
$('lFi').onclick = e => { const f = S.firmas.find(x => x.id === e.target.dataset.f); if (f) { f.estado = e.target.dataset.a; log('firma', f.titulo + ': ' + f.estado); save(); pintar(); } };
$('bCiclo').onclick = ciclo; $('bAuto').onclick = toggleAuto;
$('hAdd').onclick = () => { const imp = parseFloat($('hImp').value); if (!imp) return; S.fiscal.push({ tipo: $('hTipo').value, imp, con: $('hCon').value, fecha: new Date().toLocaleDateString('es-ES') }); $('hImp').value = $('hCon').value = ''; save(); pintar(); };
$('hDoc').onclick = borradorFiscal;
['key', 'model', 'cap', 'pin', 'pout', 'min'].forEach(k => $('c' + k[0].toUpperCase() + k.slice(1)).value = C[k]);
$('cSave').onclick = () => {
  C.key = $('cKey').value.trim(); C.model = $('cModel').value.trim(); C.cap = +$('cCap').value; C.pin = +$('cPin').value; C.pout = +$('cPout').value; C.min = +$('cMin').value;
  if (!S.diario.length) S.capitalIni = C.cap; save(); pintar(); msg('Ajustes guardados');
};
$('cReset').onclick = () => { if (confirm('¿Borrar todo y empezar de cero?')) { pararAuto(); S = def(); S.capitalIni = C.cap; save(); pintar(); } };
$('cExp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = 'survival-datos.json'; a.click(); };
document.addEventListener('visibilitychange', async () => { if (timer && document.visibilityState === 'visible') try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {} });
pintar();
