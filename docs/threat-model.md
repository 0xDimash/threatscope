# Threat model & classification

**Status:** draft v0.1 — owned by Cyber A. Describes the *security meaning* of the data that
`docs/api-contract.md` only describes *structurally*. If the two disagree, the contract wins
and this file is wrong.

## Scope of this phase

Implemented: mapping a raw source event to a contract `type`, a `severity`, an optional MITRE
ATT&CK technique, and a `risk_delta` — for Zeek `notice.log` and Suricata `eve.json` alerts.
Also implemented: resolving event endpoints to inventory assets (`backend/app/services/mapping.py`).

Not implemented yet: risk accumulation and `RiskState`, correlation into incidents/kill-chain
progress. Those live in `backend/app/services` and are tracked separately.

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

## Suricata `eve.json` mapping

Implemented in `backend/app/ingest/suricata.py`. Suricata writes NDJSON, one record per line;
only records with an `alert` object become events. `flow`, `dns`, `http` and `stats` records
describe traffic rather than a detection, so they are skipped — mapping them would flood the
timeline with noise.

**Rule level → severity.** Suricata's numeric `alert.severity` is 1 (most severe) to 255:

| `alert.severity` | Contract severity | Rationale |
|---|---|---|
| 1 | `high` | The rule author's worst level, but one IDS alert is not a confirmed compromise — never promoted to `critical` by the adapter. |
| 2 | `medium` | |
| 3 | `low` | |
| ≥ 4, absent, unparseable | `info` | Context only; must not inflate risk. |

**Category → type.** Matching is case-insensitive on `alert.category`; anything unknown
degrades to `other`.

| `alert.category` | Contract `type` |
|---|---|
| Detection of a Network Scan | `port_scan` |
| Attempted Recon | `recon` |
| Web Application Attack, Exploit Kit Activity Detected | `web_attack` |
| Attempted / Successful Administrator Privilege Gain | `credential_attack` |
| Attempted / Successful User Privilege Gain | `credential_attack` |
| Attempted Credential Theft, Credential Theft | `credential_attack` |
| Attempted / Denial of Service | `ddos` |
| A Network Trojan was Detected, Targeted Malicious Activity was Detected | `malware` |
| Command and Control, Malware Command and Control Activity Detected | `c2_beacon` |
| Attempted Information Leak, Information Leak | `data_exfiltration` |
| Potential Corporate Privacy Violation | `policy_violation` |
| Misc activity, Potentially Bad Traffic, Generic Protocol Command Decode, Unusual Client Port, Unknown Traffic | `anomaly` |

**ATT&CK attribution.** The rule's own `alert.metadata` wins when present: `mitre_technique_id`,
`mitre_technique_name` and `mitre_tactic_name` (Suricata ships these as single-element lists).
Tactic names are normalised to the contract's kebab-case (`"Initial Access"` →
`initial-access`). Without rule metadata the type's default applies:

| Type | Technique | Tactic |
|---|---|---|
| `port_scan` | T1046 Network Service Discovery | discovery |
| `recon` | T1595 Active Scanning | reconnaissance |
| `credential_attack` | T1110 Brute Force | credential-access |
| `web_attack` | T1190 Exploit Public-Facing Application | initial-access |
| `c2_beacon` | T1071 Application Layer Protocol | command-and-control |
| `data_exfiltration` | T1041 Exfiltration Over C2 Channel | exfiltration |
| `malware` | T1204 User Execution | execution |
| `ddos` | T1498 Network Denial of Service | impact |

A rule that names a technique but no tactic gets `mitre: null`: the contract's MITRE object
requires all three fields, and inventing a tactic would be a false claim.

## Asset mapping

Implemented in `backend/app/services/mapping.py`, applied once in
`repository.add_events` before insert. Adapters stay pure: they emit IPs and host names, the
lookup turns them into `asset_id`s.

| Step | Rule |
|---|---|
| 1 | Exact `ip` match against an asset's `ip` wins. |
| 2 | Otherwise, `ip` inside a CIDR-valued asset (`10.30.0.0/16`). Exact matches are checked first, so a host address always beats a range. |
| 3 | Otherwise, `host` matched (case-insensitively, trailing dot ignored) against the asset id, the id without its `asset-` prefix, the display name, and the slugified display name — `egov-portal`, `Egov Portal`, `asset-egov-portal` all resolve to `asset-egov-portal`. |
| — | Unknown endpoints stay `null`. A guessed asset would draw the arc on the wrong building. |
| — | An `asset_id` already set by the adapter or the simulator is never overwritten: the producer knows more than the lookup does. |
| — | Duplicate IPs resolve deterministically to the lowest asset id, so two runs of the same capture agree. |

No fuzzy matching, no DNS: a wrong arc is worse than a missing one. If a source only knows
host names that the inventory does not carry, the fix is an inventory alias, not a heuristic.

## Data hygiene rules

- One malformed row must never drop a capture: rows with an unparseable `ts` are skipped.
- Zeek's `-` (unset) and `(empty)` tokens become `null`, never `""`.
- `src`/`dst` prefer the notice's own columns and fall back to the flow endpoints
  (`id.orig_h`/`id.resp_h`), because notice types differ in which columns they populate.
- Raw adapter extras (`note`, `uid`, `sub`, `proto`) go into `meta`, never into typed fields.
- Truncated or non-JSON `eve.json` lines are skipped, never raised: a bound capture can end
  mid-line, and that must not lose the alerts before it.
- Suricata `flow_id`, `signature_id`, `category`, `rev`, `proto`, `app_proto` go into `meta`
  so an analyst can pivot back to the raw record.

## Open questions

- Should a `critical` event clamp an asset to `compromised` immediately, or still go through
  accumulation? Needed before the risk engine is written.
- ATT&CK mapping for Suricata signatures: by `signature` prefix, `category`, or both?
