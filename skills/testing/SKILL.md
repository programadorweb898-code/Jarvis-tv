# Skill: Testing

## Propósito
Esta skill centraliza la estrategia de calidad del proyecto. Su objetivo es garantizar la estabilidad, corrección y fiabilidad del sistema mediante la automatización de pruebas en todos los niveles, facilitando la detección temprana de errores y previniendo regresiones.

## Responsabilidades
- Definir y ejecutar pruebas unitarias para todas las funcionalidades lógicas.
- Implementar pruebas de integración para asegurar la correcta comunicación entre las skills.
- Gestionar pruebas de extremo a extremo (E2E) para verificar los flujos de usuario.
- Mantener un entorno de pruebas aislado y reproducible.

## Interacción
- **Entradas:** 
    - Código fuente (de cualquier skill).
    - Escenarios de prueba definidos por el desarrollador.
- **Salidas:** 
    - Reportes de resultados de pruebas.
    - Notificaciones de fallos en el pipeline de CI/CD.

## Reglas de Seguridad (Human Capability Principle)
- Ningún dato real del usuario debe ser utilizado en los entornos de prueba.
- Los entornos de pruebas deben ser estrictamente aislados de cualquier servicio de producción.

## Herramientas (Tools) Disponibles
- `runUnitTests()`: Ejecuta pruebas unitarias.
- `runIntegrationTests()`: Ejecuta pruebas entre componentes.
- `mock(service)`: Crea simulaciones de servicios para aislar el componente bajo prueba.

## Guía de Implementación
- Seguir la pirámide de pruebas (muchas unitarias, menos de integración, pocas E2E).
- Automatizar la ejecución de pruebas en cada push.
- Priorizar la legibilidad de los casos de prueba para facilitar el mantenimiento.
