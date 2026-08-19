# Skill: Android TV

## Propósito
Esta skill encapsula todas las capacidades de ejecución directa en la Android TV. Actúa como el receptor final de los comandos estructurados enviados por el backend, traduciéndolos a acciones ejecutables en el entorno de la televisión.

## Responsabilidades
- Mantener la conexión activa con el servidor (backend).
- Recibir y deserializar comandos estructurados.
- Ejecutar las acciones en el sistema operativo Android TV (o delegarlas a servicios de accesibilidad cuando sea necesario).
- Reportar el estado de ejecución (success, failed, timeout) al backend.

## Interacción
- **Entradas:** 
    - Comandos estructurados (JSON) provenientes del `backend`.
- **Salidas:** 
    - Eventos de estado de ejecución (confirmación/error) hacia el `backend`.

## Reglas de Seguridad (Human Capability Principle)
- **Restricción estricta:** Solo puede ejecutar acciones que un usuario humano podría realizar mediante la interfaz o controles normales.
- No puede modificar archivos del sistema, saltar permisos de Android, ni acceder a datos privados de otras apps.
- Si una acción requiere un permiso de sistema que el usuario normalmente no otorga de forma fluida, esa acción está prohibida para esta skill.

## Herramientas (Tools) Disponibles
- `openApp(packageName)`: Lanza una aplicación instalada.
- `pressButton(keyCode)`: Simula pulsación de botones (Home, Back, VolumeUp, VolumeDown, etc.).
- `typeText(text)`: Introduce texto en campos activos.
- `navigate(direction)`: Mueve el foco de navegación (Up, Down, Left, Right, Select).
- `play()` / `pause()`: Control de reproducción multimedia.

## Guía de Implementación
- Implementar como un servicio de Android (`Service`) para mantenerse activo.
- Utilizar `AccessibilityService` para acciones que requieran interacción con elementos visuales no estándar.
- Los comandos deben ser atómicos y manejables de forma asíncrona.
- Siempre validar que el comando recibido corresponde a una herramienta permitida antes de ejecutarlo.
