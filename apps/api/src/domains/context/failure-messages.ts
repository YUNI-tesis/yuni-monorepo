// Only translate known failures. Provider payloads can contain private identifiers.
export function describeContextFailure(error: string | null | undefined, source: "text" | "document") {
  switch (error) {
    case "Stored object was not found":
      return "No encontramos el archivo subido. Eliminá este registro y volvé a subir el documento.";
    case "Stored object exceeds the allowed size":
      return "El archivo almacenado supera el tamaño permitido. Subí una versión de hasta 20 MB.";
    case "ElevenLabs quota or rate limit reached":
      return "El servicio alcanzó su límite de procesamiento. Esperá unos minutos y reintentá. Si persiste, contactá a soporte.";
    case "ElevenLabs is temporarily unavailable":
      return "El servicio de procesamiento no está disponible temporalmente. Reintentá en unos minutos.";
    case "Knowledge base indexing failed":
      return "No se pudo preparar el contenido para consultarlo en las conversaciones. Reintentá; si vuelve a fallar, probá subir una versión en TXT o un PDF con texto seleccionable.";
    case "ElevenLabs rejected the knowledge base operation":
      return "El servicio rechazó el procesamiento y no informó un motivo específico. Reintentá; si persiste, contactá a soporte.";
    default:
      return source === "text"
        ? "No pudimos actualizar el texto que usa el avatar. No recibimos un motivo específico. Reintentá guardar el contexto."
        : "No pudimos procesar este archivo y no recibimos un motivo específico. Reintentá; si vuelve a fallar, probá subir otra versión del documento.";
  }
}
