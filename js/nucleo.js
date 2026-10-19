// Survival · núcleo: estado, sincronización, utilidades y cerebro (Claude API)
// ===== Survival · núcleo del agente (modo pruebas) =====
const $ = id => document.getElementById(id);
const KEY = 'survival_state_v1', CFG = 'survival_cfg_v1';

const def = () => ({ capitalIni: 1000, gasto: 0, viva: true, oportunidades: [], proyectos: [], firmas: [], diario: [], lecciones: [], fiscal: [], contactos: [], titular: {} });
let S = Object.assign(def(), load(KEY) || {});
let C = Object.assign({ key: '', model: 'claude-sonnet-5-5', cap: 1000, pin: 3, pout: 15, min: 10, gh: '', gist: '', par: 3, autoArranque: true }, load(CFG) || {});
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
