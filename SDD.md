# SSD — Jarvis TV

## 1. Identidad del proyecto

**Nombre:** Jarvis TV

**Objetivo:** construir un sistema que permita al usuario controlar una Android TV mediante comandos de voz dados directamente al dispositivo, utilizando un agente basado en LLM (en la nube) para interpretar las intenciones y convertirlas en acciones ejecutables en la televisión.

El sistema debe comportarse como un usuario humano frente a la TV.

---

## 2. Objetivo principal

El usuario debe poder hablar directamente a la Android TV y expresar instrucciones en lenguaje natural.

Ejemplo:

*«"Abrí YouTube y buscá música de Daft Punk."»*

El sistema deberá:

1. Capturar el audio en la Android TV.
2. Enviar el audio (o texto) al Backend en la nube.
3. El agente (LLM) analizará la intención.
4. El agente seleccionará las tools necesarias.
5. El backend enviará un comando concreto a la Android TV.
6. La Android TV ejecutará la acción mediante Accessibility Services.
7. El resultado será informado al usuario en la TV.

Flujo conceptual:

Usuario → Android TV (Voz) → Backend (Agent/LLM) → Comando → Android TV (Accessibility Service) → UI → Resultado

> **Decisión arquitectónica (2026-08-19):** la ejecución de acciones se realiza desde el **Backend** mediante el **Android TV Remote protocol v2** (puerto 6466, TLS con el certificado de la app). La TV del proyecto (AI PONT SA, Android 14 / MediaTek homwee) bloquea la habilitación de servicios de accesibilidad de terceros (el framework solo permite los suyos, "disallowed by device admin policy") y rechaza conexiones locales al servicio remote (6466). El backend, desde la LAN, sí puede inyectar teclas en el servicio remote con el mismo certificado que la app, comportándose como el control remoto real (alineado con el Human Capability Principle).

---

## 3. Principio fundamental de seguridad

### Human Capability Principle

El agente debe poseer únicamente las capacidades que tendría un usuario humano utilizando normalmente la Android TV.

Esto significa que el agente puede:

- navegar por la interfaz;
- pulsar botones;
- escribir texto;
- abrir aplicaciones;
- seleccionar elementos;
- reproducir contenido;
- pausar contenido;
- cambiar volumen;
- retroceder;
- desplazarse;
- utilizar funciones visibles y accesibles para el usuario.

El agente no puede:

- acceder a bases de datos privadas de aplicaciones;
- leer credenciales;
- obtener información interna de otras aplicaciones;
- saltarse permisos;
- ejecutar acciones privilegiadas;
- utilizar APIs privadas para obtener capacidades adicionales;
- modificar archivos internos de otras aplicaciones;
- ejecutar comandos arbitrarios con privilegios del sistema.

Si una acción no puede realizarla un usuario normal mediante la interfaz disponible, el agente tampoco debe poder realizarla.

---

## 4. Arquitectura conceptual

El sistema estará dividido en dos componentes principales:

### Android TV (Cliente Ligero)

Responsabilidades:

- captura de audio;
- comunicación con backend;
- recepción de comandos;
- visualización de feedback visual;
- pairing del certificado (el backend lo reutiliza para inyectar teclas).

### Backend (Cerebro)

Responsabilidades:

- recibir audio/texto del cliente;
- gestionar conexiones;
- ejecutar el agente (LLM);
- decidir qué tools utilizar;
- enviar comandos de vuelta al cliente;
- mantener estado de la sesión.

---

## 5. Arquitectura inicial

La arquitectura objetivo será:

Android TV ↔ Backend (Nube)

La comunicación entre componentes utilizará WebSocket para comunicación en tiempo real y baja latencia.

---

## 6. Tools

El agente no tendrá acceso directo a Android TV.

El agente utilizará tools explícitas.

Ejemplos conceptuales:

- "openApp"
- "pressButton"
- "typeText"
- "navigate"
- "play"
- "pause"
- "stop"
- "volumeUp"
- "volumeDown"
- "back"

Las tools deben:

- tener una responsabilidad concreta;
- aceptar parámetros explícitos;
- validar sus argumentos;
- producir resultados estructurados;
- manejar errores;
- respetar el Human Capability Principle.

No crear una tool genérica capaz de ejecutar código arbitrario.

---

## 7. Ejemplo de ejecución

Solicitud del usuario:

*«"Subí un poco el volumen."»*

Flujo:

1. Usuario → Android TV
2. El cliente captura: *"Subí un poco el volumen."*
3. Android TV → Backend (en la nube)
4. El agente determina que necesita utilizar: *"volumeUp()"*
5. Backend → Android TV
6. Envía el comando de ejecución.
7. Android TV (Accessibility Service) ejecuta la acción.
8. Android TV → Backend
9. Devuelve resultado de ejecución.

