export type OptionType = "call" | "put";

export type FlowSide = "bullish" | "bearish" | "neutral";
export type FlowEventType = "sweep" | "block" | "large" | "unusual";

export interface FlowEvent {
  id: string;
  underlying: string;
  symbol: string;
  expiration: string;
  strike: number;
  option_type: OptionType;
  side: FlowSide;
  event_type: FlowEventType;
  premium: number;
  size: number;
  price: number;
  underlying_price: number;
  iv: number | null;
  timestamp: string;
  note: string | null;
}

export interface GEXLevel {
  strike: number;
  call_gex: number;
  put_gex: number;
  net_gex: number;
  call_oi: number;
  put_oi: number;
  net_dex: number;
}

export interface GEXProfile {
  underlying: string;
  underlying_price: number;
  timestamp: string;
  levels: GEXLevel[];
  total_gex: number;
  total_dex: number;
  total_vex: number;
  total_vanna: number;
  total_charm: number;
  gamma_flip: number | null;
  largest_call_wall: number | null;
  largest_put_wall: number | null;
  dealer_state: string;
}

export interface IVSummary {
  underlying: string;
  timestamp: string;
  atm_iv: number | null;
  iv_30d: number | null;
  iv_rank: number | null;
  iv_percentile: number | null;
  realized_vol_20d: number | null;
  skew_25d: number | null;
  term_structure: Record<string, number>;
  state: string;
}

export interface KeyLevel {
  price: number;
  label: string;
  kind: string;
  strength: number;
  note: string | null;
}

export interface RegimeClassification {
  underlying: string;
  timestamp: string;
  regime: string;
  confidence: number;
  intraday_bias: string;
  daily_bias: string;
  weekly_bias: string;
  volatility_state: string;
  expected_move_1d: number | null;
  expected_move_1w: number | null;
  sentiment_score: number;
  gamma_squeeze_risk: number;
  mean_reversion_score: number;
  trend_continuation_score: number;
  notes: string[];
}

export interface TerminalSnapshot {
  underlying: string;
  underlying_price: number;
  timestamp: string;
  regime: RegimeClassification | null;
  gex: GEXProfile | null;
  iv: IVSummary | null;
  key_levels: KeyLevel[];
  recent_flow: FlowEvent[];
  commentary: string | null;
}
