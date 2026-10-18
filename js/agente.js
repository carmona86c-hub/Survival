// ---------- Fases del ciclo ----------
async function explorar() {
  msg('Buscando oportunidades…');
  const ya = S.oportunidades.map(o => o.titulo).join('; ') || 'ninguna';
  const r = await pensar(`Investiga en internet oportunidades ACTUALES y legales para generar ingresos, en cualquier ámbito y para cualquier tipo de cliente: empresas, autónomos, particulares, administraciones (licitaciones, subvenciones), plataformas y marketplaces, contenido, productos digitales, inversión… Ya conocidas (no repetir): ${ya}.
Solo oportunidades con demanda REAL comprobada (fuentes concretas) y que puedas entregar con tus CAPACIDADES REALES más lo que el dueño pueda hacer. No infles cifras: si no hay datos, estima a la baja y dilo.
Devuelve un array JSON de 3 oportunidades: [{"titulo","tipo","clientes":"a quién se vende","canal":"cómo se llega a ellos","descripcion","inversion_eur":número,"ingreso_mensual_eur":número,"plazo_dias":número,"riesgo":"bajo|medio|alto","probabilidad":0-1,"evidencia_demanda":"qué demuestra que hay demanda","puedes_entregarlo":true|false,"necesita_del_dueno":["..."],"requiere_firma":["..."],"fuentes":["url"]}]`, { buscar: true, max: 6000 });
  return registrarOportunidades(r, 'general');
}

// ---------- Radar de Play Store: qué apps se piden o hacen falta ----------
async function explorarApps() {
  msg('Radar Play Store: buscando qué apps se piden o faltan…');
  const ya = S.oportunidades.map(o => o.titulo).join('; ') || 'ninguna';
  const r = await pensar(`Investiga en internet qué aplicaciones móviles se están pidiendo o hacen falta AHORA (prioriza España y el mundo hispanohablante). Fuentes a revisar: listas y categorías de Google Play, quejas repetidas en reseñas de apps populares (lo que los usuarios echan en falta), peticiones en foros y Reddit ("busco una app que…"), tendencias de búsqueda, necesidades de colectivos concretos (autónomos, comercios, estudiantes, mayores, hostelería…) y huecos donde las apps existentes son malas, caras o están abandonadas. Ya conocidas (no repetir): ${ya}.
Solo apps que se puedan programar como web app de un solo archivo que funcione sin servidor (o con almacenamiento local), que respeten las políticas de Google Play y que tengan demanda comprobada.
Devuelve un array JSON de 3: [{"titulo","tipo":"app","clientes","canal":"Google Play","descripcion","problema_que_resuelve","competencia":"apps existentes y sus fallos","inversion_eur":número,"ingreso_mensual_eur":número,"plazo_dias":número,"riesgo","probabilidad":0-1,"monetizacion","evidencia_demanda","puedes_entregarlo":true|false,"necesita_del_dueno":["..."],"fuentes":["url"]}]`, { buscar: true, max: 6000 });
  return registrarOportunidades(r, 'radar-apps');
}