---

## 8. Arquitectura de voz

El sistema tendrá dos capacidades independientes:

### Speech-to-Text

Convierte: audio → texto

### Text-to-Speech

Convierte: texto → audio

Estas capacidades deben mantenerse desacopladas del agente.

El agente debe trabajar principalmente con texto y herramientas.

Esto permitirá cambiar posteriormente el proveedor de voz sin modificar la arquitectura principal.

---

## 9. Estado y contexto

El agente debe mantener únicamente el contexto necesario para completar la interacción.

Ejemplo:

Usuario: *«"Abrí YouTube."»*
Agente: *"openApp("YouTube")"*

Usuario: *«"Buscá películas de ciencia ficción."»*

El agente debe comprender que la segunda instrucción continúa relacionada con la aplicación abierta.

El manejo de contexto debe diseñarse de manera explícita y no depender accidentalmente de memoria ilimitada del LLM.

---

## 10. Comunicación

Los mensajes entre componentes deberán utilizar estructuras definidas y versionables.

Un comando conceptual puede contener:

- "id"
- "type"
- "action"
- "payload"
- "timestamp"

Una respuesta puede contener:

- "id"
- "status"
- "result"
- "error"

Ejemplo conceptual:

```json
{
  "id": "command-id",
  "type": "command",
  "action": "volumeUp",
  "payload": {}
}
```

Las estructuras definitivas deberán establecerse cuando se implemente el protocolo de comunicación.

---

## 11. Identificación de dispositivos

El sistema deberá diferenciar:

- usuario;
- Android TV.

Una cuenta o usuario podrá eventualmente tener más de una TV.

El sistema deberá poder determinar a qué dispositivo debe enviarse una acción.

---

## 12. Conectividad

El sistema deberá contemplar:

- conexión perdida;
- reconexión;
- TV apagada;
- backend no disponible;
- timeout;
- comandos duplicados;
- comandos ejecutados parcialmente.

Las acciones deben producir estados claros:

- "pending"
- "executing"
- "success"
- "failed"
- "timeout"

La implementación exacta se definirá durante el desarrollo.

---

## 13. Manejo de errores

Los errores deben clasificarse según su origen.

Ejemplos:

- error del usuario;
- error del LLM;
- tool inexistente;
- parámetros inválidos;
- aplicación no disponible;
- elemento de UI no encontrado;
- timeout;
- error de comunicación.

El agente no debe inventar resultados.

Si una acción falla, debe recibir el error real y decidir si:

- reintenta;
- utiliza otra estrategia permitida;
- solicita información;
- informa al usuario.

---

## 14. Desarrollo incremental

El proyecto se desarrollará por fases.

Fase 1 — Comunicación básica (TV ↔ Backend)
Fase 2 — Ejecución de comandos simples en TV vía Accessibility
Fase 3 — Tools y Agente en Nube
Fase 4 — Integración de voz (STT/TTS)
Fase 5 — Refinamiento

No implementar funcionalidades futuras antes de verificar las fases anteriores.

---

## 15. Stack tecnológico inicial

### Backend

- Node.js
- TypeScript
- WebSocket
- LLM (API de proveedor externo)
- `androidtv-remote` (cliente del Android TV Remote protocol v2 para inyección de teclas)

### Android TV

- Android
- Kotlin
- Accessibility Service (ejecución alternativa; en la TV del proyecto no es habilitable)
- Cliente remote/pairing propio en Kotlin (`tv/src/main/java/com/jarvis/tv/remote/`)

No agregar dependencias sin justificar su necesidad.

---

## 16. Estructura conceptual del proyecto

- "AGENTS.md"
- "SDD.md"
- "skills/"
- "backend/"
- "tv/"
- "docs/"

La estructura física definitiva podrá modificarse cuando existan requisitos técnicos concretos.

---

## 17. Reglas de arquitectura

1. Mantener responsabilidades separadas.
2. Evitar acoplamiento innecesario.
3. No permitir acceso privilegiado del agente.
4. Las tools deben ser explícitas.
5. El agente no ejecuta código arbitrario.
6. Los comandos deben ser verificables.
7. Los componentes deben poder probarse individualmente.
8. Priorizar interfaces simples.
9. Evitar sobreingeniería.
10. Documentar decisiones arquitectónicas importantes.

---

## 18. Criterios de calidad

Cada implementación debe priorizar:

- simplicidad;
- legibilidad;
- mantenibilidad;
- seguridad;
- testabilidad;
- observabilidad;
- bajo acoplamiento;
- separación de responsabilidades.

---

## 19. Decisiones pendientes

Las siguientes decisiones se tomarán durante el desarrollo:

