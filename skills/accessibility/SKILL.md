# Skill: Accessibility

## Propósito
Esta skill asegura que la interfaz de la aplicación sea utilizable por todos los usuarios, independientemente de sus capacidades físicas, visuales o auditivas. Su objetivo es implementar estándares de accesibilidad desde la base, garantizando una experiencia inclusiva tanto en dispositivos móviles como en pantallas de TV.

## Responsabilidades
- Asegurar que todos los componentes sean navegables mediante tecnologías de asistencia (ej. TalkBack, VoiceOver).
- Verificar que el contraste de color y el tamaño de fuente cumplan con los estándares WCAG.
- Implementar etiquetas semánticas y descripciones de texto alternativas para todos los elementos visuales.
- Proporcionar retroalimentación clara y redundante (visual, sonora, táctil) para todas las acciones.

## Interacción
- **Entradas:** 
    - Eventos de interfaz de usuario.
    - Configuración de accesibilidad del dispositivo.
- **Salidas:** 
    - Ajustes de estilo para el frontend.
    - Notificaciones para tecnologías de asistencia.

## Reglas de Seguridad (Human Capability Principle)
- La accesibilidad nunca debe comprometer la privacidad del usuario; las descripciones alternativas no deben exponer datos sensibles.
- El usuario siempre debe tener el control sobre qué ayudas de accesibilidad están activadas.

## Herramientas (Tools) Disponibles
- `checkContrast(colorPair)`: Verifica contraste.
- `setAriaLabel(element, label)`: Define etiquetas para lectores de pantalla.
- `announce(message)`: Envía mensajes a tecnologías de asistencia.

## Guía de Implementación
- Implementar accesibilidad desde el diseño inicial (Accessibility-first).
- Realizar pruebas constantes con lectores de pantalla y herramientas de validación automática.
- Mantener la consistencia en la navegación por teclado/D-pad.

## Lectura de UI del agente (decisión 2026-08-20)
El agente lee la interfaz de la TV y toca elementos **desde el backend vía ADB**, no desde el AccessibilityService:

- **Leer elementos:** `uiautomator dump` + parseo XML → `getScreenElements` (backend/src/uidump.ts). Devuelve texto plano compacto por nodo (`text`, `contentDesc`, `clickable`, centro del `bounds`).
- **Tocar un elemento:** `input tap <x> <y>` → `clickElement(text)` (backend/src/uidump.ts), con matching fuzzy (case-insensitive, sin acentos, sin espacios).
- **Fallback de visión:** `seeScreen` (captura por ADB) queda como último recurso cuando `getScreenElements` no encuentra elementos (UI en canvas/Compose sin semántica, p. ej. YouTube TV).
- **Motivo:** el firmware de la TV del proyecto (AI PONT, Android 14 / MediaTek homwee) bloquea la habilitación de AccessibilityService de terceros ("disallowed by device admin policy"), y además apps como YouTube TV no exponen textos a uiautomator (SurfaceView sin nodos accesibles).
- **AccessibilityService sigue siendo la opción** para TVs donde sí se pueda habilitar (leer árbol de nodos, click por nodo, `typeText`, `swipe`). En `JarvisAccessibilityService.kt` quedaron `pressButton`, `navigate`, `typeText`, `volume`, `swipe`; `typeText` y `swipe` dependen del service habilitado (limitación documentada en el código).
