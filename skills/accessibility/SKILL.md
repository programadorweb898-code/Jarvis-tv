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
