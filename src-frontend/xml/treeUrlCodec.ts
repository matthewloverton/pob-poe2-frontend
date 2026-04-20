export interface DecodedTreeUrl {
  version: number;
  classId: number;
  ascendClassId: number;
  secondaryAscendClassId: number;
  nodes: number[];          // regular allocated node ids
  clusterNodes: number[];   // actual ids (we undo the -65536 offset on decode, re-apply on encode)
  masteryEffects: { effectId: number; nodeId: number }[];
}

const URL_PREFIX = /^.*\//;

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeTreeUrl(input: string): DecodedTreeUrl {
  if (!input) throw new Error("empty tree url");
  const payload = input.replace(URL_PREFIX, "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error("invalid base64url payload");

  const b = base64urlDecode(payload);
  if (b.length < 6) throw new Error("tree url payload too short");

  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const version = view.getUint32(0, false);
  const classId = view.getUint8(4);
  const ascByte = view.getUint8(5);
  const ascendClassId = ascByte & 0x3;
  const secondaryAscendClassId = (ascByte >> 2) & 0x3;

  const result: DecodedTreeUrl = {
    version, classId, ascendClassId, secondaryAscendClassId,
    nodes: [], clusterNodes: [], masteryEffects: [],
  };

  let cursor = 6;
  if (version >= 5 && cursor < b.length) {
    const nodeCount = view.getUint8(cursor); cursor += 1;
    for (let i = 0; i < nodeCount; i++) {
      if (cursor + 2 > b.length) throw new Error("truncated regular nodes");
      result.nodes.push(view.getUint16(cursor, false));
      cursor += 2;
    }
    if (cursor < b.length) {
      const clusterCount = view.getUint8(cursor); cursor += 1;
      for (let i = 0; i < clusterCount; i++) {
        if (cursor + 2 > b.length) throw new Error("truncated cluster nodes");
        result.clusterNodes.push(view.getUint16(cursor, false) + 65536);
        cursor += 2;
      }
    }
  }
  if (version >= 6 && cursor < b.length) {
    const masteryCount = view.getUint8(cursor); cursor += 1;
    for (let i = 0; i < masteryCount; i++) {
      if (cursor + 4 > b.length) throw new Error("truncated mastery effects");
      const effectId = view.getUint16(cursor, false);
      const nodeId = view.getUint16(cursor + 2, false);
      result.masteryEffects.push({ effectId, nodeId });
      cursor += 4;
    }
  }

  return result;
}

export function encodeTreeUrl(d: DecodedTreeUrl): string {
  const nodeBytes = d.nodes.length * 2;
  const clusterBytes = d.clusterNodes.length * 2;
  const masteryBytes = d.masteryEffects.length * 4;
  const total = 6 + 1 + nodeBytes + 1 + clusterBytes + 1 + masteryBytes;

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 6, false); // always emit v6
  view.setUint8(4, d.classId);
  view.setUint8(5, ((d.secondaryAscendClassId & 0x3) << 2) | (d.ascendClassId & 0x3));

  let cursor = 6;
  view.setUint8(cursor, d.nodes.length); cursor += 1;
  for (const id of d.nodes) {
    view.setUint16(cursor, id, false);
    cursor += 2;
  }
  view.setUint8(cursor, d.clusterNodes.length); cursor += 1;
  for (const id of d.clusterNodes) {
    view.setUint16(cursor, id - 65536, false);
    cursor += 2;
  }
  view.setUint8(cursor, d.masteryEffects.length); cursor += 1;
  for (const m of d.masteryEffects) {
    view.setUint16(cursor, m.effectId, false);
    view.setUint16(cursor + 2, m.nodeId, false);
    cursor += 4;
  }

  return base64urlEncode(bytes);
}
