# Protocolo de Comunicación Jarvis TV

Este documento define la estructura de los mensajes intercambiados vía WebSocket entre el cliente Android TV y el Backend (Cerebro en la nube).

## Estructura General

Todos los mensajes son objetos JSON.

```json
{
  "id": "uuid-v4",
  "type": "tipo_de_mensaje",
  "payload": { ... },
  "timestamp": "ISO-8601"
}
```

---

## Tipos de Mensajes

### 1. `audio_stream` (TV -> Backend)
Envío de audio capturado para procesamiento.

```json
{
  "type": "audio_stream",
  "payload": {
    "format": "pcm/wav",
    "data": "base64_encoded_data"
  }
}
```

### 2. `command` (Backend -> Backend / cliente)
Comando a ejecutar. **La ejecución la realiza el Backend** a través del Android TV Remote protocol v2 (puerto 6466, TLS con el certificado de la app): el backend traduce la acción a un keycode y lo envía directamente al servicio remote de la TV, como lo haría el control remoto real.

```json
{
  "type": "command",
  "payload": {
    "action": "volumeUp",
    "params": {}
  }
}
```

Acciones soportadas actualmente (ver `backend/src/remote.ts`):
`volumeUp`, `volumeDown`, `mute`, `play`, `pause`, `playPause`, `back`, `home`, `enter`, `navigateUp`, `navigateDown`, `navigateLeft`, `navigateRight`.

### 3. `execution_result` (Backend -> TV)
Resultado de la ejecución del comando. El backend lo envía a la TV después de inyectar la tecla en el servicio remote.

```json
{
  "type": "execution_result",
  "payload": {
    "action": "volumeUp",
    "status": "success",
    "message": "Tecla enviada (keyCode=24)"
  }
}
```

### 3.1 `intent` (TV -> Backend)
Texto de la intención del usuario en lenguaje natural. El backend lo procesa con el agente (LLM), decide la tool y la ejecuta.

```json
{
  "type": "intent",
  "payload": {
    "text": "subí el volumen"
  }
}
```

### 3.2 `agent_response` (Backend -> TV)
Respuesta de texto del agente (para feedback visual o TTS).

```json
{
  "type": "agent_response",
  "payload": {
    "text": "Listo, volumeUp ejecutado."
  }
}
```

### 3.3 `tv_state` (Backend -> TV)
Estado del backend (por ejemplo, si el remote hacia la TV está listo). Se envía al conectar y ante cambios.

```json
{
  "type": "tv_state",
  "payload": {
    "remoteReady": true
  }
}
```

---

## Tools del Agente

El agente resuelve la intención en una tool y la ejecuta. Tools actuales (`backend/src/agent/tools.ts`):

| Tool | Params | Descripción |
| --- | --- | --- |
| `volumeUp` | - | Sube el volumen |
| `volumeDown` | - | Baja el volumen |
| `mute` | - | Silencia/desilencia |
| `play` | - | Reproduce |
| `pause` | - | Pausa |
| `playPause` | - | Alterna reproducir/pausar |
| `back` | - | Retrocede |
| `home` | - | Pantalla de inicio |
| `navigate` | `direction` (up/down/left/right) | Mueve el foco |
| `openApp` | `app` (nombre o package) | Abre una app. Deep link nativo si existe (youtube, netflix, disneyplus); si no, URL de Play Store (`.../details?id=<package>`), que Play services resuelve al launch intent. Acepta también un package directo (ej. `org.jellyfin.androidtv`). Nota: el fallback de Play Store requiere que la TV tenga Play Store instalada (en la TV del proyecto no funciona). |
| `viewingHistory` | - | Consulta la memoria de uso: apps abiertas recientemente con fecha/hora. La TV reporta la app activa (`current_app` del remote) y `openApp` registra cada apertura. Persistido en `backend/data/usage.json`. |
| `webSearch` | `query` | Busca información actualizada en internet (noticias, horarios, resultados, etc.) vía Tavily (keyless, sin API key). Útil cuando el usuario pide datos que cambian en el tiempo ("¿a qué hora juega River hoy?"). |

Apps con nombre conocido: youtube, netflix, primevideo, disneyplus, spotify, twitch, plex, jellyfin, crunchyroll, kodi, vlc (`backend/src/agent/tools.ts`).

El proveedor del LLM es intercambiable (`backend/src/agent/provider.ts`, variable `LLM_PROVIDER`). Proveedores disponibles:
- `mock` (por defecto): reglas en español, sin API key.
- `openai-compatible`: usa la API de chat completions con tools. Configurable por env: `LLM_API_URL` (base URL, ej. `https://api.openai.com/v1`, `http://localhost:1234/v1`, `https://openrouter.ai/api/v1`), `LLM_API_KEY` (opcional para servidores locales sin auth), `LLM_MODEL` (id del modelo).

La búsqueda web es intercambiable (`backend/src/search/search.ts`, variable `SEARCH_PROVIDER`):
- `tavily` (por defecto): búsqueda real, keyless (sin API key).
- `mock`: resultados simulados (tests/offline).

### 4. `error` (Backend/TV -> Backend/TV)
Reporte de errores en cualquier dirección.

```json
{
  "type": "error",
  "payload": {
    "code": "ACCESSIBILITY_SERVICE_UNAVAILABLE",
    "message": "No se pudo acceder a los servicios de accesibilidad"
  }
}
```
