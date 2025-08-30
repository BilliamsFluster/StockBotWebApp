import { useEffect, useState } from "react";
import { getMarketHighlights } from "@/api/stockbot";
import { parseHighlights, HighlightSection } from "../lib";

interface Highlights {
  marketHighlights?: HighlightSection;
  relevantEvents?: HighlightSection;
  calendarEvents?: HighlightSection;
}

export function useMarketHighlights() {
  const [sections, setSections] = useState<Highlights>({});

  useEffect(() => {
    (async () => {
      try {
        const { highlights } = await getMarketHighlights();
        const parsed = parseHighlights(highlights);
        setSections({
          marketHighlights: parsed.find(s => /market/i.test(s.title)),
          relevantEvents: parsed.find(s => /relevant/i.test(s.title)),
          calendarEvents: parsed.find(s => /calendar/i.test(s.title)),
        });
      } catch (e) {
        console.error("Failed to load highlights", e);
      }
    })();
  }, []);

  return sections;
}
