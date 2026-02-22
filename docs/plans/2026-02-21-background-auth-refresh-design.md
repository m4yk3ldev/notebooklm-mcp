# Diseño: Refresco de Autenticación Invisible y Reactivo (2026-02-21)

Este documento detalla el diseño de un sistema de refresco de autenticación automático para el servidor MCP de NotebookLM, eliminando la fricción manual tras la expiración de las cookies.

## 1. Arquitectura de Intercepción y Refresco

El sistema implementa un enfoque **Reactivo (Estrategia de Reintento)**:

1.  **Captura del Error**: El método `execute` de `NotebookLMClient` intercepta el código de error de autenticación (Código 16).
2.  **Activación del Refresco Silencioso**: Llama a `refreshCookiesHeadless()` en `src/browser-auth.ts`.
3.  **Proceso en Segundo Plano**: Lanza Google Chrome en **modo headless** (invisible) usando el perfil dedicado en `~/.notebooklm-mcp/chrome-profile`.
4.  **Extracción Automática**: Usa el protocolo CDP (`Network.getCookies`) para obtener las cookies frescas. Como el perfil ya tiene la sesión iniciada, Google debería entregar las cookies nuevas sin pedir contraseña.
5.  **Reintento Transparente**: El cliente actualiza su estado interno y el archivo `auth.json`, y reintenta automáticamente la petición original que falló.

## 2. Lógica de Fallo y Recuperación (Fallback)

En caso de que la sesión de Google expire completamente:

1.  **Límite de Reintentos**: Si el refresco silencioso falla, se intentará **una sola vez**.
2.  **Activación de Smart Auth**: Si el refresco oculto no obtiene las cookies, el sistema lanza automáticamente la **ventana visible** de Chrome con el mismo perfil.
3.  **Guía al Usuario**: Se imprime un mensaje en la consola informando de la expiración de la sesión y la necesidad de re-loguearse en la ventana abierta.
4.  **Actualización Global**: Tras el logueo, el sistema captura las cookies nuevas de forma persistente.

## 3. Cambios en Componentes

- **`src/client.ts`**: Actualizar `execute` y `executeOnce` para capturar errores de autenticación y manejar el flujo de reintento.
- **`src/browser-auth.ts`**: Implementar `refreshCookiesHeadless()` y refactorizar el código de lanzamiento de Chrome para soportar modos headless y visible.
- **`src/auth.ts`**: Asegurar que la actualización de cookies en disco sea atómica y segura para múltiples hilos/peticiones.

## 4. Pruebas y Validación

- Simular la expiración de cookies borrando el archivo `auth.json` o alterando una de las cookies requeridas.
- Verificar que las peticiones MCP continúen funcionando sin intervención manual tras una expiración controlada.
- Validar el comportamiento de fallback lanzando intencionadamente un perfil sin sesión activa.
