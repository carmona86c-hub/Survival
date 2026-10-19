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
En una factura escribe exactamente [NUM_FACTURA] donde vaya el número (se numera sola) y rellena "factura" con sus importes reales acordados; la retención de IRPF solo si el cliente es empresa o profesional y la actividad la lleva (si no, 0).
Devuelve JSON: {"interes":"alto|medio|bajo|baja","analisis","siguiente_paso","respuesta":{"asunto","cuerpo"}|null,"documentos":[{"titulo","tipo":"presupuesto|contrato|factura|otro","contenido","factura":{"concepto","cliente","nif_cliente","base_eur":número,"iva_pct":número,"retencion_pct":número}|null}]}`, { max: 8000 });
  resp.procesada = true; resp.analisis = r.analisis;
  if (r.interes === 'baja') { c.estado = 'baja'; log('comercial', `${c.empresa} pidió no recibir más mensajes`); return; }
  const pr = S.proyectos.find(p => p.id === c.prId);
  const [v] = r.respuesta ? await verificar([r.respuesta], (pr ? contextoPr(pr) : c.proyecto) + ' · Lo que ha dicho el cliente: ' + resp.texto) : [];
  if (v) { c.mensajes.push({ tipo: 'respuesta', ...v }); c.estado = 'borrador'; }
  else c.estado = r.interes === 'bajo' ? 'descartado' : 'en_conversacion';
  (r.documentos || []).forEach(d => {
    const f = { id: uid(), prId: c.prId, estado: 'pendiente', titulo: `${d.titulo} · ${c.empresa}`, que_firmar: d.tipo, donde: c.empresa, documento: d.contenido || '' };
    if (d.tipo === 'factura' && d.factura && +d.factura.base_eur > 0) {
      const num = siguienteNumFactura(new Date().getFullYear());
      f.factura = { ...d.factura, cliente: d.factura.cliente || c.empresa, num };
      f.documento = f.documento.split('[NUM_FACTURA]').join(num);
      f.titulo = `Factura ${num} · ${c.empresa}`;
      f.que_firmar = 'factura: al darle conformidad se apunta sola como venta en Hacienda';
      log('hacienda', `Factura ${num} preparada para ${c.empresa}`);
    }
    S.firmas.push(f);
  });
  log('comercial', `${c.empresa}: interés ${r.interes}. ${r.siguiente_paso || ''}`);
}

// Supervisión: el dueño pide cambios y ella rehace el escrito (y el verificador lo revisa otra vez).
async function reescribir(pieza, instruccion, contexto) {
  const r = await pensar(`El dueño ha revisado este escrito y pide cambios. Rehazlo entero aplicando exactamente lo que pide, sin inventar nada.
Petición del dueño: ${instruccion}
Escrito actual: ${JSON.stringify({ asunto: pieza.asunto, cuerpo: pieza.cuerpo })}
Contexto: ${contexto}
Devuelve JSON: {"asunto","cuerpo"}`, { max: 6000 });
  const [v] = await verificar([r], contexto + ' · Petición del dueño: ' + instruccion);
  return v || { ...r, verificado: false };
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
