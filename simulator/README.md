# Simulator

Generates synthetic `SecurityEvent`s matching `docs/api-contract.md` and pushes them to the
backend. Used for demos, frontend development, and integration tests.

```bash
python3 simulator/simulate.py --rate 2                 # POST live feed
python3 simulator/simulate.py --stdout --count 20      # NDJSON to pipe anywhere
python3 simulator/simulate.py --duration 60 --rate 5   # 5 ev/s for a minute
```

No dependencies — stdlib only.
