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


@dataclass(frozen=True, slots=True)
class DuctSpec:
    """Standard duct specification resolved from dimensions and material (BNPP HVAC STANDARD)."""

    material: str
    sheet_gauge: str
    stiffener_spec: str
    max_spacing: str
    material_spec: str
    turning_vanes_required: bool


class SpecNotFoundError(LookupError):
    """Raised when a requested spec is not present in the repository."""


class SpecRepository(ABC):
    """Read interface for standard component specs."""

    @abstractmethod
    def get_pipe(self, nominal: str, schedule: str) -> PipeSpec: ...

    @abstractmethod
    def get_duct(self, width: float, height: float, diameter: float, material: str) -> DuctSpec: ...


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

    def get_duct(self, width: float, height: float, diameter: float, material: str) -> DuctSpec:
        mat_norm = material.strip().lower()
        if "stainless" in mat_norm or "sts" in mat_norm or "sus" in mat_norm:
            mat_spec = "ASTM A240 Type 304/316 / KS D3698"
            mat_disp = "Stainless Steel"
        elif "carbon" in mat_norm or "cs" in mat_norm:
            mat_spec = "ASTM A36 / KS D3503"
            mat_disp = "Carbon Steel"
        else:
            mat_spec = "ASTM A653 / KS D3506"
            mat_disp = "Galvanized Steel"

        max_dim = max(width, height) if width > 0 else diameter
        if max_dim <= 0:
            max_dim = 400

        if max_dim <= 300:
            gauge = "22GA (0.85mm)"
            stiffener = "-"
            spacing = "-"
        elif max_dim <= 750:
            gauge = "20GA (1.0mm)"
            stiffener = "LK 1½\" x 1½\" x 3/16\""
            spacing = "1220mm (4'-0\")"
        elif max_dim <= 1500:
            gauge = "18GA (1.2mm)"
            stiffener = "LK 2\" x 2\" x 1/4\""
            spacing = "1220mm (4'-0\")"
        else:
            gauge = "16GA (1.6mm)"
            stiffener = "LK 2½\" x 2½\" x 1/4\""
            spacing = "610mm (2'-0\")"

        # Vanes required if rectangular elbow/fitting with sharp turns
        vanes = width > 0 and height > 0

        return DuctSpec(
            material=mat_disp,
            sheet_gauge=gauge,
            stiffener_spec=stiffener,
            max_spacing=spacing,
            material_spec=mat_spec,
            turning_vanes_required=vanes,
        )


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
