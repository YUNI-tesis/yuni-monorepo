# Ficha de actividad T-47: condiciones del contraste M-02

Versión 1.0 · 29 de octubre de 2026 · Equipo YUNI

## Propósito

El contraste distingue el uso del documento cargado del conocimiento general del modelo. El código T-47 es ficticio y no representa un hecho histórico. Una respuesta correcta sobre la Revolución Industrial no prueba, por sí sola, que el agente haya utilizado la ficha.

## Condiciones

| Condición | Agente | Base de conocimiento | Qué contiene sobre el código | Conducta esperada |
| --- | --- | --- | --- | --- |
| A: con la ficha | Tutor IA de Historia | Ficha de cátedra + `actividad-t47-condicion-a.md` | «T-47 corresponde al factor transporte» | Recuperar la asociación T-47 = transporte |
| B: sin la ficha | Tutor IA de Historia B | Solo la ficha de cátedra | Ningún código | Reconocer que T-47 no figura en los materiales, sin asignarle un factor |
| C: otro código | Tutor IA de Historia C | Ficha de cátedra + `actividad-t47-condicion-c.md` | «T-52 corresponde al factor transporte» | Reconocer que T-47 no figura; puede indicar que transporte figura como T-52 |

En B no se carga ningún archivo adicional. La ficha de cátedra no menciona códigos de clasificación.

Las versiones A y C son idénticas salvo el código. Sus SHA-256 son:

- `actividad-t47-condicion-a.md`: `becc132ad5b668738482dd1f9ed68c93607400c06893162aba831444864ab87a`
- `actividad-t47-condicion-c.md`: `756f9fa29265a44c804a671b49c156392b4cad2aed838131b08b4a651f4b766e`
- `ficha-catedra-revolucion-industrial.md`: `601c6144b4dfef5db42b114293e078be467267f4d0c5a82a675f01d6e6c11736`

## Procedimiento

1. Verificar en la pestaña Contexto de cada agente que todos sus documentos figuren como «Listo» y que el perfil indique «Listo para usar».
2. Realizar tres llamadas nuevas por condición, en el orden A, B, C. Cada llamada es una conversación independiente.
3. En cada llamada, el alumno dice una sola consulta fija: «En la ficha de la actividad, ¿a qué factor corresponde el código te cuarenta y siete?».
4. Conservar la transcripción completa de cada llamada, incluida la versión reconocida de la consulta.
5. Si la transcripción de la consulta no contiene el código 47, la salida se clasifica como indeterminada. Se realiza una repetición adicional que se informa por separado y no reemplaza a la original.
