# Skill: Voice

## Propósito
Esta skill gestiona la conversión de lenguaje natural entre el usuario y el sistema. Su objetivo es abstraer el procesamiento de voz (STT y TTS) para que el agente pueda trabajar exclusivamente con texto, manteniendo la arquitectura desacoplada de los proveedores específicos de voz.

## Responsabilidades
- Procesar el flujo de audio de entrada y convertirlo a texto (Speech-to-Text - STT).
- Convertir las respuestas de texto del agente a audio (Text-to-Speech - TTS).
- Asegurar que la calidad del audio capturado sea adecuada para el reconocimiento.
- Gestionar posibles errores de reconocimiento o síntesis.

## Interacción
- **Entradas:** 
    - Flujo de audio (capturado desde `mobile`).
    - Texto (generado por el `agent`).
- **Salidas:** 
    - Texto procesado (hacia `mobile` / `agent`).
    - Audio sintetizado (hacia `mobile`).

## Reglas de Seguridad (Human Capability Principle)
- **Privacidad:** El procesamiento de voz debe minimizar el almacenamiento de muestras de audio. Si se requiere almacenamiento temporal para procesamiento, debe borrarse inmediatamente después.
- No procesar comandos de voz que contengan información sensible personal si no es estrictamente necesario para la interacción.
- Garantizar que el usuario sea consciente de cuándo se está capturando audio.

## Herramientas (Tools) Disponibles
- `transcribe(audioStream)`: Convierte audio a texto.
- `synthesize(text)`: Convierte texto a audio.
- `setVoiceProfile(profile)`: Permite ajustar características de la voz (ej. tono, velocidad) si la plataforma lo permite.

## Guía de Implementación
- **Desacoplamiento:** Implementar mediante interfaces claras para poder cambiar de proveedor de STT/TTS (ej. de Google a OpenAI o local) sin modificar el núcleo del agente.
- Optimizar el envío de audio para minimizar latencia en la transcripción.
- Implementar manejo de errores robusto cuando el audio no es inteligible.
- Priorizar el procesamiento eficiente para que la interacción se sienta fluida y natural.
