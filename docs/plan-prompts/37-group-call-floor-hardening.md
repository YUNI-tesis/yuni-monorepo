# 37 - Floor estricto para llamadas grupales

## Objetivo

Estabilizar las llamadas de dos o tres avatares sin cambiar la arquitectura de sesiones LiveAvatar LITE independientes ni separar RAG, generación o voz de los ElevenLabs Agents.

## Resultado esperado

- Un router semántico elige exactamente un experto para preguntas normales y dos o tres sólo para debates o comparaciones.
- Pedidos colectivos y menciones inequívocas se resuelven determinísticamente.
- El servidor conserva un único owner del floor y los eventos no autorizados nunca cancelan su ronda.
- El navegador mantiene todos los medios muteados salvo al owner y envía `user_activity` a los Agents inactivos.
- Cada participante ve el transcript público actualizado antes de su instrucción privada.
- Las posiciones, controles, historial y llamadas individuales no sufren regresiones.

## Fuera de alcance

Sala LiveKit compartida, BYO LiveKit, bridge PCM, Custom LLM grupal, texto público preplanificado, túneles y feature flags entre arquitecturas.

## Aceptación

“¿Podrían introducirse una vez cada uno?” produce una respuesta por participante en orden fijo, sin duplicados, preguntas genéricas ni superposición audible, y devuelve el piso al usuario.
