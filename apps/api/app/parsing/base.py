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
    "reducer": ComponentKind.TRANSITION,
    "레듀샤": ComponentKind.TRANSITION,
    "레듀서": ComponentKind.TRANSITION,
    "트랜지션": ComponentKind.TRANSITION,
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

        Supports Plan_v2 'connect_to_seq' topological reference as well as 'joint_no'.
        """
        connect_to = str(row.get("connect_to_seq", "")).strip()
        jnos = self._parse_joint_nos(row)
        
        # 1. 명시적 조인트 번호(joint_no 또는 joint_nos의 첫 값) 확인 (있으면 좋고)
        explicit_joint = str(row.get("joint_no", "")).strip()
        if not explicit_joint and jnos and not jnos[0].startswith("sw_seq_"):
            explicit_joint = jnos[0]

        if explicit_joint and explicit_joint in positions_by_joint:
            previous = positions_by_joint[explicit_joint]
        elif connect_to and f"seq_{connect_to}" in positions_by_joint:
            # 2. 명시적 조인트가 없거나 미등록 상태면 connect_to_seq 기반 추적 (없으면 말고)
            previous = positions_by_joint[f"seq_{connect_to}"]

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

        if explicit_joint:
            positions_by_joint[explicit_joint] = position
        if jnos:
            for jn in jnos:
                positions_by_joint[jn] = position

        seq = str(row.get("seq", row.get("item_no", ""))).strip()
        if seq:
            positions_by_joint[f"seq_{seq}"] = position
        return position

    @staticmethod
    def _parse_joint_nos(row: Row) -> list[str]:
        val = row.get("joint_nos", row.get("joint_no", ""))
        connect_to = str(row.get("connect_to_seq", "")).strip()
        seq = str(row.get("seq", row.get("item_no", ""))).strip()
        
        results: list[str] = []
        if isinstance(val, list):
            results = [str(v).strip() for v in val if str(v).strip()]
        elif isinstance(val, str) and val:
            results = [s.strip() for s in val.split(",") if s.strip()]
            
        # Plan_v2 virtual joint stitching when explicit joint_nos are absent
        if not results and connect_to:
            results.append(f"sw_seq_{connect_to}")
            if seq:
                results.append(f"sw_seq_{seq}")
        return results

    def check_joint_compatibility(self, runs: list[Run]) -> list[dict[str, Any]]:
        """Design Rule Checking (DRC): verify if components sharing a joint have matching sections.

        Incorporates Plan_v2 catalog validation and section continuity check.
        """
        from ..engine.catalog import get_part_family

        joints_map: dict[str, list[tuple[Node, Run]]] = {}
        error_markers: list[dict[str, Any]] = []

        for run in runs:
            for node in run.nodes:
                # 1. Catalog family requirement validation
                sec = node.section or run.section
                family = get_part_family(node.fitting, sec.shape, self.mode.value)
                params_dict = {
                    "diameter": getattr(sec, "outer_diameter", None),
                    "width": getattr(sec, "width", None),
                    "height": getattr(sec, "height", None),
                    "length": getattr(node.metadata, "length_mm", 1000),
                }
                if not family.validate_params(params_dict):
                    error_markers.append({
                        "joint_no": node.metadata.joint_no or "UNKNOWN",
                        "position": node.position,
                        "desc": f"[{family.family_name}] 필수 파라미터 누락: {family.required_params}",
                    })

                # 2. Joint grouping
                jnos = node.metadata.joint_nos or ([node.metadata.joint_no] if node.metadata.joint_no else [])
                for jno in jnos:
                    if jno:
                        if jno not in joints_map:
                            joints_map[jno] = []
                        joints_map[jno].append((node, run))

        for jno, items in joints_map.items():
            if len(items) < 2:
                continue

            # Check if there's any fitting/transition at this joint
            has_fitting = any(node.fitting in (ComponentKind.TRANSITION, ComponentKind.TEE) for node, _ in items)
            if has_fitting:
                continue

            # Compare cross sections of connected items
            first_node, first_run = items[0]
            first_sec = first_node.section or first_run.section
            for node, run in items[1:]:
                sec = node.section or run.section
                mismatch = False
                desc = ""
                if first_sec.shape != sec.shape:
                    mismatch = True
                    desc = f"단면 형상 불일치: {first_sec.shape.value} vs {sec.shape.value} (피팅/트랜지션 누락)"
                elif first_sec.shape.value == "rectangular":
                    if abs(first_sec.width - sec.width) > 1e-3 or abs(first_sec.height - sec.height) > 1e-3:
                        mismatch = True
                        desc = f"덕트 치수 불일치: {first_sec.width}x{first_sec.height} vs {sec.width}x{sec.height}"
                elif first_sec.shape.value == "round":
                    if abs(first_sec.outer_diameter - sec.outer_diameter) > 1e-3:
                        mismatch = True
                        desc = f"관경 불일치: D{first_sec.outer_diameter} vs D{sec.outer_diameter}"

                if mismatch:
                    error_markers.append({
                        "joint_no": jno,
                        "position": node.position,
                        "desc": f"[조인트 {jno}] {desc}",
                    })
                    break  # One error marker per joint is sufficient

        return error_markers

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

