type Sig = { mime: string; bytes: number[]; offset?: number };

const SIGNATURES: Sig[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // ZIP container — covers application/zip, xlsx, docx
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x07, 0x08] },
];

const ZIP_BACKED = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function matches(buf: Buffer, sig: Sig): boolean {
  const off = sig.offset ?? 0;
  if (buf.length < off + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buf[off + i] !== sig.bytes[i]) return false;
  }
  return true;
}

export function detectMagicMime(buf: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (matches(buf, sig)) return sig.mime;
  }
  return null;
}

export function validateMagicBytes(buf: Buffer, claimedMime: string): boolean {
  const detected = detectMagicMime(buf);
  if (!detected) return false;
  if (detected === claimedMime) return true;
  // Office formats are zip-based; accept if both detected and claimed are zip-family.
  if (detected === "application/zip" && ZIP_BACKED.has(claimedMime)) return true;
  return false;
}
