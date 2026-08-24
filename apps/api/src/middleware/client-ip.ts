import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export function createClientIpResolver(trustedProxyHops: number) {
  return (context: Context) => {
    const remote = readRemoteAddress(context);
    return resolveClientIp(remote, context.req.header("x-forwarded-for"), trustedProxyHops);
  };
}

export function resolveClientIp(
  remoteAddress: string,
  forwardedFor: string | undefined,
  trustedProxyHops: number
) {
  const remote = isIP(remoteAddress) ? remoteAddress : "unknown";
  if (trustedProxyHops <= 0) return remote;

  const forwarded = (forwardedFor ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const chain = [...forwarded, remote];
  if (chain.length <= trustedProxyHops) return remote;
  const trustedHops = chain.slice(-trustedProxyHops);
  if (trustedHops.some((address) => !isIP(address))) return remote;
  const selected = chain.at(-(trustedProxyHops + 1));
  return selected && isIP(selected) ? selected : remote;
}

function readRemoteAddress(context: Context) {
  try {
    const address = getConnInfo(context).remote.address;
    return address && isIP(address) ? address : "unknown";
  } catch {
    return "unknown";
  }
}
