# Diseño: @m4yk3ldev/notebooklm-mcp

**Fecha:** 2026-02-18
**Autor:** Maykel
**Estado:** Aprobado

## Objetivo

Paquete npm que expone un MCP server de NotebookLM en TypeScript, ejecutable con:

```bash
npx -y @m4yk3ldev/notebooklm-mcp serve
```

Port funcional completo del paquete Python `notebooklm-mcp-server` v0.1.15 (32 herramientas).

## Stack

| Componente | Tecnología |
|-----------|-----------|
| Runtime | Node.js ≥ 18 |
| Lenguaje | TypeScript 5.x |
| MCP SDK | @modelcontextprotocol/sdk |
| HTTP | fetch nativo (Node 18+) |
| CLI | commander |
| Build | tsup |
| Chrome auth | chrome-launcher + chrome-remote-interface |

## Arquitectura: Monolito modular

```
src/
  cli.ts          → Entry point, subcomandos (serve, auth)
  server.ts       → MCP server, registro de 32 tools
  client.ts       → NotebookLMClient: HTTP, batchexecute RPC, parsing
  auth.ts         → Extracción cookies Chrome, cache tokens
  constants.ts    → RPC IDs, mapeos bidireccionales, validaciones
  types.ts        → Interfaces TypeScript compartidas
```

### Responsabilidades

- **cli.ts**: Parsea `serve` / `auth` con commander. Entry point del bin.
- **server.ts**: Instancia `McpServer`, registra 32 tools con schemas Zod.
- **client.ts**: Clase `NotebookLMClient` — envía RPCs a batchexecute, parsea respuestas, maneja CSRF auto-refresh.
- **auth.ts**: Lanza Chrome, extrae cookies via CDP, guarda/carga `~/.notebooklm-mcp/auth.json`.
- **constants.ts**: Mapa de RPC IDs, enums de formatos/duraciones/idiomas.
- **types.ts**: `AuthTokens`, `Notebook`, `Source`, `StudioArtifact`, etc.

## Herramientas MCP (32 total)

### Notebooks (6)
- `notebook_list` — Listar notebooks
- `notebook_create` — Crear notebook
- `notebook_get` — Detalles de un notebook
- `notebook_describe` — Resumen IA del notebook
- `notebook_rename` — Renombrar notebook
- `notebook_delete` — Eliminar (confirm)

### Fuentes (8)
- `source_describe` — Resumen IA de fuente
- `source_get_content` — Contenido raw de fuente
- `notebook_add_url` — Agregar URL/YouTube
- `notebook_add_text` — Agregar texto
- `notebook_add_drive` — Agregar doc Google Drive
- `source_list_drive` — Listar fuentes Drive con frescura
- `source_sync_drive` — Sincronizar obsoletas (confirm)
- `source_delete` — Eliminar fuente (confirm)

### Consultas (2)
- `notebook_query` — Preguntar sobre fuentes
- `chat_configure` — Configurar chat

### Investigación (3)
- `research_start` — Iniciar investigación web/Drive
- `research_status` — Polling progreso
- `research_import` — Importar fuentes descubiertas

### Studio - Generación (10)
- `audio_overview_create` — Podcast (confirm)
- `video_overview_create` — Video (confirm)
- `infographic_create` — Infografía (confirm)
- `slide_deck_create` — Presentación (confirm)
- `report_create` — Reporte (confirm)
- `flashcards_create` — Tarjetas estudio (confirm)
- `quiz_create` — Quiz (confirm)
- `data_table_create` — Tabla datos (confirm)
- `mind_map_create` — Mapa mental (confirm)
- `studio_status` — Estado generación + URLs

### Studio - Gestión (1)
- `studio_delete` — Eliminar artefacto (confirm)

### Auth (2)
- `refresh_auth` — Recargar tokens
- `save_auth_tokens` — Guardar cookies manualmente

## Autenticación

### Modo 1: CLI automático
```bash
npx @m4yk3ldev/notebooklm-mcp auth
```
1. Lanza Chrome con `--remote-debugging-port=9222`
2. Navega a `https://notebooklm.google.com`
3. Espera login del usuario
4. Extrae cookies via Chrome DevTools Protocol
5. Guarda en `~/.notebooklm-mcp/auth.json`

### Modo 2: Variables de entorno
```bash
NOTEBOOKLM_COOKIES="SID=xxx; HSID=xxx; ..."
NOTEBOOKLM_CSRF_TOKEN="xxx"
```

### Prioridad de carga
env vars > archivo cache > error

### Cookies requeridas (5 mínimas)
`SID`, `HSID`, `SSID`, `APISID`, `SAPISID`

### Cache
`~/.notebooklm-mcp/auth.json` — compatible con formato del paquete Python.

## API de NotebookLM

### Endpoint principal
```
POST https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute
```

### RPC IDs
| RPC ID | Operación |
|--------|-----------|
| `wXbhsf` | list_notebooks |
| `rLM1Ne` | get_notebook |
| `CCqFvf` | create_notebook |
| `s0tc2d` | rename_notebook |
| `WWINqb` | delete_notebook |
| `izAoDd` | add_source |
| `hizoJc` | get_source |
| `yR9Yof` | check_freshness |
| `FLmJqe` | sync_drive |
| `tGMBJ` | delete_source |
| `hPTbtc` | get_conversations |
| `VfAZjd` | get_summary |
| `tr032e` | get_source_guide |
| `Ljjv0c` | start_fast_research |
| `QA9ei` | start_deep_research |
| `e3bVqc` | poll_research |
| `LBwxtb` | import_research |
| `R7cb6c` | create_studio |
| `gArtLc` | poll_studio |
| `V5N4be` | delete_studio |
| `yyryJe` | generate_mind_map |
| `CYK0Xb` | save_mind_map |
| `cFji9` | list_mind_maps |
| `AH0mwd` | delete_mind_map |
| `hT54vc` | preferences |
| `ozz5Z` | subscription |
| `ZwVcOc` | settings |

### Protocolo
- POST con body URL-encoded
- `f.req=[[["{rpc_id}","{json_params}",...]]]&at={csrf_token}`
- Respuesta: JSON anidado en formato RPC

## Build y publicación

```json
{
  "name": "@m4yk3ldev/notebooklm-mcp",
  "bin": { "notebooklm-mcp": "./dist/cli.js" },
  "files": ["dist"],
  "engines": { "node": ">=18" }
}
```

Build: `tsup src/cli.ts --format cjs --target node18`
Publish: `npm publish --access public`

## Dependencias

```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "commander": "^12.0.0",
  "chrome-launcher": "^1.1.0",
  "chrome-remote-interface": "^0.33.0",
  "zod": "^3.23.0"
}
```

## Manejo de errores

- Cookies expiradas → auto-refresh CSRF, mensaje claro
- Timeout operaciones largas → 120s configurable via `--query-timeout` o `NOTEBOOKLM_QUERY_TIMEOUT`
- Tools con `confirm` → devuelven preview sin ejecutar si `confirm=false`
- Chrome no disponible → error descriptivo con instrucciones
- Auth error (RPC code 16) → mensaje pidiendo re-autenticar

## Compatibilidad

- Node ≥ 18
- Linux, macOS, Windows
- Claude Code, Cursor, cualquier cliente MCP
- Cache compatible con paquete Python (misma ruta y formato)
