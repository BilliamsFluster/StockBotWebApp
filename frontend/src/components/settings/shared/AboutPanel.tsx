"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function AboutPanel() {
  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>Disclosures</CardTitle>
        <CardDescription>Important information about risks, data, and broker connectivity.</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="risk">
            <AccordionTrigger>Trading & Market Risk</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">Trading involves risk of loss. Backtested or simulated performance is hypothetical and may differ from live trading results.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="data">
            <AccordionTrigger>Data Sources & Latency</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">Quotes, fundamentals, and news are provided by third parties and may be delayed or inaccurate. Always verify critical information with your broker.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="broker">
            <AccordionTrigger>Broker Integrations</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">OAuth tokens/keys are stored securely per your backend configuration. Placing live orders requires explicit user action and an active broker connection.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="privacy">
            <AccordionTrigger>Privacy Mode</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">Privacy Mode masks sensitive values in the UI only. It does not scrub server logs or external integrations—configure those separately.</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Alert className="mt-4" variant="default">
          <Info className="h-4 w-4" />
          <AlertTitle>Reminder</AlertTitle>
          <AlertDescription>Review your jurisdiction’s regulations and your broker’s agreements before enabling live trading.</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
