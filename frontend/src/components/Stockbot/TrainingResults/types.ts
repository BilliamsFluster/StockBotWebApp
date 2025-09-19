export type TBTags = { scalars: string[]; histograms: string[] };

export type TBPoint = { step: number; wall_time: number; value: number };

export type GradMatrix = {
  layers: string[];
  steps: number[];
  values: Array<Array<number | null>>;
};

export type SeedAggregates = {
  metrics?: Record<string, { median: number; q1: number; q3: number }>;
  entropy?: Array<{ step: number; median: number; q1: number; q3: number }>;
  actionHist?: Array<{ mid: number; median: number; err: [number, number] }>;
};
