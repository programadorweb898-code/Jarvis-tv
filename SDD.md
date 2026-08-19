# SSD — Jarvis TV

## 1. Identidad del proyecto

**Nombre:** Jarvis TV

**Objetivo:** construir un sistema que permita al usuario controlar una Android TV mediante comandos de voz enviados desde un dispositivo móvil, utilizando un agente basado en LLM para interpretar las intenciones y convertirlas en acciones ejecutables.

El sistema debe comportarse como un usuario humano frente a la TV.

El agente no debe disponer de privilegios superiores a los que tendría una persona utilizando el control remoto y la interfaz de la televisión.

---

## 2. Objetivo principal

El usuario debe poder hablar desde su móvil y expresar instrucciones en lenguaje natural.

Ejemplo:

*«"Abrí YouTube y buscá música de Daft Punk."»*

El sistema deberá:

1. Capturar el audio.
2. Convertir voz a texto.
3. Enviar la intención al agente.
4. El agente analizará la intención.
5. El agente seleccionará las tools necesarias.
6. Las tools generarán comandos concretos.
7. Los comandos serán enviados a Android TV.
8. Android TV ejecutará las acciones.
9. El resultado será informado al usuario.

Flujo conceptual:

Usuario → Móvil → Voz → Agent/LLM → Tools → Comunicación → Android TV → UI → Resultado

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

El sistema estará dividido inicialmente en cinco componentes principales:

### Mobile

Responsabilidades:

- interfaz del usuario;
- captura de audio;
- Speech-to-Text;
- comunicación con backend;
- visualización del estado;
- reproducción de respuestas de voz cuando corresponda.

### Backend

Responsabilidades:

- gestionar conexiones;
- autenticar dispositivos;
- coordinar comunicación;
- mantener estado;
- ejecutar el agente;
- gestionar tools;
- controlar sesiones.

### Agent

Responsabilidades:

- interpretar lenguaje natural;
- identificar intención;
- decidir qué tools utilizar;
- planificar acciones;
- procesar resultados;
- determinar si debe continuar, finalizar o pedir información al usuario.

### Android TV

Responsabilidades:

- mantener conexión con el sistema;
- recibir comandos;
- ejecutar acciones;
- devolver resultados;
- exponer únicamente las capacidades permitidas.

### Accessibility

Responsabilidades:

- interactuar con la interfaz visible;
- localizar elementos accesibles;
- realizar clicks;
- escribir texto;
- navegar;
- observar cambios relevantes en la interfaz.

---

## 5. Arquitectura inicial

La arquitectura objetivo será:

Mobile → Backend → Android TV

El agente residirá inicialmente en el backend.

La comunicación entre componentes deberá permitir:

- comandos;
- respuestas;
- eventos;
- errores;
- estado de conexión;
- identificación del dispositivo.

La comunicación en tiempo real podrá utilizar WebSocket.

No asumir que WebSocket será obligatorio para todas las comunicaciones hasta validar las necesidades de cada componente.

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

1. Usuario → Mobile
2. El móvil captura: *"Subí un poco el volumen."*
3. Mobile → Backend
4. Se envía la intención.
5. Backend → Agent
6. El agente determina que necesita utilizar: *"volumeUp()"*
7. Agent → Backend
8. Solicita la ejecución de la tool.
9. Backend → Android TV
10. Envía el comando.
11. Android TV ejecuta la acción.
12. Android TV → Backend
13. Devuelve resultado.
14. Backend → Mobile
15. Informa que la acción fue ejecutada.

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
- dispositivo móvil;
- Android TV.

Una cuenta o usuario podrá eventualmente tener más de una TV.

Ejemplo:

Usuario
→ Living
→ Dormitorio

El sistema deberá poder determinar a qué dispositivo debe enviarse una acción.

Esta funcionalidad puede implementarse posteriormente y no debe bloquear el primer prototipo.

---

## 12. Conectividad

El sistema deberá contemplar:

- conexión perdida;
- reconexión;
- TV apagada;
- móvil desconectado;
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
- TV desconectada;
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

Fase 1 — Comunicación básica
Fase 2 — Ejecución
Fase 3 — Tools
Fase 4 — Backend
Fase 5 — Agent
Fase 6 — Speech-to-Text
Fase 7 — Text-to-Speech
Fase 8 — Accessibility
Fase 9 — Integración

No implementar funcionalidades futuras antes de verificar las fases anteriores.

---

## 15. Stack tecnológico inicial

El stack se decidirá progresivamente.

Tecnologías previstas:

### Backend

- Node.js
- TypeScript
- WebSocket
- API HTTP cuando sea necesaria

### Mobile

La tecnología se definirá antes de comenzar la implementación móvil.

### Android TV

- Android
- Kotlin
- Accessibility Service cuando corresponda

### Agent

- LLM con soporte de tool calling
- arquitectura basada en tools explícitas

No agregar dependencias sin justificar su necesidad.

---

## 16. Estructura conceptual del proyecto

La estructura inicial prevista:

- "AGENTS.md"
- "SSD.md"
- "skills/"
- "backend/"
- "mobile/"
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

El código debe ser adecuado para evolucionar hacia una aplicación real y no únicamente para funcionar como prototipo temporal.

---

## 19. Decisiones pendientes

Las siguientes decisiones se tomarán durante el desarrollo y deberán documentarse cuando sean definitivas:

- framework de Mobile;
- proveedor de Speech-to-Text;
- proveedor de Text-to-Speech;
- proveedor/modelo LLM;
- protocolo definitivo de comunicación;
- estrategia de autenticación;
- almacenamiento;
- estrategia de descubrimiento de TVs;
- estrategia de conexión fuera de la red local;
- mecanismo definitivo de Accessibility;
- sistema de observabilidad;
- estrategia de despliegue.

No asumir estas decisiones como definitivas hasta documentarlas.

---

## 20. Estado actual

El proyecto se encuentra en fase de diseño y planificación.

No comenzar implementaciones complejas hasta definir la arquitectura mínima necesaria.

El primer objetivo práctico será conseguir:

Móvil → conexión → Android TV → comando simple → ejecución → respuesta.

Una vez validado este flujo, se continuará con la siguiente fase.

---

## 21. Principio rector

Jarvis TV debe convertirse en un agente capaz de utilizar una Android TV de forma natural mediante lenguaje humano, pero siempre respetando la misma frontera de capacidades que tendría una persona.

1. El LLM decide qué acción intentar.
2. Las tools definen qué acciones puede solicitar.
3. Android TV determina qué acciones pueden ejecutarse.
4. Accessibility permite interactuar con la interfaz como lo haría un usuario.
