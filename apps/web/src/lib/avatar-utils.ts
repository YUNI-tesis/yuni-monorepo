/**
 * Ready Player Me 2D render URL for thumbnails.
 * @see https://docs.readyplayer.me/ready-player-me/api-reference/rest-api/avatars/get-2d-avatars
 */
export function getReadyPlayerMeThumbnailUrl(
  glbUrl: string,
  options?: { size?: number; camera?: string }
): string {
  const base = glbUrl.replace(/\.glb$/i, "");
  const size = options?.size ?? 512;
  const camera = options?.camera ?? "portrait";
  return `${base}.png?size=${size}&camera=${camera}`;
}
