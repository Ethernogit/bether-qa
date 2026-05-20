# QA Studio — CLI

## Qué es este proyecto
CLI en TypeScript que escanea proyectos Node.js/Express y genera un `architecture.json`
con módulos, patrones de diseño, features y conexiones entre ellas.

## Stack
- TypeScript + Node.js
- commander (CLI)
- glob (file finding)
- ts-morph (AST parsing de TS/JS)
- Anthropic SDK (llamadas a Claude)

## Estructura de carpetas objetivo
src/
commands/       → comandos del CLI (scan, sync, etc.)
parser/         → lógica de lectura de archivos y AST
ai/             → prompts y llamadas a Claude API
output/         → generación del architecture.json y .md
## Flujo del comando principal
1. `scan` lee estructura de carpetas (sin IA)
2. `scan --modules` manda módulos a Claude para clasificar
3. `scan --connections` conecta los módulos ya clasificados
4. Todo se guarda en `architecture.json`

## Reglas importantes
- Análisis incremental: nunca mandar todo el proyecto a la IA en un solo prompt
- Siempre estimar tokens antes de una llamada grande y mostrar advertencia al usuario
- El archivo `architecture.json` siempre tiene schema validado (no JSON libre)
- Código en inglés, comentarios en español