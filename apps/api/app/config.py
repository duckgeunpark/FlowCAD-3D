"""Application settings (env-overridable)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _csv_env(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    return [item.strip() for item in raw.split(",")] if raw else default


@dataclass(slots=True)
class Settings:
    app_name: str = "FlowCAD 3D API"
    cors_origins: list[str] = field(
        default_factory=lambda: _csv_env(
            "FLOWCAD_CORS_ORIGINS",
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ],
        )
    )
    cors_origin_regex: str | None = os.getenv(
        "FLOWCAD_CORS_ORIGIN_REGEX",
        r"http://.*:3000",
    )


settings = Settings()
