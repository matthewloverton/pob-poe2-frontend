// pobb.in / PoB "build code" = base64url (with underscore/dash) of zlib-deflated XML.

function base64urlToBytes(s: string): Uint8Array {
  const trimmed = s.trim().replace(/\s+/g, "");
  const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function decodeBuildCode(code: string): Promise<string> {
  const compressed = base64urlToBytes(code);
  const inflated = await inflate(compressed);
  return new TextDecoder("utf-8").decode(inflated);
}

export async function encodeBuildCode(xml: string): Promise<string> {
  const raw = new TextEncoder().encode(xml);
  const compressed = await deflate(raw);
  return bytesToBase64url(compressed);
}
