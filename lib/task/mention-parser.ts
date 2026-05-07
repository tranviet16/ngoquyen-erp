const MENTION_RE = /(?:^|[\s(\[{>])@([a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

export function extractMentions(body: string): string[] {
  if (!body) return [];
  const found = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    found.add(m[1].toLowerCase());
  }
  return [...found];
}
