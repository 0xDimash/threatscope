# Simulator

Generates synthetic `SecurityEvent`s matching `docs/api-contract.md` and pushes them to the
backend. Used for demos, frontend development, and integration tests.

```bash
python3 simulator/simulate.py --rate 2                 # POST live feed
python3 simulator/simulate.py --stdout --count 20      # NDJSON to pipe anywhere
python3 simulator/simulate.py --duration 60 --rate 5   # 5 ev/s for a minute
```

No dependencies — stdlib only.

## Recorded demo scenario (defence safety net)

`demo_scenario.py` writes a fixed 60 s municipal intrusion (recon → phishing → C2 → lateral
movement → exfiltration → ransomware) with a fixed seed, base time and event ids, so the output
is byte-identical on every run. It needs no backend.

```bash
python3 simulator/demo_scenario.py --out simulator/scenarios/defence-demo.json \
  --out frontend/src/ui/demoScenario.json                  # regenerate both copies
python3 simulator/demo_scenario.py --check simulator/scenarios/defence-demo.json \
  --check frontend/src/ui/demoScenario.json                # exit 1 if either copy is stale
```

The frontend bundles `demoScenario.json`; open `/?replay=demo#/space/room` (add `&at=32` to start
paused at 32 s) or press **Demo** in the replay controls.
