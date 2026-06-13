export function createWordBoundaryRegex(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

export function mergeTagArrays(...arrays: string[][]): string[] {
  return [...new Set(arrays.flat())];
}
