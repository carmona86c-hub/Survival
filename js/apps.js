// ---------- Fábrica de apps (Android / Play Store) ----------
// Flujo: diseño → programación → pruebas reales + revisión de diseño → corrección → TÚ la ves y apruebas → se sube.
const esApp = (pr, paso) => paso.tipo === 'crear' && /app|aplicaci|play ?store|android|pwa/i.test(pr.titulo + ' ' + paso.accion + ' ' + (paso.detalle || '') + ' ' + (pr.plan.objetivo || ''));
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app';
const NOTA_MINIMA = 8;

const ESTANDAR_APP = `ESTÁNDAR DE CALIDAD OBLIGATORIO (la app debe ser espectacular, detallada y práctica):
VISUAL: identidad propia y coherente con el tema (paleta definida como variables CSS, tipografía con pilas de fuentes del sistema bien escogidas, iconos SVG propios dentro del código); jerarquía clara, espaciado generoso, sombras y profundidad con mesura; transiciones y microanimaciones suaves que respeten prefers-reduced-motion; modo claro y oscuro automáticos; pantalla de inicio cuidada; estados vacíos con ilustración SVG y una llamada a la acción; nada de aspecto de plantilla genérica.
DETALLE: todas las funciones completas, sin nada a medias; validación de formularios con mensajes claros; confirmaciones y "deshacer" dentro de la propia interfaz (nunca alert, confirm ni prompt); avisos breves (toasts) al guardar o borrar; búsqueda y filtros donde haya listas; ajustes; exportar e importar los datos del usuario (JSON); onboarding breve la primera vez; contenido real en español, sin lorem ipsum.
PRÁCTICA: la tarea principal en dos toques como máximo; navegación inferior de pulgar; zonas táctiles de 44 px o más; respeta las zonas seguras del móvil (env(safe-area-inset-*)); sin desplazamiento horizontal a 360 px de ancho; funciona sin conexión; guarda los datos en localStorage SIEMPRE dentro de try/catch y sigue funcionando si falla; accesible (contraste AA, etiquetas, foco visible, aria donde haga falta).
TÉCNICO: un solo archivo HTML con CSS y JS dentro, sin librerías, servidores ni recursos externos; <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">; código ordenado y sin errores en consola.`;

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

// La app corre aislada (sin acceso a los datos de Survival). Para que no se rompa al guardar datos,
// se le da un almacenamiento propio en memoria y avisa al visor de que ha arrancado o de sus errores.
const SHIM = id => `<script>(()=>{try{localStorage.getItem('_')}catch(e){const m=()=>{const d={};return{getItem:k=>k in d?d[k]:null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]},clear:()=>{for(const k in d)delete d[k]},key:i=>Object.keys(d)[i]??null,get length(){return Object.keys(d).length}}};for(const n of['localStorage','sessionStorage'])try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(x){}}${id ? `const P=x=>parent.postMessage(Object.assign({visor:'${id}'},x),'*');addEventListener('error',e=>P({err:e.message+' (línea '+e.lineno+')'}));addEventListener('unhandledrejection',e=>P({err:'Promesa: '+(e.reason&&e.reason.message||e.reason)}));addEventListener('load',()=>P({ok:1}));` : ''}})()<\/script>`;
const inyectar = (html, extra) => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + extra) : extra + html;

