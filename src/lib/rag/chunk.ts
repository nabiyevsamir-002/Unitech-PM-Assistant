// Splits a document into overlapping, embedding-sized chunks. Prefers paragraph
// boundaries, then packs paragraphs into ~CHUNK_SIZE windows with a small
// overlap so context isn't lost across a split.

const CHUNK_SIZE = 800; // characters
const OVERLAP = 120;
const MAX_CHUNKS = 100; // safety cap for very large pastes

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paras = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const packed: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > CHUNK_SIZE) {
      packed.push(buf);
      buf = buf.slice(-OVERLAP) + "\n\n" + p; // carry a little context forward
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) packed.push(buf);

  // Hard-split any oversized chunk (e.g. one giant paragraph).
  const out: string[] = [];
  for (const c of packed) {
    if (c.length <= CHUNK_SIZE * 1.5) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += CHUNK_SIZE - OVERLAP) {
      out.push(c.slice(i, i + CHUNK_SIZE));
    }
  }
  return out.slice(0, MAX_CHUNKS);
}
