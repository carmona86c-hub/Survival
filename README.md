# Survival

IA autónoma que busca **cualquier forma legal** de ganar dinero y la ejecuta de principio a fin. El dueño solo firma.

## Regla general
1. **Busca sola** oportunidades en cualquier ámbito: bolsa, apps (Play Store, web), software para empresas, productos digitales, afiliación, arbitraje, recompensas…
2. **Las ejecuta sola**: investiga, decide, desarrolla (código, textos, propuestas), prepara la publicación o venta, mide y mejora o abandona.
3. **Hace también el trabajo del dueño**: contratos, facturas, fichas de tienda y documentación para Hacienda. Todo listo para firmar.
4. **Aprende de sus errores** con un diario y lecciones que usa en cada decisión.
5. **Solo pide firma** en lo que legalmente exige a una persona real (identidad, cuentas, cobros, contratos, impuestos).
6. **Supervivencia**: cada ciclo cuesta dinero; si se queda sin capital, se apaga.

Las normas fijas están en `normas.js`. El código está en `js/`: `nucleo.js` (estado, sincronización y cerebro), `agente.js` (búsqueda, I+D, planes y ejecución), `apps.js` (fábrica de apps y visor), `comercial.js` (clientes, verificador y supervisión) y `ui.js` (ciclo e interfaz).

## Estado actual: modo pruebas
Piensa, investiga en internet y desarrolla entregables, pero **no ejecuta nada real** (ni pagos, ni registros, ni publicaciones). El capital es simulado.

## Ciclo
Explorar → Estudiar (I+D) → Planificar → Ejecutar paso a paso → Preparar firmas → Aprender.

## Centro de I+D
Cada oportunidad, antes de empezar, la estudia un grupo de especialistas en paralelo: mercado y demanda, técnico, legal y fiscal, comercial y finanzas; en apps, además, producto y experiencia de usuario, y posicionamiento en la tienda (ASO) y monetización. Cada uno da conclusiones, datos con fuente, riesgos y su veredicto. Un director decide qué conviene más en tus circunstancias, o lo descarta, y redacta el plan de estudio y desarrollo: especificación, objetivos, hitos con criterio de terminado, métricas y riesgos con su mitigación. El plan del proyecto se construye a partir de ese estudio.

## Radar de Play Store
Busca qué apps se piden o hacen falta: categorías de Google Play, quejas repetidas en reseñas, peticiones en foros y Reddit, colectivos con necesidades sin cubrir y apps malas, caras o abandonadas. Alterna con la búsqueda general, o lo hace a la vez si hay hueco.

## Fábrica de apps
1. **Director de diseño**: estudia las apps mejor valoradas de la categoría y sus críticas, y define la identidad (paleta clara y oscura, tipografía, iconos), cada pantalla con sus elementos, interacciones y estado vacío, el flujo principal y los detalles que la harán memorable.
2. **Programación** siguiendo ese diseño y el **estándar de calidad** (`ESTANDAR_APP` en `js/apps.js`): visual cuidada, todo completo, deshacer y avisos, búsqueda, exportar e importar, onboarding, modo oscuro, zonas táctiles grandes, sin errores, accesible y sin conexión.
3. **Pruebas reales** en un móvil de 390 px (errores, desbordes, botones pequeños) y **revisión de diseño con nota** (visual, uso, detalle y práctica). Si alguna nota baja de 8, se mejora sola, en hasta 3 rondas.
4. **Tú la ves antes de subirla**: en Proyectos, «👁 Ver app» la abre en un marco de móvil, funcionando. Puedes usarla, ponerla a pantalla completa, pedirle cambios con tus palabras (la rehace y la vuelve a probar) o aprobarla.
5. **Solo tras tu aprobación** se sube a un repo privado de tu GitHub, que compila el APK (para probar) y el AAB (para Play Store), y en «Firmas» te queda la publicación paso a paso.

En `ejemplos/turnos-facil.html` hay una app de muestra hecha con este estándar.

## Supervisión
Ella redacta todos los escritos: mensajes a empresas, respuestas a clientes, presupuestos, contratos y anuncios. Tú los ves antes de que salga nada: puedes editarlos a mano o pedirle cambios con tus palabras ("más corto", "añade pago a 30 días") y los rehace, pasando de nuevo por el verificador. Nada sale sin tu conformidad.

## Exhaustividad
Cada plan debe cubrir las 14 fases de `FASES` (normas.js): investigación, viabilidad, requisitos legales y fiscales, desarrollo, pruebas, material comercial, captación, seguimiento, negociación, entrega, facturación y cobro, obligaciones fiscales, posventa y aprendizaje. Un revisor independiente repasa cada plan y añade lo que falte antes de empezar.

## Veracidad
No inventa nada. Solo ofrece lo que puede entregar de verdad (lista de CAPACIDADES en `normas.js`) o lo que el dueño hace en persona. Cada oportunidad lleva fuentes y la prueba de que hay demanda; las que no se pueden entregar se descartan y las que no tienen fuentes pesan la mitad. Un verificador revisa todo lo que sale hacia fuera (mensajes, seguimientos, respuestas, anuncios, fichas de apps) y corrige o rechaza promesas imposibles, datos sin comprobar, clientes o testimonios inventados.

## Cualquier cliente, cualquier canal
No solo empresas: también autónomos, asociaciones, particulares, administraciones (licitaciones y subvenciones) y plataformas o marketplaces. A empresas y profesionales se les escribe por su contacto público; a particulares se les llega donde buscan (anuncios, tiendas, plataformas) o respondiendo a lo que han publicado. Anuncios, licitaciones y respuestas públicas van a "Firmas" porque se publican a tu nombre.

## Comercial
En la fase de captación busca clientes reales a los que la oferta les resuelva un problema, investiga su negocio, encuentra su contacto profesional y redacta un mensaje personalizado. Tú lo apruebas y se abre tu correo con todo escrito. Hace hasta 2 seguimientos y no insiste más. Cuando pegas una respuesta, prepara la contestación y los documentos (presupuesto, contrato, factura) con tus datos. Cumple LSSI y RGPD: nada masivo, remitente identificado y opción de baja.

## Paralelo
Trabaja en varias tareas a la vez por ciclo (ajustable de 1 a 6): proyectos, estudios, seguimientos y respuestas.

## Sincronización
Con un token de GitHub (permisos `gist`, `repo`, `workflow`) el estado se guarda en un Gist privado: mismo estado en el móvil y en el ordenador.

## Uso
1. Activa GitHub Pages (Settings → Pages → rama `main`) y abre carmona86c-hub.github.io/Survival.
2. Pon tu clave API de Anthropic en **Ajustes** (se guarda solo en tu dispositivo).
3. Pulsa **Ejecutar un ciclo** o activa el **modo continuo**.

La documentación fiscal es un borrador: debe revisarla un gestor antes de presentarla.
