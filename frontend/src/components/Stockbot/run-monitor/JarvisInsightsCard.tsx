import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type JarvisInsightsCardProps = {
  aiModel: string;
  aiModelOptions: string[];
  setAiModel: (value: string) => void;
  aiUseMemory: boolean;
  toggleAiUseMemory: () => void;
  aiLoading: boolean;
  requestAiInsights: () => void;
  aiError: string | null;
  aiText: string;
};

export function JarvisInsightsCard({
  aiModel,
  aiModelOptions,
  setAiModel,
  aiUseMemory,
  toggleAiUseMemory,
  aiLoading,
  requestAiInsights,
  aiError,
  aiText,
}: JarvisInsightsCardProps) {
  const selectValue = aiModelOptions.includes(aiModel) ? aiModel : undefined;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">Jarvis Insights</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Select value={selectValue} onValueChange={setAiModel}>
            <SelectTrigger className="h-8 w-[200px] text-xs" disabled={!aiModelOptions.length}>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {aiModelOptions.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant={aiUseMemory ? "default" : "outline"} onClick={toggleAiUseMemory}>
            Memory {aiUseMemory ? "On" : "Off"}
          </Button>
          <Button size="sm" onClick={requestAiInsights} disabled={aiLoading}>
            {aiLoading ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>
      {aiError && (
        <Alert variant="destructive">
          <AlertTitle>askJarvisLite error</AlertTitle>
          <AlertDescription>{aiError}</AlertDescription>
        </Alert>
      )}
      {aiText ? (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiText}</ReactMarkdown>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Jarvis can draft a summary once enough metrics are available. Select a model, optionally enable memory, and click
          Generate.
        </div>
      )}
    </Card>
  );
}
