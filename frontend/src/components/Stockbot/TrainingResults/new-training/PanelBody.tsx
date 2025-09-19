import React from "react";

export function PanelBody({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto space-y-4 p-4">{children}</div>;
}
