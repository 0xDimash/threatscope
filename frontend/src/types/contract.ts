export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type AssetKind =
  | 'scada' | 'server' | 'gateway' | 'district' | 'db' | 'service' | 'cctv' | 'external';

export interface Endpoint {
  ip: string | null;
  host: string | null;
  asset_id: string | null;
}

export interface SecurityEvent {
  id: string;
  ts: string;
  type: string;
  severity: Severity;
  src: Endpoint;
  dst: Endpoint;
  description: string | null;
  mitre: { tactic: string; technique_id: string; technique: string } | null;
  risk_delta: number | null;
  raw_source: string;
  meta: Record<string, unknown>;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  criticality: number;
  district: string | null;
  position: { x: number; y: number; z: number };
  ip?: string;
  tags: string[];
}

export interface Link {
  source: string;
  target: string;
  kind: 'network' | 'dependency' | 'dataflow';
}

export interface RiskState {
  asset_id: string;
  risk: number;
  state: 'ok' | 'elevated' | 'critical' | 'compromised';
  events_24h: number;
  last_event_ts: string | null;
  top_types: string[];
}

export type WsFrame =
  | { kind: 'event'; data: SecurityEvent }
  | { kind: 'risk'; data: RiskState }
  | { kind: 'state'; data: unknown };
