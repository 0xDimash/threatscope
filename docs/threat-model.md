# Threat model & classification

**Status:** draft v0.1 — owned by Cyber A. Describes the *security meaning* of the data that
`docs/api-contract.md` only describes *structurally*. If the two disagree, the contract wins
and this file is wrong.

## Scope of this phase

Implemented: mapping a raw source event to a contract `type`, a `severity`, an optional MITRE
ATT&CK technique, and a `risk_delta`.

Not implemented yet: asset mapping (IP/host → `Asset`), risk accumulation and `RiskState`,
correlation into incidents/kill-chain progress. Those live in `backend/app/services` and are
tracked separately.

## Severity scale

Severity answers "how much does this single event matter for the asset it hit". It is a
property of the event, not of the asset — criticality weighting happens in the risk engine.

| Severity | Meaning | `risk_delta` |
|---|---|---:|
| `info` | Context only: captured for the timeline, no defensive action implied. | 0.0 |
| `low` | Weak signal or a single failed attempt; expected background noise. | 1.0 |
| `medium` | Successful-looking or repeated activity against one target. | 4.0 |
| `high` | Credible attempt to gain access, execute code, or establish a channel. | 10.0 |
| `critical` | Confirmed compromise or destructive impact (ransomware, exfiltration). | 25.0 |

`risk_delta` is a contribution on the contract's 0..100 risk scale, before asset-criticality
weighting. Values are intentionally spaced so that a few `high` events cannot alone saturate an
asset, while a `critical` event is visible immediately.

## Zeek `notice.log` mapping

Implemented in `backend/app/ingest/zeek.py` (`NOTICE_RULES`). Matching is by **prefix**,
longest prefix first, so `HTTP::SQL_Injection_Victim` matches `HTTP::SQL_Injection`.

| Zeek notice prefix | Contract `type` | Severity | ATT&CK | Tactic |
|---|---|---|---|---|
| `Scan::Port_Scan` | `port_scan` | medium | T1046 Network Service Discovery | discovery |
| `Scan::VulnerabilityScan` | `recon` | medium | T1595 Active Scanning | reconnaissance |
| `Scan::Address_Scan` | `recon` | low | T1595 Active Scanning | reconnaissance |
| `SSH::Password_Guessing` | `credential_attack` | high | T1110 Brute Force | credential-access |
| `SSH::Bruteforce` | `credential_attack` | high | T1110 Brute Force | credential-access |
| `HTTP::SQL_Injection` | `web_attack` | high | T1190 Exploit Public-Facing Application | initial-access |
| `HTTP::Directory_Traversal` | `web_attack` | medium | T1083 File and Directory Discovery | discovery |
| `C2::` | `c2_beacon` | high | T1071 Application Layer Protocol | command-and-control |
| `DNS::Tunnel` | `c2_beacon` | high | T1071 Application Layer Protocol | command-and-control |
| `Policy::` | `policy_violation` | low | — | — |
| `Weird::` | `anomaly` | low | — | — |
| `CaptureLoss::` | `anomaly` | info | — | — |

Unmapped notices become `type: "other"`, `severity: "info"`, `mitre: null`, `risk_delta: 0.0`.
Rationale: an unrecognised notice must never inflate an asset's risk, and the frontend is
required to render `other` gracefully. Add a row here and in `NOTICE_RULES` together.

## Data hygiene rules

- One malformed row must never drop a capture: rows with an unparseable `ts` are skipped.
- Zeek's `-` (unset) and `(empty)` tokens become `null`, never `""`.
- `src`/`dst` prefer the notice's own columns and fall back to the flow endpoints
  (`id.orig_h`/`id.resp_h`), because notice types differ in which columns they populate.
- Raw adapter extras (`note`, `uid`, `sub`, `proto`) go into `meta`, never into typed fields.

## Open questions

- Should a `critical` event clamp an asset to `compromised` immediately, or still go through
  accumulation? Needed before the risk engine is written.
- ATT&CK mapping for Suricata signatures: by `signature` prefix, `category`, or both?
