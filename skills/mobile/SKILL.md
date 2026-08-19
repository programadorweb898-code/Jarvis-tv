# Skill: Mobile

## Propósito
Esta skill representa el punto de entrada del usuario en Jarvis TV. Es la responsable de capturar la intención humana (voz o táctil), enviarla al backend y presentar los resultados o estados de forma amigable.

## Responsabilidades
- Proporcionar la interfaz de usuario (UI) para la interacción.
- Capturar la entrada de voz y realizar la conversión a texto (Speech-to-Text).
- Comunicarse con el `backend` para enviar intenciones y recibir respuestas.
- Mostrar retroalimentación sobre el estado de los comandos (ej. "Enviado", "Ejecutando", "Error").
- Reproducir respuestas de voz cuando sea necesario (Text-to-Speech).

## Interacción
- **Entradas:** 
    - Interacción táctil del usuario.
    - Entrada de audio (voz).
    - Respuestas de estado desde el `backend`.
- **Salidas:** 
    - Solicitudes de intención (texto) hacia el `backend`.
    - Retroalimentación visual/auditiva para el usuario.

## Reglas de Seguridad (Human Capability Principle)
- La aplicación móvil solo debe solicitar permisos estrictamente necesarios (micrófono, internet).
- No debe almacenar localmente datos sensibles de la TV o del usuario sin cifrado y autorización explícita.
- Toda la lógica de control reside en el backend; el móvil solo es un vehículo de interacción.

## Herramientas (Tools) Disponibles
- `captureAudio()`: Inicia la captura de voz.
- `sendIntent(text)`: Envía el texto procesado al backend.
- `displayStatus(status)`: Muestra al usuario el estado de su solicitud.
- `playAudioResponse(text)`: Reproduce la respuesta del agente mediante TTS.

## Guía de Implementación
- La UI debe ser intuitiva y responder rápidamente a la interacción.
- El manejo de la comunicación con el `backend` debe ser robusto ante desconexiones (ej. reintentos).
- Seguir las guías de diseño de la plataforma destino (Android/iOS) para una experiencia natural.
- Mantener la lógica de procesamiento de voz (STT/TTS) desacoplada para permitir cambios futuros de proveedor.
