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

### 2. `intent_result` (Backend -> TV)
Resultado del procesamiento del agente y comando a ejecutar.

```json
{
  "type": "command",
  "payload": {
    "action": "openApp",
    "params": {
      "packageName": "com.google.android.youtube"
    }
  }
}
```

### 3. `execution_result` (TV -> Backend)
Resultado de la ejecución del comando en la TV.

```json
{
  "type": "execution_result",
  "payload": {
    "action": "openApp",
    "status": "success",
    "message": "YouTube abierto correctamente"
  }
}
```

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
