"""Input parsing strategy interface.

A *row* is a plain dict coming from CSV/Excel or the web table builder. Each
concrete strategy knows how to turn rows into a mode-specific :class:`Network`.
"""
from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Any

# Reject non-finite / absurd coordinates before they reach native CAD kernels
# (OpenCASCADE etc. can abort the process on NaN/Inf). 1e7 mm = 10 km.
_COORD_LIMIT = 1e7

from ..domain.components import Network
from ..domain.enums import ComponentKind, DesignMode
from ..domain.geometry import Vec3

Row = dict[str, Any]


class ParseError(ValueError):
    """Raised for malformed or incomplete input rows (carries the row index)."""

    def __init__(self, message: str, *, row_index: int | None = None) -> None:
        self.row_index = row_index
        prefix = f"[row {row_index}] " if row_index is not None else ""
        super().__init__(prefix + message)


# Accepted aliases so the table/CSV headers can be human friendly.
_FITTING_ALIASES: dict[str, ComponentKind] = {
    "": None,  # type: ignore[dict-item]  (None handled in helper below)
    "none": None,  # type: ignore[dict-item]
    "elbow": ComponentKind.ELBOW,
    "bend": ComponentKind.ELBOW,
    "tee": ComponentKind.TEE,
    "branch": ComponentKind.TEE,
    "valve": ComponentKind.VALVE,
    "damper": ComponentKind.DAMPER,
    "transition": ComponentKind.TRANSITION,
}

_DIRECTION_VECTORS: dict[str, Vec3] = {
    "e": Vec3(1, 0, 0),
    "east": Vec3(1, 0, 0),
    "x+": Vec3(1, 0, 0),
    "+x": Vec3(1, 0, 0),
    "w": Vec3(-1, 0, 0),
    "west": Vec3(-1, 0, 0),
    "x-": Vec3(-1, 0, 0),
    "-x": Vec3(-1, 0, 0),
    "n": Vec3(0, 1, 0),
    "north": Vec3(0, 1, 0),
    "y+": Vec3(0, 1, 0),
    "+y": Vec3(0, 1, 0),
    "s": Vec3(0, -1, 0),
    "south": Vec3(0, -1, 0),
    "y-": Vec3(0, -1, 0),
    "-y": Vec3(0, -1, 0),
    "u": Vec3(0, 0, 1),
    "up": Vec3(0, 0, 1),
    "z+": Vec3(0, 0, 1),
    "+z": Vec3(0, 0, 1),
    "d": Vec3(0, 0, -1),
    "down": Vec3(0, 0, -1),
    "z-": Vec3(0, 0, -1),
    "-z": Vec3(0, 0, -1),
}


def parse_fitting(value: Any) -> ComponentKind | None:
    """Map a free-text fitting cell to a :class:`ComponentKind` (or ``None``)."""
    key = str(value or "").strip().lower()
    if key in ("", "none"):
        return None
    if key not in _FITTING_ALIASES:
        raise ParseError(f"unknown fitting type {value!r}")
    return _FITTING_ALIASES[key]


class InputParser(ABC):
    """Strategy interface: rows -> Network."""

    mode: DesignMode

    @abstractmethod
    def parse(self, rows: list[Row]) -> Network: ...

    # -- shared helpers -------------------------------------------------------
    @staticmethod
    def _require(row: Row, key: str, index: int) -> Any:
        if key not in row or row[key] in (None, ""):
            raise ParseError(f"missing required field {key!r}", row_index=index)
        return row[key]

    @staticmethod
    def _seq_key(value: Any, fallback: int) -> float:
        """Sort key for the ``seq`` column; falls back to row order if unusable."""
        try:
            result = float(value)
        except (TypeError, ValueError):
            return float(fallback)
        return result if math.isfinite(result) else float(fallback)

    @staticmethod
    def _to_float(value: Any, field: str, index: int) -> float:
        try:
            result = float(value)
        except (TypeError, ValueError) as exc:
            raise ParseError(f"field {field!r} must be a number, got {value!r}",
                             row_index=index) from exc
        if not math.isfinite(result) or abs(result) > _COORD_LIMIT:
            raise ParseError(f"field {field!r} out of range: {value!r}",
                             row_index=index)
        return result

    def _position_for_row(
        self,
        row: Row,
        index: int,
        previous: Vec3 | None,
        positions_by_joint: dict[str, Vec3],
    ) -> Vec3:
        """Resolve either explicit x/y/z or drawing-style direction+length input.

        If a row repeats an existing ``joint_no``, it reuses that coordinate so
        separate rows/runs with the same joint number are treated as connected.
        Otherwise, when x/y/z are absent, the point is inferred from the
        previous point plus ``direction`` * ``length``. The first inferred point
        starts at the origin, optionally with ``elevation``/``z``.
        """
        joint_no = str(row.get("joint_no", "")).strip()
        if joint_no and joint_no in positions_by_joint:
            return positions_by_joint[joint_no]

        if self._has_explicit_xyz(row):
            position = Vec3(
                self._to_float(self._require(row, "x", index), "x", index),
                self._to_float(self._require(row, "y", index), "y", index),
                self._to_float(self._require(row, "z", index), "z", index),
            )
        elif previous is None:
            z_value = row.get("elevation", row.get("z", 0)) or 0
            position = Vec3(0.0, 0.0, self._to_float(z_value, "elevation", index))
        else:
            length = self._to_float(
                row.get("length", row.get("length_mm", 0)) or 0,
                "length",
                index,
            )
            direction = self._direction_vector(row.get("direction", row.get("dir", "E")), index)
            position = previous + direction.scaled(length)

        if joint_no:
            positions_by_joint[joint_no] = position
        return position

    @staticmethod
    def _has_explicit_xyz(row: Row) -> bool:
        return all(row.get(key) not in (None, "") for key in ("x", "y", "z"))

    @staticmethod
    def _direction_vector(value: Any, index: int) -> Vec3:
        raw = str(value or "E").strip().lower()
        key = raw.replace(" ", "")
        if key in _DIRECTION_VECTORS:
            return _DIRECTION_VECTORS[key]
        if "," in key:
            parts = key.split(",")
            if len(parts) == 3:
                try:
                    vector = Vec3(float(parts[0]), float(parts[1]), float(parts[2]))
                except ValueError as exc:
                    raise ParseError(f"invalid direction {value!r}", row_index=index) from exc
                length = vector.length()
                if length > 1e-9:
                    return vector.scaled(1 / length)
        raise ParseError(
            f"direction must be E/W/N/S/U/D or x,y,z vector, got {value!r}",
            row_index=index,
        )
