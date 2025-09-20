export type PnlPoint = { t: number; cum: number; dd: number };
export type ExpoPoint = { t: number; gross: number };
export type SlipPoint = { t: number; slip: number; to: number };

export type TelemetryWorkerPayload = {
  pnlSeries: PnlPoint[];
  expoSeries: ExpoPoint[];
  slipSeries: SlipPoint[];
  isTerminal: boolean;
  maxLivePoints: number;
  maxTerminalPoints: number;
  reset?: boolean;
};

export type TelemetryWorkerRequest = {
  type: "PROCESS_SERIES";
  seq: number;
  payload: TelemetryWorkerPayload;
};

export type TelemetryWorkerResult = {
  pnl: PnlPoint[];
  expo: ExpoPoint[];
  slip: SlipPoint[];
  tMin: number;
  tMax: number;
};

export type TelemetryWorkerResponse = {
  type: "SERIES_READY";
  seq: number;
  payload: TelemetryWorkerResult;
};