// Ejecuta la app en un iframe aislado (tamaño móvil) y recoge errores reales y problemas de pantalla.
function probarApp(html) {
  return new Promise(ok => {
    const id = uid(), errores = [];
    const espia = `<script>(()=>{const s=m=>parent.postMessage({sv:'${id}',e:String(m).slice(0,300)},'*');addEventListener('error',e=>s(e.message+' (línea '+e.lineno+')'));addEventListener('unhandledrejection',e=>s('Promesa: '+(e.reason&&e.reason.message||e.reason)));const ce=console.error;console.error=(...a)=>{s('console.error: '+a.join(' '));ce(...a)};addEventListener('load',()=>setTimeout(()=>{const d=document.documentElement;if(d.scrollWidth>innerWidth+2)s('Se sale de la pantalla: '+d.scrollWidth+'px de ancho en un móvil de '+innerWidth+'px');if(!document.querySelector('meta[name=viewport]'))s('Falta la etiqueta meta viewport');let n=0,pequenos=0;document.querySelectorAll('button,[onclick],a,[role=button]').forEach((b,i)=>{const r=b.getBoundingClientRect();if(r.width&&r.height&&(r.height<36||r.width<36))pequenos++;if(i<25&&!/^(http|mailto|tel)/.test(b.getAttribute('href')||'')){try{b.click();n++}catch(x){s('Al pulsar: '+x.message)}}});if(pequenos>2)s(pequenos+' botones demasiado pequeños para el dedo');parent.postMessage({sv:'${id}',fin:1,texto:(document.body&&document.body.innerText||'').length,botones:n},'*')},900))})()<\/script>`;
    const f = document.createElement('iframe');
    f.sandbox = 'allow-scripts allow-forms'; f.style.cssText = 'position:fixed;left:-9999px;top:0;width:390px;height:844px;border:0';
    let res = null;
    const on = e => { if (e.data?.sv !== id) return; if (e.data.e) errores.push(e.data.e); if (e.data.fin) res = e.data; };
    addEventListener('message', on);
    f.srcdoc = inyectar(html, SHIM() + espia);
    document.body.appendChild(f);
    setTimeout(() => { removeEventListener('message', on); f.remove(); ok({ errores, cargo: !!res, texto: res?.texto || 0, botones: res?.botones || 0 }); }, 4500);
  });
}

// Director de diseño: define la identidad y cada pantalla ANTES de programar.
async function disenarApp(pr, spec) {
  msg('Director de diseño trabajando en «' + pr.titulo + '»…');
  return pensar(`Eres el director de diseño de un estudio de apps premiado. Diseña al detalle la app del proyecto «${pr.titulo}» (objetivo: ${pr.plan.objetivo}).
${spec}
Mira en internet cómo son las apps mejor valoradas de esta categoría y qué se critica en sus reseñas, para hacerla claramente mejor y más bonita.
${ESTANDAR_APP}
Devuelve JSON: {"concepto","publico","personalidad":"3 adjetivos","paleta":{"claro":{"fondo","superficie","texto","acento","acento2","exito","aviso","error"},"oscuro":{...lo mismo}},"tipografia":{"titulos","texto","numeros"},"iconografia","pantallas":[{"nombre","proposito","elementos":["..."],"interacciones":["..."],"estado_vacio"}],"flujo_principal":["paso 1","paso 2"],"microinteracciones":["..."],"detalles_wow":["lo que la hará memorable"],"datos_de_ejemplo":"qué ejemplo mostrar la primera vez"}`, { buscar: true, max: 6000 });
}

// Calidad: errores reales + revisión de diseño y uso con nota. Aprueba solo con todo ≥ NOTA_MINIMA y sin errores.
async function revisarApp(html, contexto, t) {
  const qa = await pensar(`Eres el equipo de calidad y diseño, muy exigente. Revisa esta app frente a su diseño y especificación y frente al estándar. Puntúa de 1 a 10 sin regalar nota y lista TODO lo que hay que mejorar, en concreto.
${ESTANDAR_APP}
Contexto, diseño y especificación: ${contexto}
Pruebas automáticas en un móvil de 390 px: ${JSON.stringify(t)}
Código: ${html.slice(0, 80000)}
Devuelve JSON: {"notas":{"visual":n,"usabilidad":n,"detalle":n,"practica":n},"fallos":["..."],"mejoras":["..."]}`, { max: 4000 });
  const n = qa.notas || {}, minima = Math.min(...['visual', 'usabilidad', 'detalle', 'practica'].map(k => +n[k] || 0));
  return { ...qa, minima, aprobada: minima >= NOTA_MINIMA && !t.errores.length && t.cargo };
}

