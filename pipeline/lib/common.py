"""Shared paths and config loading for the numbered pipeline scripts."""

import json
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "pipeline" / "config.yaml"
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

# Projected CRS for distances in Miami (UTM zone 17N, meters).
METRIC_CRS = "EPSG:32617"


def load_config():
    return yaml.safe_load(CONFIG_PATH.read_text())


def write_meta(path, **fields):
    """Write a small JSON sidecar describing how an output was produced."""
    meta = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **fields}
    Path(path).write_text(json.dumps(meta, indent=1, default=str))
    return meta
