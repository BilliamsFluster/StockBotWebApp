import React from "react";

export function PanelBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full overflow-hidden bg-background"
      data-lenis-prevent
      data-lenis-prevent-wheel
      data-lenis-prevent-touch
    >
      <div className="h-full overflow-auto">
        <div className="training-panel-content space-y-4 p-4">{children}</div>
      </div>
    </div>
  );
}
