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

// Ejecuta la app en un iframe aislado y recoge errores reales de JavaScript.
function probarApp(html) {
  return new Promise(ok => {
    const id = uid(), errores = [];
    const espia = `<script>(()=>{const s=m=>parent.postMessage({sv:'${id}',e:String(m).slice(0,300)},'*');addEventListener('error',e=>s(e.message+' (línea '+e.lineno+')'));addEventListener('unhandledrejection',e=>s('Promesa: '+(e.reason&&e.reason.message||e.reason)));const ce=console.error;console.error=(...a)=>{s('console.error: '+a.join(' '));ce(...a)};addEventListener('load',()=>setTimeout(()=>{let n=0;document.querySelectorAll('button,[onclick],a').forEach((b,i)=>{if(i<25&&!/^(http|mailto|tel)/.test(b.getAttribute('href')||'')){try{b.click();n++}catch(x){s('Al pulsar: '+x.message)}}});parent.postMessage({sv:'${id}',fin:1,texto:(document.body&&document.body.innerText||'').length,botones:n},'*')},800))})()<\/script>`;
    const f = document.createElement('iframe');
    f.sandbox = 'allow-scripts'; f.style.cssText = 'position:fixed;left:-9999px;width:390px;height:800px';
    let res = null;
    const on = e => { if (e.data?.sv !== id) return; if (e.data.e) errores.push(e.data.e); if (e.data.fin) res = e.data; };
    addEventListener('message', on);
    f.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + espia) : espia + html;
    document.body.appendChild(f);
    setTimeout(() => { removeEventListener('message', on); f.remove(); ok({ errores, cargo: !!res, texto: res?.texto || 0, botones: res?.botones || 0 }); }, 4000);
  });
}

async function generarApp(pr, paso) {
  msg('Programando la app de «' + pr.titulo + '»…');
  const est = S.oportunidades.find(o => o.id === pr.opId)?.estudio;
  const spec = est?.plan ? `Estudio del centro de I+D (síguelo): enfoque ${est.enfoque_recomendado}. Especificación: ${est.plan.especificacion}. Hitos: ${JSON.stringify(est.plan.hitos)}. Lo que piden los usuarios y monetización: ${JSON.stringify((est.informes || []).filter(i => /Producto|ASO/.test(i.rol)).map(i => i.recomendaciones))}` : '';
  const r = await pensar(`Programa una app completa y funcional para el proyecto «${pr.titulo}» (objetivo: ${pr.plan.objetivo}). Paso: ${JSON.stringify(paso)}
${spec}
Debe ser UN SOLO archivo www/index.html con todo el CSS y JavaScript dentro, sin dependencias externas ni servidores, que funcione sin conexión (guarda datos en localStorage con try/catch), pensado para el móvil y que luego se empaquetará para Android con Capacitor. Calidad de producto real que se pueda vender: útil, pulida, accesible, sin texto de relleno ni funciones a medias. Todos los botones deben funcionar.
Incluye también: "ficha" para Play Store (titulo ≤30, descripcion_corta ≤80, descripcion_larga, categoria, precio_eur, palabras_clave) y "privacidad" (política de privacidad completa en español, fiel a lo que la app hace con los datos).
Devuelve JSON: {"nombre","app_id":"com.survival.algo","resumen","archivos":[{"ruta":"www/index.html","contenido":"..."}],"ficha":{...},"privacidad":"..."}`, { max: 16000 });
  // Pruebas automáticas + revisión de calidad + corrección (hasta 2 rondas)
  const idx = (r.archivos || []).find(a => /index\.html$/.test(a.ruta));
  r.pruebas = [];
  for (let ronda = 1; idx && ronda <= 3; ronda++) {
    msg(`Probando la app (ronda ${ronda})…`);
    const t = await probarApp(idx.contenido);
    const qa = await pensar(`Eres el equipo de calidad. Revisa esta app frente a su especificación y el resultado de las pruebas automáticas. Busca fallos, funciones prometidas que no existen, botones que no hacen nada, problemas en móvil, accesibilidad y textos engañosos.
Especificación: ${spec || pr.plan.objetivo}
Pruebas automáticas: ${JSON.stringify(t)}
Código: ${idx.contenido.slice(0, 60000)}
Devuelve JSON: {"aprobada":true|false,"fallos":["..."]}`, { max: 3000 });
    r.pruebas.push({ ronda, errores: t.errores, cargo: t.cargo, fallos: qa.fallos || [], aprobada: !!qa.aprobada && !t.errores.length });
    log('app', `Pruebas ronda ${ronda}: ${t.errores.length} errores, ${(qa.fallos || []).length} fallos de calidad`);
    if (qa.aprobada && !t.errores.length && t.cargo) break;
    if (ronda === 3) break; // la última ronda solo comprueba
    msg(`Corrigiendo la app (ronda ${ronda})…`);
    const fix = await pensar(`Corrige TODOS estos problemas de la app y devuelve el archivo completo corregido.
Errores de ejecución: ${JSON.stringify(t.errores)}
Fallos de calidad: ${JSON.stringify(qa.fallos)}
Código actual: ${idx.contenido}
Devuelve JSON: {"contenido":"el index.html completo corregido"}`, { max: 16000 });
    if (fix.contenido && fix.contenido.length > 200) idx.contenido = fix.contenido;
  }
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
  pr.app = { nombre, appId, archivos, ficha: r.ficha, repo: null, pruebas: r.pruebas };
  const ult = r.pruebas.at(-1);
  pr.entregables.push({ paso: paso.accion, tipo: 'app', resumen: `App «${nombre}» programada y probada (${r.pruebas.length} rondas, ${ult?.aprobada ? 'aprobada por calidad' : 'con avisos pendientes'})`, contenido: archivos.map(a => a.ruta).join('\n') + '\n\nPruebas:\n' + JSON.stringify(r.pruebas, null, 2) });
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
