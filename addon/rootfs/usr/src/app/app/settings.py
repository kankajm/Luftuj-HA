"""Configuration helpers for the Luftujha add-on."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os


DATA_PATH = Path("/data/options.json")
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

load_dotenv(dotenv_path=ENV_PATH, override=False)


class Options(BaseModel):
    """Representation of available add-on options."""

    log_level: str = Field(default="info")
    ha_base_url: Optional[str] = None
    ha_token: Optional[str] = None


@lru_cache(maxsize=1)
def get_options() -> Options:
    """Load options from `/data/options.json`."""

    if not DATA_PATH.exists():
        return Options()

    return Options.model_validate_json(DATA_PATH.read_text(encoding="utf-8"))


def get_log_level() -> str:
    """Return the configured log level."""

    return get_options().log_level


def get_ha_base_url() -> Optional[str]:
    """Return Home Assistant base URL from options or environment."""

    return get_options().ha_base_url or os.getenv("HA_BASE_URL")


def get_ha_token() -> Optional[str]:
    """Return Home Assistant token from options or environment."""

    return get_options().ha_token or os.getenv("HA_TOKEN") or os.getenv("SUPERVISOR_TOKEN")
