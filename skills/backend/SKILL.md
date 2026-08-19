# Skill: Backend

## Propósito
El backend actúa como el núcleo de coordinación y puente de comunicación entre el dispositivo móvil (interfaz/voz), el agente (lógica/intención) y la Android TV (ejecución). Garantiza que las instrucciones lleguen de forma segura y consistente.

## Responsabilidades
- Gestionar y persistir sesiones de usuario y dispositivo.
- Autenticar conexiones desde dispositivos móviles y Android TV.
- Orquestar el flujo de datos: recibir intención del móvil -> invocar agente -> enviar comando a TV -> retornar resultado.
- Mantener el estado global de la sesión.
- Gestionar la invocación y ejecución de herramientas (Tools).

## Interacción
- **Entradas:** 
    - Solicitudes de intención en lenguaje natural (desde `mobile`).
    - Eventos de estado o errores (desde `android-tv`).
- **Salidas:** 
    - Comandos estructurados hacia `android-tv`.
    - Respuestas de estado/resultado hacia `mobile`.

## Reglas de Seguridad (Human Capability Principle)
- El backend **no debe ejecutar lógica privilegiada** por sí mismo que no tenga un equivalente humano.
- Todas las acciones solicitadas al backend deben ser validadas contra las capacidades del dispositivo final (Android TV).
- **Nunca** exponer ni loguear secretos, tokens de usuario o credenciales de la TV.

## Herramientas (Tools) Disponibles
- `authenticateDevice(deviceId, credentials)`: Valida la identidad del dispositivo.
- `dispatchCommand(deviceId, command)`: Envía un comando estructurado a la TV.
- `getSessionState(sessionId)`: Recupera el contexto de la sesión actual.
- `logEvent(sessionId, eventData)`: Registra eventos para observabilidad sin exponer datos sensibles.

## Guía de Implementación
- Seguir arquitectura de servicios desacoplados.
- Utilizar tipado fuerte (TypeScript).
- Las comunicaciones deben ser asíncronas y manejar estados claros (pending, executing, success, failed, timeout).
- No asumir que el backend tiene acceso directo al sistema operativo de la TV.