async function probarYCorregir(pr, idx, contexto) {
  const pruebas = [];
  for (let ronda = 1; ronda <= 3; ronda++) {
    msg(`Probando y revisando la app (ronda ${ronda})…`);
    const t = await probarApp(idx.contenido);
    const qa = await revisarApp(idx.contenido, contexto, t);
    pruebas.push({ ronda, errores: t.errores, cargo: t.cargo, notas: qa.notas, fallos: qa.fallos || [], mejoras: qa.mejoras || [], aprobada: qa.aprobada });
    log('app', `Ronda ${ronda}: ${t.errores.length} errores, nota mínima ${qa.minima}/10${qa.aprobada ? ' ✔ aprobada' : ''}`);
    if (qa.aprobada || ronda === 3) break; // la última ronda solo comprueba
    msg(`Mejorando la app (ronda ${ronda})…`);
    const fix = await pensar(`Mejora esta app hasta que sea espectacular y no tenga ningún fallo. Corrige TODO lo de abajo sin perder nada de lo que ya funciona.
${ESTANDAR_APP}
Contexto y diseño: ${contexto}
Errores de ejecución: ${JSON.stringify(t.errores)}
Fallos: ${JSON.stringify(qa.fallos)}
Mejoras pedidas: ${JSON.stringify(qa.mejoras)}
Código actual: ${idx.contenido}
Devuelve JSON: {"contenido":"el index.html completo mejorado"}`, { max: 32000 });
    if (fix.contenido && fix.contenido.length > 500) idx.contenido = fix.contenido;
  }
  return pruebas;
}

const contextoApp = (pr, spec) => `${spec}\nDiseño: ${JSON.stringify(pr.app?.diseno || {})}`;
const htmlApp = pr => pr.app?.archivos.find(a => /index\.html$/.test(a.ruta));

async function generarApp(pr, paso) {
  const est = S.oportunidades.find(o => o.id === pr.opId)?.estudio;
  const spec = est?.plan ? `Estudio del centro de I+D (síguelo): enfoque ${est.enfoque_recomendado}. Especificación: ${est.plan.especificacion}. Hitos: ${JSON.stringify(est.plan.hitos)}. Lo que piden los usuarios y monetización: ${JSON.stringify((est.informes || []).filter(i => /Producto|ASO/.test(i.rol)).map(i => i.recomendaciones))}` : `Objetivo: ${pr.plan.objetivo}`;
  const diseno = await disenarApp(pr, spec);
  msg('Programando la app de «' + pr.titulo + '»…');
  const r = await pensar(`Programa la app completa del proyecto «${pr.titulo}» siguiendo EXACTAMENTE este diseño, pantalla por pantalla, con todos sus detalles. Paso: ${JSON.stringify(paso)}
${spec}
Diseño: ${JSON.stringify(diseno)}
${ESTANDAR_APP}
Un solo archivo www/index.html que luego se empaquetará para Android con Capacitor.
Incluye también: "ficha" para Play Store (titulo ≤30, descripcion_corta ≤80, descripcion_larga, categoria, precio_eur, palabras_clave) y "privacidad" (política de privacidad completa en español, fiel a lo que la app hace con los datos).
Devuelve JSON: {"nombre","app_id":"com.survival.algo","resumen","archivos":[{"ruta":"www/index.html","contenido":"..."}],"ficha":{...},"privacidad":"..."}`, { max: 32000 });
  const nombre = r.nombre || pr.titulo, appId = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(r.app_id) ? r.app_id : 'com.survival.' + slug(nombre).replace(/-/g, '');
  const archivos = (r.archivos || []).filter(a => a.ruta && a.contenido);
  const idx = archivos.find(a => /index\.html$/.test(a.ruta));
  pr.app = { nombre, appId, archivos, ficha: r.ficha, diseno, repo: null, estado: 'por_revisar', version: 1, resumen: r.resumen };
  pr.app.pruebas = idx ? await probarYCorregir(pr, idx, contextoApp(pr, spec)) : [];
  if (r.ficha?.descripcion_larga) {
    const [v] = await verificar([{ asunto: r.ficha.titulo, cuerpo: r.ficha.descripcion_larga }], `App «${nombre}». Lo que hace de verdad: ${r.resumen}. Diseño: ${diseno.concepto}`);
    if (v) r.ficha.descripcion_larga = v.cuerpo;
  }
  archivos.push(
    { ruta: '.github/workflows/android.yml', contenido: workflowAndroid(nombre, appId) },
    { ruta: 'PRIVACIDAD.md', contenido: r.privacidad || '' },
    { ruta: 'FICHA_PLAY_STORE.json', contenido: JSON.stringify(r.ficha || {}, null, 2) },
    { ruta: 'README.md', contenido: `# ${nombre}\n\n${r.resumen || ''}\n\nGenerada por Survival. Cada cambio compila el APK (pruebas) y el AAB (Play Store) en la pestaña Actions.\n` }
  );
  const ult = pr.app.pruebas.at(-1);
  pr.entregables.push({ paso: paso.accion, tipo: 'app', resumen: `App «${nombre}» diseñada, programada y probada (${pr.app.pruebas.length} rondas, ${ult?.aprobada ? 'aprobada por calidad' : 'con avisos'}). Pendiente de que la veas y apruebes.`, contenido: 'Concepto: ' + (diseno.concepto || '') + '\n\nPruebas:\n' + JSON.stringify(pr.app.pruebas, null, 2) });
  log('app', `«${nombre}» lista para que la veas: Proyectos → Ver app`);
}

