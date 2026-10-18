# Survival

IA autónoma que busca **cualquier forma legal** de ganar dinero y la ejecuta de principio a fin. El dueño solo firma.

## Regla general
1. **Busca sola** oportunidades en cualquier ámbito: bolsa, apps (Play Store, web), software para empresas, productos digitales, afiliación, arbitraje, recompensas…
2. **Las ejecuta sola**: investiga, decide, desarrolla (código, textos, propuestas), prepara la publicación o venta, mide y mejora o abandona.
3. **Hace también el trabajo del dueño**: contratos, facturas, fichas de tienda y documentación para Hacienda. Todo listo para firmar.
4. **Aprende de sus errores** con un diario y lecciones que usa en cada decisión.
5. **Solo pide firma** en lo que legalmente exige a una persona real (identidad, cuentas, cobros, contratos, impuestos).
6. **Supervivencia**: cada ciclo cuesta dinero; si se queda sin capital, se apaga.

Las normas fijas están en `normas.js`.

## Estado actual: modo pruebas
Piensa, investiga en internet y desarrolla entregables, pero **no ejecuta nada real** (ni pagos, ni registros, ni publicaciones). El capital es simulado.

## Ciclo
Explorar → Evaluar → Planificar → Ejecutar paso a paso → Preparar firmas → Aprender.

## Generador de apps
Cuando un proyecto consiste en una app, la programa entera (web app en `www/`), escribe la ficha de Play Store y la política de privacidad, y la sube a un repo privado de tu GitHub. Ese repo incluye un flujo de GitHub Actions que compila el APK (para probar) y el AAB (para Play Store) en cada cambio. A ti te queda en "Firmas" la publicación paso a paso.

## Sincronización
Con un token de GitHub (permisos `gist`, `repo`, `workflow`) el estado se guarda en un Gist privado: mismo estado en el móvil y en el ordenador.

## Uso
1. Abre la app (GitHub Pages) y pon tu clave API de Anthropic en **Ajustes** (se guarda solo en tu dispositivo).
2. Pulsa **Ejecutar un ciclo** o activa el **modo continuo**.

La documentación fiscal es un borrador: debe revisarla un gestor antes de presentarla.
