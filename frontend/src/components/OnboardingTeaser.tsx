"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket } from "lucide-react";

type Props = {
  onOpen: () => void;
};

export function OnboardingTeaser({ onOpen }: Props) {
  return (
    <Card className="ink-card bg-primary/10 border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle>Finish Setting Up Your Account</CardTitle>
            <CardDescription>
              Connect brokers and customize your workspace to get started.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button onClick={onOpen} className="w-full sm:w-auto">
          Continue Setup
        </Button>
      </CardContent>
    </Card>
  );
}