// El dueño ha visto la app y pide cambios: se rehace y se vuelve a probar.
async function mejorarApp(pr, instruccion) {
  const idx = htmlApp(pr); if (!idx) throw new Error('La app no tiene index.html');
  msg('Aplicando tus cambios a «' + pr.app.nombre + '»…');
  const r = await pensar(`El dueño ha visto la app y pide estos cambios. Aplícalos todos, con el mismo nivel de calidad o más, sin romper nada.
Petición del dueño: ${instruccion}
${ESTANDAR_APP}
Diseño original: ${JSON.stringify(pr.app.diseno || {})}
Código actual: ${idx.contenido}
Devuelve JSON: {"contenido":"el index.html completo con los cambios"}`, { max: 32000 });
  if (!r.contenido || r.contenido.length < 500) throw new Error('No se pudo rehacer la app');
  idx.contenido = r.contenido;
  pr.app.pruebas = await probarYCorregir(pr, idx, contextoApp(pr, 'Cambios pedidos por el dueño: ' + instruccion));
  pr.app.version = (pr.app.version || 1) + 1; pr.app.estado = 'por_revisar';
  (pr.app.cambios = pr.app.cambios || []).push({ fecha: new Date().toISOString(), instruccion });
  log('app', `«${pr.app.nombre}» v${pr.app.version} con tus cambios, lista para verla`);
}

// Solo tras tu aprobación: se sube a GitHub y se prepara la publicación en Play Store.
async function aprobarApp(pr) {
  pr.app.estado = 'aprobada';
  log('app', `Has aprobado «${pr.app.nombre}» v${pr.app.version || 1}`);
  if (C.gh && !pr.app.repo) { try { await subirApp(pr); } catch (e) { log('error', 'Subir app: ' + e.message); } }
  else if (C.gh && pr.app.repo) { try { await actualizarRepo(pr); } catch (e) { log('error', 'Actualizar app: ' + e.message); } }
  if (!S.firmas.some(f => f.prId === pr.id && /Play Store/.test(f.titulo) && f.estado === 'pendiente')) S.firmas.push({
    id: uid(), prId: pr.id, estado: 'pendiente', titulo: `Publicar «${pr.app.nombre}» en Play Store`, donde: 'Google Play Console',
    que_firmar: 'Cuenta de desarrollador a tu nombre, firma de la app y envío a revisión',
    documento: `Todo lo técnico está hecho. Lo que te toca a ti:\n1. Crear la cuenta de desarrollador en play.google.com/console (pago único de 25 $ y verificación de identidad).\n2. Descargar el archivo .aab desde la pestaña Actions del repo ${pr.app.repo || '(pon tu token de GitHub en Ajustes y pulsa «Subir a GitHub»)'}.\n3. Crear la app con el ID ${pr.app.appId} y activar "Firma de apps de Google Play".\n4. Copiar la ficha (FICHA_PLAY_STORE.json) y pegar la política de privacidad (PRIVACIDAD.md, publícala en una URL, por ejemplo GitHub Pages).\n5. Las cuentas personales nuevas deben hacer una prueba cerrada con testers durante 14 días antes de publicar.\n6. Enviar a revisión.\n\nFicha preparada:\n${JSON.stringify(pr.app.ficha || {}, null, 2)}`
  });
  save(); pintar();
}

