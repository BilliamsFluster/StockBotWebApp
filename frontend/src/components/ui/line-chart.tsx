"use client"

import * as React from "react"
import { LineChart as RechartsLineChart } from "recharts"
import type { LineChartProps as RechartsLineChartProps } from "recharts"

import { cn } from "@/lib/utils"

import { ChartConfig, ChartContainer } from "./chart"

const DEFAULT_CONFIG: ChartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--chart-1))",
  },
}

type LineChartProps = RechartsLineChartProps & {
  config?: ChartConfig
  className?: string
  height?: number | string
  style?: React.CSSProperties
}

const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(
  (
    {
      config = DEFAULT_CONFIG,
      className,
      height = 250,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const resolvedStyle = React.useMemo<React.CSSProperties>(() => {
      if (height === undefined || height === null) {
        return style || {}
      }

      return {
        ...(style || {}),
        height: typeof height === "number" ? `${height}px` : height,
      }
    }, [height, style])

    return (
      <ChartContainer
        ref={ref}
        config={config}
        className={cn("aspect-auto w-full", className)}
        style={resolvedStyle}
      >
        <RechartsLineChart {...props}>{children}</RechartsLineChart>
      </ChartContainer>
    )
  }
)
LineChart.displayName = "LineChart"

export { LineChart }
