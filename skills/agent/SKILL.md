# Skill: Agent

## Propósito
Esta skill representa el cerebro lógico del sistema. Su propósito es orquestar las interacciones, mantener el estado del contexto de la conversación, tomar decisiones basadas en las entradas del usuario y delegar tareas específicas a otras skills del sistema.

## Responsabilidades
- Gestionar el flujo de la conversación y el contexto histórico.
- Analizar las intenciones del usuario (NLU) para determinar la acción a seguir.
- Coordinar la llamada a las herramientas necesarias para cumplir con las peticiones.
- Decidir cuándo la interacción está completa o si se requiere información adicional del usuario.

## Interacción
- **Entradas:** 
    - Texto procesado (desde `voice` o `mobile`).
    - Estado actual de las otras skills.
- **Salidas:** 
    - Decisiones y acciones (hacia otras skills).
    - Respuesta final estructurada (hacia `mobile` / `voice`).

## Reglas de Seguridad (Human Capability Principle)
- **Ética:** El agente debe actuar de manera transparente, notificando al usuario si sus acciones pueden tener implicaciones reales (ej. hacer una compra o enviar un mensaje).
- **Control de acceso:** El agente debe verificar permisos antes de acceder a datos privados del usuario o realizar acciones críticas.
- **Privacidad:** No persistir información personal fuera de lo necesario para el contexto de la sesión actual sin consentimiento explícito.

## Herramientas (Tools) Disponibles
- `decide(context)`: Analiza el contexto y toma una decisión.
- `delegate(skill, task)`: Delega una tarea a una skill específica.
- `updateState(key, value)`: Actualiza el estado de la conversación.

## Guía de Implementación
- Mantener el agente stateless siempre que sea posible, gestionando el contexto de manera externa.
- Implementar un diseño basado en eventos para la comunicación con otras skills.
- Priorizar la explicabilidad de las decisiones del agente.