async function subirApp(pr) {
  const yo = await gh('/user');
  let nombre = 'app-' + slug(pr.app.nombre);
  try { await gh('/repos/' + yo.login + '/' + nombre); nombre += '-' + uid().slice(0, 4); } catch (e) {}
  const repo = await gh('/user/repos', { method: 'POST', body: JSON.stringify({ name: nombre, private: true, auto_init: true, description: 'App generada por Survival: ' + pr.app.nombre }) });
  pr.app.repoNombre = repo.full_name;
  for (const a of pr.app.archivos) { msg('Subiendo ' + a.ruta); await subirArchivo(repo.full_name, a); }
  pr.app.repo = repo.html_url;
  log('app', 'Subida a GitHub: ' + repo.html_url);
  save(); pintar();
}
async function subirArchivo(full, a) {
  const ruta = a.ruta.split('/').map(encodeURIComponent).join('/');
  let sha; try { sha = (await gh(`/repos/${full}/contents/${ruta}`)).sha; } catch (e) {}
  await gh(`/repos/${full}/contents/${ruta}`, { method: 'PUT', body: JSON.stringify({ message: 'Survival: ' + a.ruta, content: btoa(unescape(encodeURIComponent(a.contenido))), ...(sha ? { sha } : {}) }) });
}
async function actualizarRepo(pr) {
  const full = pr.app.repoNombre || pr.app.repo.replace('https://github.com/', '');
  const idx = htmlApp(pr); if (idx) await subirArchivo(full, idx);
  log('app', `Repo actualizado con «${pr.app.nombre}» v${pr.app.version}`);
}

async function zipApp(pr) {
  if (!window.JSZip) { await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
  const z = new JSZip(); pr.app.archivos.forEach(a => z.file(a.ruta, a.contenido));
  const a = document.createElement('a'); a.href = URL.createObjectURL(await z.generateAsync({ type: 'blob' })); a.download = slug(pr.app.nombre) + '.zip'; a.click();
}

// ---------- Visor: la app dentro de un marco de móvil, aislada ----------
let visorEscucha = () => {}, visorTimer;
function verApp(pr) {
  const idx = htmlApp(pr); if (!idx) return msg('Esta app aún no tiene pantalla');
  $('visorTit').textContent = `${pr.app.nombre} · v${pr.app.version || 1}`;
  const n = pr.app.pruebas?.at(-1)?.notas;
  const notas = n ? `Notas de calidad: visual ${n.visual} · uso ${n.usabilidad} · detalle ${n.detalle} · práctica ${n.practica}` : '';
  $('visorNotas').textContent = notas; $('visorNotas').className = 'mut';
  const id = uid(); let arranco = false; const errs = [];
  removeEventListener('message', visorEscucha);
  visorEscucha = e => {
    if (e.data?.visor !== id) return;
    if (e.data.ok) arranco = true;
    if (e.data.err) { errs.push(e.data.err); $('visorNotas').className = 'b'; $('visorNotas').textContent = '⚠ La app tiene un error: ' + errs[0] + ' — pulsa «Rehacer app» y lo corrige.'; $('visorPedir').value = 'Corrige este error: ' + errs[0]; }
  };
  addEventListener('message', visorEscucha);
  clearTimeout(visorTimer);
  visorTimer = setTimeout(() => { if (!arranco && !errs.length) { $('visorNotas').className = 'w'; $('visorNotas').textContent = '⚠ La app no ha llegado a arrancar en este visor. Si estás en la vista previa de Claude, ábrela desde carmona86c-hub.github.io/Survival; si no, pulsa «Rehacer app».'; } }, 4000);
  $('visorFrame').srcdoc = inyectar(idx.contenido, SHIM(id));
  $('visor').dataset.pr = pr.id;
  $('visor').classList.remove('hide', 'completa');
  document.body.style.overflow = 'hidden';
}
function cerrarVisor() { clearTimeout(visorTimer); removeEventListener('message', visorEscucha); $('visor').classList.add('hide'); $('visorFrame').srcdoc = ''; document.body.style.overflow = ''; }
