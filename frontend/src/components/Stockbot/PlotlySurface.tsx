"use client";
import React from "react";

type Props = {
  x: number[];
  y: number[];
  z: number[][];
  height?: number;
  title?: string;
};

export default function PlotlySurface({ x, y, z, height = 420, title }: Props) {
  const ref = React.useRef<any>(null);
  const [Plot, setPlot] = React.useState<any>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: createPlotlyComponent }, Plotly] = await Promise.all([
          import("react-plotly.js/factory"),
          import("plotly.js-dist-min"), // full bundle incl. 3D surface
        ]);
        if (!cancelled) setPlot(() => createPlotlyComponent(Plotly as any));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  if (!Plot) return <div className="text-xs text-muted-foreground">Loading 3D renderer…</div>;

  return (
    <Plot
      ref={ref}
      data={[
        {
          type: "surface",
          x, y, z,
          colorscale: "RdBu",
          reversescale: true,
        },
      ]}
      layout={{
        autosize: true,
        height,
        title: title || undefined,
        scene: {
          xaxis: { title: "step" },
          yaxis: { title: "layer index" },
          zaxis: { title: "log10(norm)" },
        },
        margin: { l: 0, r: 0, t: title ? 30 : 10, b: 0 },
      }}
      config={{ displaylogo: false, responsive: true }}
      style={{ width: "100%", height }}
    />
  );
}
