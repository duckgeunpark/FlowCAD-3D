"""Spec repository (Repository pattern).

Abstracts *where* standard pipe/duct dimensions come from. The MVP ships an
in-memory implementation seeded from a table; swapping to Postgres later means
writing one new subclass — no caller changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..domain.enums import DuctShape


@dataclass(frozen=True, slots=True)
class PipeSpec:
    """Standard pipe dimension resolved from nominal size + schedule."""

    nominal: str
    schedule: str
    outer_diameter: float
    wall_thickness: float

    @property
    def bend_radius(self) -> float:
        """Long-radius elbow centerline radius (1.5 x OD is the common default)."""
        return self.outer_diameter * 1.5


class SpecNotFoundError(LookupError):
    """Raised when a requested spec is not present in the repository."""


class SpecRepository(ABC):
    """Read interface for standard component specs."""

    @abstractmethod
    def get_pipe(self, nominal: str, schedule: str) -> PipeSpec: ...


class InMemorySpecRepository(SpecRepository):
    """Seeded in-memory repository. Source of truth for the MVP."""

    def __init__(self, pipe_specs: list[PipeSpec] | None = None) -> None:
        specs = pipe_specs if pipe_specs is not None else _DEFAULT_PIPE_SPECS
        self._pipes: dict[tuple[str, str], PipeSpec] = {
            (s.nominal.upper(), s.schedule.upper()): s for s in specs
        }

    def get_pipe(self, nominal: str, schedule: str) -> PipeSpec:
        key = (nominal.strip().upper(), schedule.strip().upper())
        try:
            return self._pipes[key]
        except KeyError as exc:
            raise SpecNotFoundError(
                f"No pipe spec for nominal={nominal!r} schedule={schedule!r}"
            ) from exc


# --- Seed data (carbon steel, Sch40), OD/wall in mm. Extend freely. ----------
_DEFAULT_PIPE_SPECS: list[PipeSpec] = [
    PipeSpec("15A", "SCH40", 21.7, 2.8),
    PipeSpec("20A", "SCH40", 27.2, 2.9),
    PipeSpec("25A", "SCH40", 34.0, 3.4),
    PipeSpec("32A", "SCH40", 42.7, 3.6),
    PipeSpec("40A", "SCH40", 48.6, 3.7),
    PipeSpec("50A", "SCH40", 60.5, 3.9),
    PipeSpec("65A", "SCH40", 76.3, 5.2),
    PipeSpec("80A", "SCH40", 89.1, 5.5),
    PipeSpec("100A", "SCH40", 114.3, 6.0),
    PipeSpec("125A", "SCH40", 139.8, 6.6),
    PipeSpec("150A", "SCH40", 165.2, 7.1),
    PipeSpec("200A", "SCH40", 216.3, 8.2),
    PipeSpec("250A", "SCH40", 267.4, 9.3),
    PipeSpec("300A", "SCH40", 318.5, 10.3),
]


def default_round_section_for_duct(diameter: float) -> tuple[DuctShape, float]:
    """Helper for duct round sections (no schedule concept)."""
    return DuctShape.ROUND, diameter