- proveedor/modelo LLM;
- protocolo definitivo de comunicación;
- estrategia de autenticación;
- sistema de observabilidad.

No asumir estas decisiones como definitivas hasta documentarlas.

---

## 20. Estado actual

El proyecto se encuentra en la **Fase 2** del desarrollo incremental.

### Fase 1 — Comunicación básica (TV ↔ Backend) — en curso

- Backend WebSocket (`backend/src/server.ts`) en puerto 8080 que recibe `audio_stream` y `execution_result`, y puede enviar `command`.
- TV conecta por WebSocket a `ws://192.168.1.58:8080` (IP local de desarrollo; el destino final es el backend en Render).
- Protocolo definido en `docs/protocol.md`: mensajes JSON con `id`, `type`, `payload`, `timestamp`.

### Fase 2 — Ejecución de comandos — en curso

> **Decisión arquitectónica:** la ejecución se hace desde el **Backend** vía Android TV Remote protocol v2 (6466, TLS), no desde la TV vía Accessibility. Motivación: el firmware de la TV (AI PONT, Android 14 / MediaTek homwee) bloquea ambos caminos on-device:
> - Accesibilidad: solo enumera sus 3 servicios propios y rechaza otros con "disallowed by device admin policy".
> - Remote local: el servicio 6466 rechaza conexiones cuyo origen es la propia TV (loopback/IP propia), incluso bindeando el socket a la IP LAN.
> El backend por LAN sí inyecta teclas con el mismo certificado (verificado: volumen 15→16→15).

- `backend/src/remote.ts`: cliente remote v2 (puerto 6466) con `androidtv-remote`, certificado en `backend/certs/` (gitignored, fuera del repo).
- `backend/src/server.ts`: al recibir `command`, mapea acción→keycode y envía la tecla vía remote; devuelve `execution_result` a la TV.
- Acciones soportadas: volumeUp/Down, mute, play, pause, playPause, back, home, enter, navigate{Up,Down,Left,Right}.
- `JarvisAccessibilityService` queda como mecanismo alternativo para TV donde el firmware lo permita; en esta TV no es habilitable.
- Config por env: `JARVIS_TV_HOST`, `JARVIS_TV_CERT`, `JARVIS_TV_KEY`, `JARVIS_TV_CERT_DIR`, `JARVIS_TV_NAME`.
- **Verificado end-to-end**: `command volumeUp` → backend → remote 6466 → TV ejecuta (volumen 15→16); `volumeDown` (16→15).

### Fase 3 — Tools y Agente — en curso

- `backend/src/agent/`:
  - `types.ts`: `AgentDecision` (tool/reply/error), `ToolDef`, `ExecutionResult`.
  - `tools.ts`: registro de tools + `Executor` (traduce tool → tecla/app link vía `TvRemote`). Tools: `volumeUp`, `volumeDown`, `mute`, `play`, `pause`, `playPause`, `back`, `home`, `navigate(direction)`, `openApp(app)`.
  - `provider.ts`: interfaz `AgentProvider` intercambiable + factory (`LLM_PROVIDER` env, por defecto `mock`) + provider mock rule-based en español (sin API key).
  - `agent.ts`: decide (provider) → valida → ejecuta → `execution_result` + `agent_response`.
- `server.ts`: nuevo mensaje `intent` (texto) → agente → ejecución.
- **Verificado localmente** (sin TV): `npm test` (node:test) — decisión del provider mock, mapping de executor y agente end-to-end con remote falso.
- **Pendiente**: conectar proveedor LLM real (OpenAI/Anthropic/otro), probar `openApp` en la TV.

### Pendientes

- Probar el flujo completo con voz (STT/TTS) con el agente LLM.
- Conectar proveedor LLM real (OpenAI/Anthropic/otro) en `provider.ts`.
- Probar `openApp` en la TV real (deep links de youtube/netflix y fallback por Play Store ya implementados, sin verificar en dispositivo).
- Autenticación y WSS (actualmente el backend es `ws://` sin auth).
- Configurar URL del backend de Render.
- Reinstalar el APK final en la TV (el hook temporal de auto-submit del código de pairing fue eliminado).

---

## 21. Principio rector

Jarvis TV debe convertirse en un agente capaz de utilizar una Android TV de forma natural mediante lenguaje humano, pero siempre respetando la misma frontera de capacidades que tendría una persona.

1. El LLM decide qué acción intentar.
2. Las tools definen qué acciones puede solicitar.
3. Android TV determina qué acciones pueden ejecutarse.
4. El Backend inyecta las teclas mediante el Android TV Remote protocol v2 (equivalente al control remoto real); Accessibility es el mecanismo alternativo para interacción con la interfaz cuando el firmware lo permite.
