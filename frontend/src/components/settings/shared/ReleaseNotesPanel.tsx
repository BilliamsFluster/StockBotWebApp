"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Download } from "lucide-react";
import { APP, RELEASE_NOTES } from "../lib/config";

export function ReleaseNotesPanel() {
  const downloadReleaseNotes = () => {
    const md = `# Release Notes v${APP.version} (${APP.buildDate})\n- New: Brokers page with connection tools and status.\n- New: Overview page with StockBot performance tiles.\n- Improved: True-black theme & animated background blobs.\n- Fix: Order ticket validation edge cases.\n\n## Previous\n${RELEASE_NOTES.map(n=>`### v${n.version} — ${n.date}\n${n.items.map(i=>`- ${i}`).join("\n")}`).join("\n\n")}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RELEASE_NOTES_v${APP.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Release Notes</CardTitle>
        <CardDescription>What’s new and what changed.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 rounded-md bg-background/50 p-3">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Badge>Latest</Badge>
                <span className="font-medium">v{APP.version}</span>
                <span className="text-muted-foreground text-xs">{APP.buildDate}</span>
              </div>
              <ul className="mt-2 list-disc pl-5 text-sm">
                <li>New: Brokers page with connection tools and status.</li>
                <li>New: Overview page with StockBot performance tiles.</li>
                <li>Improved: True-black theme & animated background blobs.</li>
                <li>Fix: Order ticket validation edge cases.</li>
              </ul>
            </div>
            {RELEASE_NOTES.map((n) => (
              <div key={n.version}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{n.version}</span>
                  <span className="text-muted-foreground text-xs">{n.date}</span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {n.items.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={downloadReleaseNotes}><Download className="mr-2 h-4 w-4" /> Download .md</Button>
      </CardFooter>
    </Card>
  );
}
