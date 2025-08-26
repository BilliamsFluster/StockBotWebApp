export type HighlightSection = { title: string; items: string[] };

export function parseHighlights(text: string): HighlightSection[] {
  return text
    .split(/\n\s*\n/)
    .map(block => {
      const rawLines = block.split("\n");
      if (!rawLines.length) return null;
      const [titleLine, ...rest] = rawLines;

      const items: string[] = [];
      let current = "";
      rest.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (/^[-*\u2022]\s*/.test(trimmed)) {
          if (current) items.push(current.trim());
          current = trimmed.replace(/^[-*\u2022]\s*/, "");
        } else {
          current += (current ? " " : "") + trimmed;
        }
      });
      if (current) items.push(current.trim());

      return { title: titleLine.trim(), items } as HighlightSection;
    })
    .filter(Boolean) as HighlightSection[];
}
