// ===== Survival · núcleo del agente (modo pruebas) =====
const $ = id => document.getElementById(id);
const KEY = 'survival_state_v1', CFG = 'survival_cfg_v1';

const def = () => ({ capitalIni: 1000, gasto: 0, viva: true, oportunidades: [], proyectos: [], firmas: [], diario: [], lecciones: [], fiscal: [], contactos: [], titular: {} });
let S = Object.assign(def(), load(KEY) || {});
let C = Object.assign({ key: '', model: 'claude-sonnet-5-5', cap: 1000, pin: 3, pout: 15, min: 10, gh: '', gist: '', par: 3 }, load(CFG) || {});
const DIAS = 864e5;
let ocupado = false, timer = null, wake = null, syncT = null;

function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function save(local = false) {
  if (!local) S.ts = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); localStorage.setItem(CFG, JSON.stringify(C)); } catch (e) {}
  if (!local) { clearTimeout(syncT); syncT = setTimeout(subirSync, 3000); }
}

// ---------- GitHub: sincronización móvil ↔ ordenador (Gist privado) ----------
async function gh(path, opt = {}) {
  if (!C.gh) throw new Error('Falta el token de GitHub en Ajustes');
  const r = await fetch('https://api.github.com' + path, { ...opt, headers: { Authorization: 'Bearer ' + C.gh, Accept: 'application/vnd.github+json', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GitHub: ' + (j.message || r.status));
  return j;
}
function syncTxt(t) { const e = $('sSync'); if (e) e.textContent = t; }
async function subirSync() {
  if (!C.gh || !C.gist) return;
  try { await gh('/gists/' + C.gist, { method: 'PATCH', body: JSON.stringify({ files: { 'survival.json': { content: JSON.stringify(S) } } }) }); syncTxt('Sincronizado ' + new Date().toLocaleTimeString('es-ES')); }
  catch (e) { syncTxt('Error al sincronizar: ' + e.message); }
}
async function bajarSync() {
  if (!C.gh || !C.gist) return;
  try {
    const g = await gh('/gists/' + C.gist);
    const f = g.files?.['survival.json'];
    let txt = f?.content;
    if (f?.truncated) txt = await (await fetch(f.raw_url)).text();
    const remoto = txt ? JSON.parse(txt) : null;
    if (remoto && (remoto.ts || 0) > (S.ts || 0)) { S = Object.assign(def(), remoto); save(true); pintar(); pintarTit(); syncTxt('Estado actualizado desde la nube'); }
    else if (!remoto || (S.ts || 0) > (remoto.ts || 0)) subirSync();
    else syncTxt('Al día');
  } catch (e) { syncTxt('Error al sincronizar: ' + e.message); }
}
async function conectarSync() {
  C.gh = $('cGh').value.trim(); C.gist = $('cGist').value.trim();
  try {
    if (!C.gist) {
      const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Survival · estado sincronizado', public: false, files: { 'survival.json': { content: JSON.stringify(S) } } }) });
      C.gist = g.id; $('cGist').value = g.id;
      syncTxt('Creada. Copia este ID de sincronización en tu otro dispositivo: ' + g.id);
    } else await bajarSync();
    save(true);
  } catch (e) { syncTxt('Error: ' + e.message); }
}

// ---------- Generador de apps (Android / Play Store) ----------
const esApp = (pr, paso) => paso.tipo === 'crear' && /app|aplicaci|play ?store|android|pwa/i.test(pr.titulo + ' ' + paso.accion + ' ' + (paso.detalle || '') + ' ' + (pr.plan.objetivo || ''));
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app';

function workflowAndroid(nombre, appId) {
  return `name: Compilar Android
on: [push, workflow_dispatch]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - run: npm init -y && npm i @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
      - run: npx cap init "${nombre.replace(/"/g, '')}" "${appId}" --web-dir www
      - run: npx cap add android && npx cap sync android
      - run: cd android && chmod +x gradlew && ./gradlew assembleDebug bundleRelease
      - uses: actions/upload-artifact@v4
        with:
          name: android
          path: |
            android/app/build/outputs/apk/debug/*.apk
            android/app/build/outputs/bundle/release/*.aab
`;
}

async function generarApp(pr, paso) {
  msg('Programando la app de «' + pr.titulo + '»…');
  const r = await pensar(`Programa una app completa y funcional para el proyecto «${pr.titulo}» (objetivo: ${pr.plan.objetivo}). Paso: ${JSON.stringify(paso)}
Debe ser una web app (HTML, CSS y JavaScript sin dependencias externas ni servidores) que funcione sin conexión, pensada para el móvil, y que luego se empaquetará para Android con Capacitor. Todo dentro de la carpeta "www/" (www/index.html obligatorio). Calidad de producto real que se pueda vender: útil, pulida, sin texto de relleno.
Incluye también: "ficha" para Play Store (titulo ≤30, descripcion_corta ≤80, descripcion_larga, categoria, precio_eur, palabras_clave) y "privacidad" (política de privacidad completa en español).
Devuelve JSON: {"nombre","app_id":"com.survival.algo","resumen","archivos":[{"ruta":"www/index.html","contenido":"..."}],"ficha":{...},"privacidad":"..."}`, { max: 16000 });
  const nombre = r.nombre || pr.titulo, appId = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(r.app_id) ? r.app_id : 'com.survival.' + slug(nombre).replace(/-/g, '');
  if (r.ficha?.descripcion_larga) {
    const [v] = await verificar([{ asunto: r.ficha.titulo, cuerpo: r.ficha.descripcion_larga }], `App «${r.nombre}». Lo que hace de verdad: ${r.resumen}. Archivos: ${(r.archivos || []).map(a => a.ruta).join(', ')}`);
    if (v) r.ficha.descripcion_larga = v.cuerpo;
  }
  const archivos = (r.archivos || []).filter(a => a.ruta && a.contenido);
  archivos.push(
    { ruta: '.github/workflows/android.yml', contenido: workflowAndroid(nombre, appId) },
    { ruta: 'PRIVACIDAD.md', contenido: r.privacidad || '' },
    { ruta: 'FICHA_PLAY_STORE.json', contenido: JSON.stringify(r.ficha || {}, null, 2) },
    { ruta: 'README.md', contenido: `# ${nombre}\n\n${r.resumen || ''}\n\nGenerada por Survival. Cada cambio compila el APK (pruebas) y el AAB (Play Store) en la pestaña Actions.\n` }
  );
  pr.app = { nombre, appId, archivos, ficha: r.ficha, repo: null };
  pr.entregables.push({ paso: paso.accion, tipo: 'app', resumen: `App «${nombre}» programada (${archivos.length} archivos)`, contenido: archivos.map(a => a.ruta).join('\n') });
  log('app', `App generada: ${nombre}`);
  if (C.gh) { try { await subirApp(pr); } catch (e) { log('error', 'Subir app: ' + e.message); } }
  S.firmas.push({
    id: uid(), prId: pr.id, estado: 'pendiente', titulo: `Publicar «${nombre}» en Play Store`, donde: 'Google Play Console',
    que_firmar: 'Cuenta de desarrollador a tu nombre, firma de la app y envío a revisión',
    documento: `Todo lo técnico está hecho. Lo que te toca a ti:\n1. Crear la cuenta de desarrollador en play.google.com/console (pago único de 25 $ y verificación de identidad).\n2. Descargar el archivo .aab desde la pestaña Actions del repo ${pr.app.repo || '(sube la app a GitHub primero)'}.\n3. Crear la app con el ID ${appId} y activar "Firma de apps de Google Play".\n4. Copiar la ficha (FICHA_PLAY_STORE.json) y pegar la política de privacidad (PRIVACIDAD.md, publícala en una URL, por ejemplo GitHub Pages).\n5. Las cuentas personales nuevas deben hacer una prueba cerrada con testers durante 14 días antes de publicar.\n6. Enviar a revisión.\n\nFicha preparada:\n${JSON.stringify(r.ficha || {}, null, 2)}`
  });
}

async function subirApp(pr) {
  const yo = await gh('/user');
  let nombre = 'app-' + slug(pr.app.nombre);
  try { await gh('/repos/' + yo.login + '/' + nombre); nombre += '-' + uid().slice(0, 4); } catch (e) {}
  const repo = await gh('/user/repos', { method: 'POST', body: JSON.stringify({ name: nombre, private: true, auto_init: true, description: 'App generada por Survival: ' + pr.app.nombre }) });
  for (const a of pr.app.archivos) {
    msg('Subiendo ' + a.ruta);
    await gh(`/repos/${repo.full_name}/contents/${a.ruta.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: JSON.stringify({ message: 'Survival: ' + a.ruta, content: btoa(unescape(encodeURIComponent(a.contenido))) }) });
  }
  pr.app.repo = repo.html_url;
  log('app', 'Subida a GitHub: ' + repo.html_url);
  save(); pintar();
}

async function zipApp(pr) {
  if (!window.JSZip) { await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
  const z = new JSZip(); pr.app.archivos.forEach(a => z.file(a.ruta, a.contenido));
  const a = document.createElement('a'); a.href = URL.createObjectURL(await z.generateAsync({ type: 'blob' })); a.download = slug(pr.app.nombre) + '.zip'; a.click();
}
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
    system: NORMAS + '\n\nDATOS DEL DUEÑO (úsalos en firmas de correo, presupuestos, contratos y facturas; si falta alguno, déjalo como [COMPLETAR]):\n' + titularTxt() + '\n\nLECCIONES APRENDIDAS:\n' + lecciones,
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
const CAMPOS_TIT = { nombre: 'Nombre o razón social', nif: 'NIF', direccion: 'Dirección fiscal', email: 'Email', telefono: 'Teléfono', web: 'Web', actividad: 'Situación (particular, autónomo, sociedad)' };
function titularTxt() { return Object.entries(CAMPOS_TIT).map(([k, l]) => `${l}: ${S.titular?.[k] || '[COMPLETAR]'}`).join('\n'); }
function extraerJSON(t) {
  const a = t.search(/[\[{]/); const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0 || b < a) throw new Error('Respuesta sin JSON');
  return JSON.parse(t.slice(a, b + 1));
}

// ---------- Fases del ciclo ----------
async function explorar() {
  msg('Buscando oportunidades…');
  const ya = S.oportunidades.map(o => o.titulo).join('; ') || 'ninguna';
  const r = await pensar(`Investiga en internet oportunidades ACTUALES y legales para generar ingresos, en cualquier ámbito y para cualquier tipo de cliente: empresas, autónomos, particulares, administraciones (licitaciones, subvenciones), plataformas y marketplaces, contenido, productos digitales, inversión… Ya conocidas (no repetir): ${ya}.
Solo oportunidades con demanda REAL comprobada (fuentes concretas) y que puedas entregar con tus CAPACIDADES REALES más lo que el dueño pueda hacer. No infles cifras: si no hay datos, estima a la baja y dilo.
Devuelve un array JSON de 3 oportunidades: [{"titulo","tipo","clientes":"a quién se vende","canal":"cómo se llega a ellos","descripcion","inversion_eur":número,"ingreso_mensual_eur":número,"plazo_dias":número,"riesgo":"bajo|medio|alto","probabilidad":0-1,"evidencia_demanda":"qué demuestra que hay demanda","puedes_entregarlo":true|false,"necesita_del_dueno":["..."],"requiere_firma":["..."],"fuentes":["url"]}]`, { buscar: true, max: 6000 });
  let n = 0;
  (Array.isArray(r) ? r : []).forEach(o => {
    if (o.puedes_entregarlo === false) { log('evaluar', 'Descartada (no se puede entregar de verdad): ' + o.titulo); return; }
    if (!o.titulo || S.oportunidades.some(x => x.titulo.toLowerCase() === o.titulo.toLowerCase())) return;
    o.id = uid(); o.estado = 'nueva';
    const fiable = (o.fuentes || []).filter(f => /^https?:\/\//.test(f)).length ? 1 : 0.5; // sin fuentes, pesa la mitad
    o.puntuacion = Math.round(((o.ingreso_mensual_eur || 0) * 6 * (o.probabilidad || 0.3) * fiable - (o.inversion_eur || 0)) / Math.max(1, o.plazo_dias || 30) * 10) / 10;
    S.oportunidades.push(o); n++;
  });
  log('explorar', `Encontradas ${n} oportunidades válidas`);
}

async function planificar(o) {
  msg('Planificando: ' + o.titulo);
  const p = await pensar(`Elige esta oportunidad y diseña un plan para llevarla a cabo de principio a fin:\n${JSON.stringify(o)}
Debe cubrir TODAS estas fases, en orden, con pasos concretos (o un paso que justifique por qué no aplica):
${FASES.map((f, i) => (i + 1) + '. ' + f).join('\n')}
Tipos de paso: "investigar", "crear" (programar, diseñar, redactar), "preparar_documento", "contactar" (buscar empresas o clientes concretos y escribirles), "publicar", "vender", "cobrar", "fiscal", "medir".
Devuelve JSON: {"objetivo","pasos":[{"fase":número,"accion","tipo","autonomo":true|false,"detalle"}],"documentos_fiscales":["..."],"criterio_exito"}
Marca autonomo:false en todo lo que requiera la identidad, firma o dinero del dueño. Los pasos "contactar" son autonomo:true (tú buscas y redactas; el dueño solo aprueba el envío).`, { max: 8000 });
  const p2 = await revisarPlan(o, p);
  o.estado = 'en_proyecto';
  S.proyectos.push({ id: uid(), opId: o.id, titulo: o.titulo, plan: p2, paso: 0, entregables: [], estado: 'activo' });
  log('planificar', `Nuevo proyecto: ${o.titulo} (${p2.pasos?.length || 0} pasos, revisado)`);
}

// Un segundo "par de ojos": comprueba que no falta ningún paso y lo corrige.
async function revisarPlan(o, p) {
  msg('Revisando que el plan no se deje nada: ' + o.titulo);
  try {
    const r = await pensar(`Eres el revisor. Comprueba con lupa este plan para «${o.titulo}». Busca pasos que falten, estén en mal orden, sean vagos o se salten requisitos legales, fiscales o comerciales, y fases sin cubrir de esta lista:
${FASES.map((f, i) => (i + 1) + '. ' + f).join('\n')}
Plan: ${JSON.stringify(p)}
Devuelve JSON con el plan COMPLETO corregido: {"objetivo","pasos":[{"fase","accion","tipo","autonomo","detalle"}],"documentos_fiscales":[...],"criterio_exito","cambios":["qué has añadido o corregido"]}`, { max: 8000 });
    if (Array.isArray(r.pasos) && r.pasos.length >= (p.pasos?.length || 0) * 0.8) { log('revisar', `${o.titulo}: ${(r.cambios || []).length} correcciones`); return r; }
  } catch (e) { log('error', 'Revisión: ' + e.message); }
  return p;
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
  } else if (esApp(pr, paso) && !pr.app) {
    await generarApp(pr, paso);
  } else if (paso.tipo === 'contactar' || /contact|captaci|clientes? potencial|prospec/i.test(paso.accion)) {
    await captar(pr, paso);
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

// ---------- Comercial: buscar empresas, ofrecer, seguir y responder ----------
const emailOk = e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e || '');
// Verificador: nada sale hacia fuera sin comprobar que no promete ni inventa nada.
async function verificar(piezas, contexto) {
  if (!piezas.length) return piezas;
  try {
    const r = await pensar(`Eres el verificador de veracidad. Revisa cada texto que va a salir hacia clientes o plataformas en nombre del dueño. Contexto real del proyecto: ${contexto}
Detecta y CORRIGE: promesas que no se puedan cumplir con las CAPACIDADES REALES o el dueño; clientes, casos, testimonios, experiencia, cifras, garantías o plazos inventados; datos sobre el destinatario no comprobados; tono engañoso o agresivo; falta de la línea de baja en mensajes a empresas. Si un texto no se puede salvar, márcalo como rechazado.
Textos: ${JSON.stringify(piezas.map((p, i) => ({ i, asunto: p.asunto, cuerpo: p.cuerpo })))}
Devuelve JSON: [{"i":número,"ok":true|false,"asunto","cuerpo","problemas":["..."]}]`, { max: 8000 });
    return piezas.map((p, i) => {
      const v = (Array.isArray(r) ? r : []).find(x => x.i === i);
      if (!v) return { ...p, verificado: false };
      return v.ok === false && !v.cuerpo ? null : { ...p, asunto: v.asunto || p.asunto, cuerpo: v.cuerpo || p.cuerpo, verificado: true, problemas: v.problemas || [] };
    }).filter(Boolean);
  } catch (e) { log('error', 'Verificación: ' + e.message); return piezas.map(p => ({ ...p, verificado: false })); }
}
const contextoPr = pr => JSON.stringify({ titulo: pr.titulo, objetivo: pr.plan.objetivo, hecho_hasta_ahora: pr.entregables.map(e => e.resumen), app: pr.app?.nombre || null });

async function captar(pr, paso) {
  msg(`Buscando clientes para «${pr.titulo}»…`);
  const ya = S.contactos.map(c => c.empresa).join('; ') || 'ninguno';
  const r = await pensar(`Proyecto «${pr.titulo}» (objetivo: ${pr.plan.objetivo}). Paso: ${JSON.stringify(paso)}
Lo que existe de verdad hasta ahora: ${contextoPr(pr)}
Busca en internet a quién le puede interesar de verdad, sin limitarte a empresas: empresas, autónomos, profesionales, asociaciones, administraciones (licitaciones o convocatorias abiertas), plataformas o marketplaces donde se compre esto, o peticiones públicas de particulares buscando exactamente este servicio. Ya contactados, no repetir: ${ya}.
Devuelve hasta 6 objetivos REALES y comprobados. Según el canal:
- "email" o "formulario" (solo empresas, autónomos, profesionales, asociaciones y organismos, con el contacto profesional que publican): mensaje personalizado, máx. 150 palabras, que muestre que conoces su caso, ofrezca SOLO lo que se puede entregar, proponga un paso sencillo y firme con los datos del dueño. Termina con: "Si prefiere no recibir más mensajes, respóndame y no volveré a escribirle."
- "plataforma" (marketplace, tienda o anuncio donde los clientes buscan, incluidos particulares): el texto completo del anuncio o ficha.
- "licitacion" (concurso público o subvención abierta): requisitos, plazo y la propuesta o los documentos a presentar.
- "respuesta_publica" (alguien ha publicado que busca este servicio): la respuesta a su petición.
Devuelve JSON: [{"empresa":"nombre del destinatario o plataforma","tipo_cliente","canal","web","sector","ciudad","email","formulario","url":"enlace a la plataforma, licitación o petición","fuente_contacto","por_que_encaja","asunto","cuerpo","plazo":"si aplica"}]`, { buscar: true, max: 10000 });
  const brutos = (Array.isArray(r) ? r : []).filter(c => c.empresa && c.cuerpo && !S.contactos.some(x => x.empresa.toLowerCase() === c.empresa.toLowerCase()));
  const buenos = await verificar(brutos, contextoPr(pr));
  let n = 0, f = 0;
  buenos.forEach(c => {
    const clave = c.empresa.toLowerCase();
    if (S.contactos.some(x => x.empresa.toLowerCase() === clave) || S.firmas.some(x => x.titulo.toLowerCase().endsWith(': ' + clave))) return; // otro proyecto en paralelo ya lo tiene
    if (['email', 'formulario'].includes(c.canal) || (!c.canal && (emailOk(c.email) || c.formulario))) {
      if (!emailOk(c.email) && !c.formulario) return;
      S.contactos.push({ id: uid(), prId: pr.id, proyecto: pr.titulo, ...c, email: emailOk(c.email) ? c.email : '', estado: 'borrador', mensajes: [{ tipo: 'inicial', asunto: c.asunto, cuerpo: c.cuerpo, verificado: c.verificado }], seguimientos: 0, enviado: 0, respuestas: [] });
      n++;
    } else {
      // Plataformas, licitaciones o respuestas públicas: se publican a nombre del dueño, así que van a Firmas.
      const que = { plataforma: 'Publicar anuncio o ficha', licitacion: 'Presentar a licitación o convocatoria', respuesta_publica: 'Responder a la petición publicada' }[c.canal] || 'Publicar';
      S.firmas.push({ id: uid(), prId: pr.id, estado: 'pendiente', titulo: `${que}: ${c.empresa}`, donde: c.url || c.web || c.empresa, que_firmar: que + (c.plazo ? ` (plazo: ${c.plazo})` : ''), documento: `${c.asunto ? c.asunto + '\n\n' : ''}${c.cuerpo}\n\nPor qué encaja: ${c.por_que_encaja || ''}\nFuente: ${c.fuente_contacto || c.url || ''}${c.verificado ? '' : '\n⚠ Sin verificar: revísalo con cuidado.'}` });
      f++;
    }
  });
  const desc = brutos.length - buenos.length;
  pr.entregables.push({ paso: paso.accion, tipo: 'contactos', resumen: `${n} contactos con mensaje listo y ${f} anuncios, licitaciones o respuestas preparados${desc ? `; ${desc} rechazados por el verificador` : ''}` });
  log('comercial', `${pr.titulo}: ${n} contactos y ${f} publicaciones preparadas, verificadas${desc ? ` (${desc} rechazadas)` : ''}`);
}

async function seguimiento(c) {
  const ult = c.mensajes[c.mensajes.length - 1];
  const r = await pensar(`Escribe un mensaje de seguimiento (${c.seguimientos + 1} de 2) para ${c.empresa}, que no ha respondido. Mensaje anterior: ${JSON.stringify(ult)}. Breve (máx. 80 palabras), cordial, aporta algo nuevo de valor, sin presionar, mismo hilo ("Re: ..."), con la línea de baja.
Devuelve JSON: {"asunto","cuerpo"}`);
  const pr = S.proyectos.find(p => p.id === c.prId);
  const [v] = await verificar([r], pr ? contextoPr(pr) : c.proyecto);
  c.seguimientos++;
  if (!v) { c.estado = 'sin_respuesta'; log('comercial', `Seguimiento a ${c.empresa} rechazado por el verificador; no se insiste`); return; }
  c.mensajes.push({ tipo: 'seguimiento', ...v }); c.estado = 'borrador';
  log('comercial', `Seguimiento preparado para ${c.empresa}`);
}

async function procesarRespuesta(c) {
  const resp = c.respuestas[c.respuestas.length - 1];
  const r = await pensar(`${c.empresa} ha respondido sobre el proyecto «${c.proyecto}».
Historial enviado: ${JSON.stringify(c.mensajes)}
Su respuesta: ${resp.texto}
Analiza su interés y prepara TODO lo necesario para el siguiente paso: la respuesta por correo y, si hay interés, los documentos (presupuesto detallado con IVA, contrato de prestación de servicios, o factura conforme a la normativa española) con los datos del dueño. Si piden no recibir más mensajes, marca baja.
Devuelve JSON: {"interes":"alto|medio|bajo|baja","analisis","siguiente_paso","respuesta":{"asunto","cuerpo"}|null,"documentos":[{"titulo","tipo":"presupuesto|contrato|factura|otro","contenido"}]}`, { max: 8000 });
  resp.procesada = true; resp.analisis = r.analisis;
  if (r.interes === 'baja') { c.estado = 'baja'; log('comercial', `${c.empresa} pidió no recibir más mensajes`); return; }
  const pr = S.proyectos.find(p => p.id === c.prId);
  const [v] = r.respuesta ? await verificar([r.respuesta], (pr ? contextoPr(pr) : c.proyecto) + ' · Lo que ha dicho el cliente: ' + resp.texto) : [];
  if (v) { c.mensajes.push({ tipo: 'respuesta', ...v }); c.estado = 'borrador'; }
  else c.estado = r.interes === 'bajo' ? 'descartado' : 'en_conversacion';
  (r.documentos || []).forEach(d => S.firmas.push({ id: uid(), prId: c.prId, estado: 'pendiente', titulo: `${d.titulo} · ${c.empresa}`, que_firmar: d.tipo, donde: c.empresa, documento: d.contenido }));
  if (/factura/i.test(JSON.stringify(r.documentos || []))) log('hacienda', `Factura preparada para ${c.empresa}: regístrala en Hacienda cuando cobres`);
  log('comercial', `${c.empresa}: interés ${r.interes}. ${r.siguiente_paso || ''}`);
}

function tareasComerciales() {
  const t = [];
  S.contactos.forEach(c => {
    if (c.respuestas.some(r => !r.procesada)) t.push(() => procesarRespuesta(c));
    else if (c.estado === 'enviado' && Date.now() - c.enviado > 5 * DIAS) {
      if (c.seguimientos < 2) t.push(() => seguimiento(c));
      else { c.estado = 'sin_respuesta'; log('comercial', `${c.empresa}: sin respuesta tras 2 seguimientos, no se insiste más`); }
    }
  });
  return t;
}

function enviarContacto(c) {
  const m = c.mensajes[c.mensajes.length - 1];
  if (c.email) location.href = `mailto:${c.email}?subject=${encodeURIComponent(m.asunto)}&body=${encodeURIComponent(m.cuerpo)}`;
  else { navigator.clipboard?.writeText(m.cuerpo).catch(() => {}); window.open(c.formulario, '_blank'); }
  c.estado = 'enviado'; c.enviado = Date.now(); m.fecha = new Date().toISOString();
  log('comercial', `Enviado a ${c.empresa} (${m.tipo})`);
}

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
      const buenas = nuevas.filter(o => o.puntuacion > 0);
      if (buenas.length) buenas.slice(0, par - activos.length).forEach(o => tareas.push(() => planificar(o)));
      else tareas.push(explorar);
    }
    msg(`Trabajando en ${tareas.length} tarea(s) a la vez…`);
    const res = await Promise.allSettled(tareas.map(f => f()));
    res.filter(x => x.status === 'rejected').forEach(x => log('error', x.reason?.message || String(x.reason)));
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
function pintar() {
  const cap = S.capitalIni - S.gasto;
  $('sEstado').innerHTML = S.viva ? (timer ? '<span class="ok">Trabajando</span>' : 'En pausa') : '<span class="b">Apagada</span>';
  $('sCapital').textContent = eur(cap); $('sGasto').textContent = eur(S.gasto);
  $('sProy').textContent = S.proyectos.filter(p => p.estado === 'activo').length + ' / ' + S.proyectos.length;
  $('sFirma').textContent = S.firmas.filter(f => f.estado === 'pendiente').length;

  $('lOp').innerHTML = S.oportunidades.length ? S.oportunidades.slice().reverse().map(o => `<div class="item"><b>${esc(o.titulo)}</b> <span class="tag">${esc(o.tipo)}</span><span class="tag">${esc(o.estado)}</span><span class="tag">riesgo ${esc(o.riesgo)}</span>
    <div class="mut">${esc(o.descripcion)}</div>${o.clientes ? `<div class="mut">Clientes: ${esc(o.clientes)} · Canal: ${esc(o.canal)}</div>` : ''}${o.evidencia_demanda ? `<div class="mut">Demanda: ${esc(o.evidencia_demanda)}</div>` : ''}${(o.fuentes || []).length ? `<div class="mut">Fuentes: ${o.fuentes.filter(f => /^https?:/.test(f)).map((f, i) => `<a href="${esc(f)}" target="_blank" style="color:inherit">[${i + 1}]</a>`).join(' ')}</div>` : '<div class="mut w">Sin fuentes</div>'}<div class="mut">Inversión ${eur(o.inversion_eur || 0)} · Ingreso/mes ${eur(o.ingreso_mensual_eur || 0)} · Prob. ${Math.round((o.probabilidad || 0) * 100)}% · Puntuación ${o.puntuacion}</div></div>`).join('') : 'Aún no ha buscado nada.';

  $('lPr').innerHTML = S.proyectos.length ? S.proyectos.slice().reverse().map(p => `<div class="item"><b>${esc(p.titulo)}</b> <span class="tag">${esc(p.estado)}${p.valoracion ? ' · ' + esc(p.valoracion) : ''}</span>
    <div class="mut">Paso ${Math.min(p.paso + 1, p.plan.pasos.length)} de ${p.plan.pasos.length} · ${esc(p.plan.objetivo)}</div>
    ${p.app ? `<div class="row" style="margin:6px 0"><span class="tag ok">📱 ${esc(p.app.nombre)}</span><button class="sec" data-zip="${p.id}">Descargar ZIP</button>${p.app.repo ? `<a class="tag" href="${esc(p.app.repo)}" target="_blank">Ver repo</a>` : `<button class="sec" data-up="${p.id}">Subir a GitHub</button>`}</div>` : ''}
    ${p.entregables.map(e => `<details><summary>${esc(e.paso)} — ${esc(e.resumen)}</summary>${e.contenido ? `<pre>${esc(e.contenido)}</pre>` : ''}</details>`).join('')}</div>`).join('') : 'Ninguno todavía.';

  $('lFi').innerHTML = S.firmas.length ? S.firmas.slice().reverse().map(f => `<div class="item"><b>${esc(f.titulo)}</b> <span class="tag ${f.estado === 'pendiente' ? 'w' : 'ok'}">${esc(f.estado)}</span>
    <div class="mut">Dónde: ${esc(f.donde)} · Qué firmar: ${esc(f.que_firmar)}</div>
    <details><summary>Ver documento</summary><pre>${esc(f.documento)}</pre></details>
    ${f.estado === 'pendiente' ? `<div class="row"><button data-f="${f.id}" data-a="firmado">Marcar firmado</button><button class="sec" data-f="${f.id}" data-a="rechazado">Rechazar</button></div>` : ''}</div>`).join('') : '<div class="mut">Nada pendiente.</div>';

  const EST = { borrador: 'w', enviado: '', en_conversacion: 'ok', respondido: 'ok', sin_respuesta: 'b', descartado: 'b', baja: 'b' };
  $('sEnv').textContent = S.contactos.filter(c => c.estado === 'borrador').length;
  $('lCo').innerHTML = S.contactos.length ? S.contactos.slice().reverse().map(c => {
    const m = c.mensajes[c.mensajes.length - 1];
    return `<div class="item"><b>${esc(c.empresa)}</b> <span class="tag ${EST[c.estado] || ''}">${esc(c.estado.replace('_', ' '))}</span><span class="tag">${esc(c.proyecto)}</span>
    <div class="mut">${esc(c.sector)} · ${esc(c.ciudad)} · ${c.web ? `<a href="${esc(c.web)}" target="_blank" style="color:inherit">${esc(c.web)}</a>` : ''} · ${esc(c.email || 'formulario web')}</div>
    <div class="mut">Por qué encaja: ${esc(c.por_que_encaja)}${c.fuente_contacto ? ` · <a href="${esc(c.fuente_contacto)}" target="_blank" style="color:inherit">fuente del contacto</a>` : ''}</div>
    <div class="mut">${m.verificado ? '<span class="ok">✔ Verificado: no promete ni inventa nada</span>' : '<span class="w">⚠ Sin verificar: revísalo bien</span>'}${(m.problemas || []).length ? ' · Corregido: ' + esc(m.problemas.join('; ')) : ''}</div>
    <details ${c.estado === 'borrador' ? 'open' : ''}><summary>${esc(m.tipo)}: ${esc(m.asunto)}</summary><pre>${esc(m.cuerpo)}</pre></details>
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
  ['op', 'pr', 'co', 'fi', 'hc', 'di', 'cf'].forEach(t => $('t-' + t).classList.toggle('hide', t !== b.dataset.t));
});
$('lFi').onclick = e => { const f = S.firmas.find(x => x.id === e.target.dataset.f); if (f) { f.estado = e.target.dataset.a; log('firma', f.titulo + ': ' + f.estado); save(); pintar(); } };
$('lPr').onclick = async e => {
  const p = S.proyectos.find(x => x.id === (e.target.dataset.zip || e.target.dataset.up)); if (!p) return;
  try { if (e.target.dataset.zip) await zipApp(p); else { e.target.disabled = true; await subirApp(p); } } catch (err) { msg('Error: ' + err.message); e.target.disabled = false; }
};
$('cSync').onclick = conectarSync;
$('lCo').onclick = e => {
  const c = S.contactos.find(x => x.id === e.target.dataset.c); if (!c) return;
  const a = e.target.dataset.a;
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
