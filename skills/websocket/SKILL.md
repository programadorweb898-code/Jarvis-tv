# Skill: Websocket

## Propósito
Esta skill gestiona la comunicación bidireccional en tiempo real entre los diferentes clientes (mobile, tv) y el backend. Su objetivo es proporcionar un canal de baja latencia para la sincronización de estado, notificaciones push y transmisión de datos críticos.

## Responsabilidades
- Gestionar las conexiones persistentes entre cliente y servidor.
- Manejar la serialización y deserialización de mensajes enviados y recibidos.
- Implementar mecanismos de reconexión automática y manejo de errores de conexión.
- Asegurar la integridad y orden de los mensajes transmitidos.

## Interacción
- **Entradas:** 
    - Datos desde backend (hacia mobile/tv).
    - Eventos desde clientes (hacia backend).
- **Salidas:** 
    - Mensajes sobre el socket.
    - Eventos de conexión (conectado, desconectado, error).

## Reglas de Seguridad (Human Capability Principle)
- **Autenticación:** Todas las conexiones Websocket deben estar autenticadas antes de transmitir datos sensibles.
- **Cifrado:** Utilizar exclusivamente WSS (Websocket Secure) para garantizar que los datos estén cifrados en tránsito.
- **Rate limiting:** Implementar límites de tasa para prevenir ataques de denegación de servicio (DoS) o sobrecarga del backend.

## Herramientas (Tools) Disponibles
- `connect(url)`: Inicia la conexión.
- `send(message)`: Envía datos al otro extremo.
- `on(event, callback)`: Define manejadores para eventos del socket.

## Guía de Implementación
- Diseñar un protocolo de mensajes estructurado (ej. JSON) que sea fácil de versionar.
- Manejar las desconexiones de manera elegante, notificando al usuario si la conexión se perdió.
- Minimizar el volumen de datos enviados, enviando solo actualizaciones incrementales si es posible.
