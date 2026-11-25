"""Contract checks for scripted simulator scenarios.

Each scenario is a recorded attack that must replay deterministically and produce
contract-valid ``SecurityEvent`` objects, so the demo and the replay UI can rely on it.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from app.core.config import REPO_ROOT
from app.ingest.base import CONTRACT_KEYS, SEVERITIES
from app.schemas.contract import KILL_CHAIN_STAGES, SecurityEvent
from app.services.kill_chain import stage_for

SCENARIOS_DIR = REPO_ROOT / "simulator" / "scenarios"
ASSETS_FILE = REPO_ROOT / "data" / "assets.json"


def _load_simulator():
    spec = importlib.util.spec_from_file_location(
        "threatscope_simulator", REPO_ROOT / "simulator" / "simulate.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SIMULATOR = _load_simulator()


def scenario_files() -> list[Path]:
    if not SCENARIOS_DIR.exists():
        return []
    return sorted(SCENARIOS_DIR.glob("*.json"))


def asset_ids() -> set[str]:
    payload = json.loads(ASSETS_FILE.read_text(encoding="utf-8"))
    return {asset["id"] for asset in payload["assets"]}


SCENARIO_FILES = scenario_files()
ASSET_IDS = asset_ids()


@pytest.mark.parametrize("path", SCENARIO_FILES, ids=lambda p: p.stem)
def test_scenario_steps_build_contract_valid_events(path: Path) -> None:
    steps = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(steps, list)
    assert 40 <= len(steps) <= 60, f"{path.name}: expected 40-60 steps, got {len(steps)}"

    at_values = [float(step["at"]) for step in steps]
    assert at_values == sorted(at_values), f"{path.name}: steps must be sorted by 'at'"

    seen_ids: set[str] = set()
    for index, step in enumerate(steps):
        assert set(step) >= {
            "at",
            "type",
            "severity",
            "src",
            "dst_asset_id",
            "mitre",
            "description",
        }
        assert step["severity"] in SEVERITIES
        assert step["dst_asset_id"] in ASSET_IDS, (
            f"{path.name} step {index}: unknown dst {step['dst_asset_id']!r}"
        )
        assert isinstance(step["src"], dict)
        assert set(step["src"]) >= {"ip", "host", "asset_id"}
        assert isinstance(step["mitre"], dict)
        assert set(step["mitre"]) >= {"tactic", "technique_id", "technique"}

        event = SIMULATOR.build_scenario_event(path.stem, 1700000000, index, step)
        SecurityEvent.model_validate(event)
        assert tuple(event) == CONTRACT_KEYS
        assert set(event["src"]) == {"ip", "host", "asset_id"}
        assert set(event["dst"]) == {"ip", "host", "asset_id"}
        assert event["severity"] in SEVERITIES
        assert event["dst"]["asset_id"] == step["dst_asset_id"]
        assert event["id"].startswith(f"scn-{path.stem}-1700000000-{index}")
        assert event["id"] not in seen_ids
        seen_ids.add(event["id"])


@pytest.mark.parametrize("path", SCENARIO_FILES, ids=lambda p: p.stem)
def test_scenario_kill_chain_stages_appear_in_order(path: Path) -> None:
    steps = json.loads(path.read_text(encoding="utf-8"))
    seen: list[str] = []
    for step in steps:
        stage = stage_for(step["type"])
        assert stage is not None, f"{path.name}: unmapped type {step['type']!r}"
        if not seen or seen[-1] != stage:
            seen.append(stage)

    # The scenario must walk the kill chain forward without going backwards.
    positions = []
    for stage in seen:
        assert stage in KILL_CHAIN_STAGES
        positions.append(KILL_CHAIN_STAGES.index(stage))
    assert positions == sorted(positions), f"{path.name}: stages out of order: {seen}"
    assert positions[0] == 0, f"{path.name}: must start at reconnaissance"
    assert positions[-1] == len(KILL_CHAIN_STAGES) - 1, f"{path.name}: must reach impact"


def test_at_least_one_scenario_exists() -> None:
    assert SCENARIO_FILES, f"no scenario files found in {SCENARIOS_DIR}"