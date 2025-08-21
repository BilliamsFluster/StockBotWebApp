// src/app/stockbot/page.tsx (or wherever your Page lives)
"use client";

import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Dashboard from "@/components/Stockbot/Dashboard";
import NewTraining from "@/components/Stockbot/NewTraining";
import NewBacktest from "@/components/Stockbot/NewBacktest";
import RunDetail from "@/components/Stockbot/RunDetail";
import CompareRuns from "@/components/Stockbot/CompareRuns";
import Settings from "@/components/Stockbot/Settings";

export default function Page() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="p-6 space-y-6">
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="w-full grid grid-cols-6 gap-2">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="new-training">New Training</TabsTrigger>
          <TabsTrigger value="new-backtest">New Backtest</TabsTrigger>
          <TabsTrigger value="run-detail">Run Detail</TabsTrigger>
          <TabsTrigger value="compare">Compare Runs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <Dashboard
            onNewTraining={() => setTab("new-training")}
            onNewBacktest={() => setTab("new-backtest")}
            // Keep the signature but ignore the id since RunDetail is upload-only now
            onOpenRun={(_id) => {
              setTab("run-detail");
            }}
          />
        </TabsContent>

        <TabsContent value="new-training">
          <NewTraining
            // Keep the callback for UX flow; no longer pass to RunDetail
            onJobCreated={(_id) => {
              setTab("run-detail");
            }}
            onCancel={() => setTab("dashboard")}
          />
        </TabsContent>

        <TabsContent value="new-backtest">
          <NewBacktest
            onJobCreated={(_id) => {
              setTab("run-detail");
            }}
            onCancel={() => setTab("dashboard")}
          />
        </TabsContent>

        <TabsContent value="run-detail">
          {/* RunDetail is now upload-only and takes no props */}
          <RunDetail />
        </TabsContent>

        <TabsContent value="compare">
          <CompareRuns />
        </TabsContent>

        <TabsContent value="settings">
          <Settings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