function registrarOportunidades(r, origen) {
  let n = 0;
  (Array.isArray(r) ? r : []).forEach(o => {
    if (o.puedes_entregarlo === false) { log('evaluar', 'Descartada (no se puede entregar de verdad): ' + o.titulo); return; }
    if (!o.titulo || S.oportunidades.some(x => x.titulo.toLowerCase() === o.titulo.toLowerCase())) return;
    o.id = uid(); o.estado = 'nueva'; o.origen = origen;
    const fiable = (o.fuentes || []).filter(f => /^https?:\/\//.test(f)).length ? 1 : 0.5;
    o.puntuacion = Math.round(((o.ingreso_mensual_eur || 0) * 6 * (o.probabilidad || 0.3) * fiable - (o.inversion_eur || 0)) / Math.max(1, o.plazo_dias || 30) * 10) / 10;
    S.oportunidades.push(o); n++;
  });
  log('explorar', `${origen}: ${n} oportunidades válidas`);
  return n;
}

// ---------- Centro de I+D: grupo de estudio + director ----------
const GRUPO = [
  { rol: 'Mercado y demanda', web: true, foco: 'quién lo necesita de verdad, cuánta demanda hay, competencia real con sus precios y fallos, y qué hueco queda' },
  { rol: 'Técnico', web: false, foco: 'cómo construirlo con las CAPACIDADES REALES, arquitectura, funcionalidades imprescindibles frente a opcionales, riesgos técnicos y tiempo' },
  { rol: 'Legal y fiscal', web: true, foco: 'requisitos en España y la UE, licencias, RGPD, normas de la plataforma, alta en Hacienda, IVA y obligaciones' },
  { rol: 'Comercial', web: true, foco: 'canales concretos para llegar a los clientes, propuesta de valor, precio, objeciones probables y cómo responderlas' },
  { rol: 'Finanzas', web: false, foco: 'costes, ingresos realistas, punto de equilibrio y escenarios pesimista, base y optimista' }
];
const GRUPO_APP = [
  { rol: 'Producto y experiencia de usuario', web: true, foco: 'qué piden los usuarios en reseñas de apps parecidas, funcionalidades clave, pantallas, flujo y qué la haría mejor que la competencia' },
  { rol: 'ASO y monetización', web: true, foco: 'palabras clave, categoría, título y descripción para Google Play, modelo de ingresos (pago, suscripción, anuncios) con precios de referencia reales' }
];

async function estudiar(o) {
  msg('Centro de I+D estudiando: ' + o.titulo);
  o.estado = 'en_estudio';
  const grupo = o.tipo === 'app' || /app|aplicaci/i.test(o.titulo) ? GRUPO.concat(GRUPO_APP) : GRUPO;
  const informes = await Promise.all(grupo.map(g => pensar(`Eres el especialista de ${g.rol} del centro de I+D. Estudia esta oportunidad centrándote en: ${g.foco}.
Oportunidad: ${JSON.stringify(o)}
Sé concreto, usa datos reales con fuente y di claramente lo que no sabes.
Devuelve JSON: {"rol":"${g.rol}","conclusiones":["..."],"datos":[{"dato","fuente"}],"riesgos":["..."],"recomendaciones":["..."],"veredicto":"adelante|ajustar|descartar","motivo"}`, { buscar: g.web, max: 4000 }).catch(e => ({ rol: g.rol, error: e.message }))));
  const d = await pensar(`Eres el director del centro de I+D. Con los informes del grupo de estudio, decide qué es lo que MÁS CONVIENE en estas circunstancias (presupuesto, capacidades reales y lo que puede hacer el dueño) y redacta el plan de estudio y desarrollo.
Oportunidad: ${JSON.stringify(o)}
Informes: ${JSON.stringify(informes)}
Si los riesgos superan claramente al beneficio, o no se puede entregar con honestidad, decide descartar.
Devuelve JSON: {"decision":"adelante|descartar","motivo","enfoque_recomendado","alternativas_descartadas":["..."],"plan":{"objetivos":["..."],"especificacion":"qué se va a construir u ofrecer exactamente, con sus funcionalidades o entregables","hitos":[{"hito","criterio_de_terminado"}],"metricas":["..."],"riesgos_clave":[{"riesgo","mitigacion"}]}}`, { max: 8000 });
  o.estudio = { informes, ...d, fecha: new Date().toISOString() };
  if (d.decision === 'descartar') { o.estado = 'descartada'; log('i+d', `Descartada tras estudio: ${o.titulo}. ${d.motivo || ''}`); }
  else { o.estado = 'estudiada'; log('i+d', `Estudio completo: ${o.titulo} → ${d.enfoque_recomendado || 'adelante'}`); }
}

async function planificar(o) {
  msg('Planificando: ' + o.titulo);
  const p = await pensar(`Lleva a cabo esta oportunidad de principio a fin siguiendo el estudio del centro de I+D:\n${JSON.stringify({ ...o, estudio: o.estudio ? { decision: o.estudio.decision, enfoque: o.estudio.enfoque_recomendado, plan: o.estudio.plan } : null })}
Debe cubrir TODAS estas fases, en orden, con pasos concretos (o un paso que justifique por qué no aplica):
${FASES.map((f, i) => (i + 1) + '. ' + f).join('\n')}
Tipos de paso: "investigar", "crear" (programar, diseñar, redactar), "preparar_documento", "contactar" (buscar empresas o clientes concretos y escribirles), "publicar", "vender", "cobrar", "fiscal", "medir".
Devuelve JSON: {"objetivo","pasos":[{"fase":número,"accion","tipo","autonomo":true|false,"detalle"}],"documentos_fiscales":["..."],"criterio_exito"}
Marca autonomo:false en todo lo que requiera la identidad, firma o dinero del dueño. Los pasos "contactar" son autonomo:true (tú buscas y redactas; el dueño solo aprueba el envío).`, { max: 8000 });
  const p2 = await revisarPlan(o, p);
  if (!Array.isArray(p2.pasos) || !p2.pasos.length) throw new Error('Plan sin pasos para «' + o.titulo + '»; se repetirá');
  p2.pasos = p2.pasos.filter(x => x && x.accion);
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
  const paso = pr.plan.pasos?.[pr.paso];
  if (!paso) { pr.estado = 'terminado'; return; }
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
