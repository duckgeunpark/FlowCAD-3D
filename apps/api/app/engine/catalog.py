"""Parametric Part Catalog and Port Definitions (Plan_v2).

Pre-defines standard component families, required parameters, and port connection rules.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..domain.enums import ComponentKind, DuctShape


@dataclass(slots=True)
class PortDefinition:
    name: str  # e.g., 'start', 'end', 'in', 'out', 'branch'
    shape_type: str  # 'round', 'rect', or 'mixed'
    direction_ref: tuple[float, float, float]  # Local direction vector


@dataclass(slots=True)
class PartFamily:
    family_code: str
    system_type: str  # 'pipe' or 'duct'
    family_name: str
    shape_type: str
    port_count: int
    required_params: list[str]
    ports: list[PortDefinition]

    def validate_params(self, params: dict[str, Any]) -> bool:
        """Verify if all required physical parameters are present."""
        return all(key in params and params[key] not in (None, "") for key in self.required_params)


# Pre-configured Library Catalog based on Plan_v2 specifications
PART_CATALOG: dict[str, PartFamily] = {
    # Pipe Families
    "P_STRAIGHT": PartFamily(
        family_code="P_STRAIGHT",
        system_type="pipe",
        family_name="직관",
        shape_type="round",
        port_count=2,
        required_params=["diameter", "length"],
        ports=[
            PortDefinition("start", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("end", "round", (1.0, 0.0, 0.0)),
        ],
    ),
    "P_ELBOW_45": PartFamily(
        family_code="P_ELBOW_45",
        system_type="pipe",
        family_name="엘보 45도",
        shape_type="round",
        port_count=2,
        required_params=["diameter"],
        ports=[
            PortDefinition("in", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "round", (0.707, 0.707, 0.0)),
        ],
    ),
    "P_ELBOW_90": PartFamily(
        family_code="P_ELBOW_90",
        system_type="pipe",
        family_name="엘보 90도",
        shape_type="round",
        port_count=2,
        required_params=["diameter"],
        ports=[
            PortDefinition("in", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "round", (0.0, 1.0, 0.0)),
        ],
    ),
    "P_TEE": PartFamily(
        family_code="P_TEE",
        system_type="pipe",
        family_name="티",
        shape_type="round",
        port_count=3,
        required_params=["diameter"],
        ports=[
            PortDefinition("in", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "round", (1.0, 0.0, 0.0)),
            PortDefinition("branch", "round", (0.0, 1.0, 0.0)),
        ],
    ),
    "P_REDUCER": PartFamily(
        family_code="P_REDUCER",
        system_type="pipe",
        family_name="레듀서",
        shape_type="round",
        port_count=2,
        required_params=["diameter"],
        ports=[
            PortDefinition("in", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "round", (1.0, 0.0, 0.0)),
        ],
    ),
    "P_VALVE": PartFamily(
        family_code="P_VALVE",
        system_type="pipe",
        family_name="밸브",
        shape_type="round",
        port_count=2,
        required_params=["diameter"],
        ports=[
            PortDefinition("in", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "round", (1.0, 0.0, 0.0)),
        ],
    ),

    # Duct Families
    "D_STRAIGHT_RECT": PartFamily(
        family_code="D_STRAIGHT_RECT",
        system_type="duct",
        family_name="사각 직관",
        shape_type="rect",
        port_count=2,
        required_params=["width", "height", "length"],
        ports=[
            PortDefinition("start", "rect", (-1.0, 0.0, 0.0)),
            PortDefinition("end", "rect", (1.0, 0.0, 0.0)),
        ],
    ),
    "D_ELBOW_RECT_90": PartFamily(
        family_code="D_ELBOW_RECT_90",
        system_type="duct",
        family_name="사각 엘보 90도",
        shape_type="rect",
        port_count=2,
        required_params=["width", "height"],
        ports=[
            PortDefinition("in", "rect", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "rect", (0.0, 1.0, 0.0)),
        ],
    ),
    "D_TEE_RECT": PartFamily(
        family_code="D_TEE_RECT",
        system_type="duct",
        family_name="사각 티",
        shape_type="rect",
        port_count=3,
        required_params=["width", "height"],
        ports=[
            PortDefinition("in", "rect", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "rect", (1.0, 0.0, 0.0)),
            PortDefinition("branch", "rect", (0.0, 1.0, 0.0)),
        ],
    ),
    "D_TRANSITION_RECT": PartFamily(
        family_code="D_TRANSITION_RECT",
        system_type="duct",
        family_name="사각 변환관",
        shape_type="rect",
        port_count=2,
        required_params=["width", "height"],
        ports=[
            PortDefinition("in", "rect", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "rect", (1.0, 0.0, 0.0)),
        ],
    ),
    "D_STRAIGHT_ROUND": PartFamily(
        family_code="D_STRAIGHT_ROUND",
        system_type="duct",
        family_name="원형 직관",
        shape_type="round",
        port_count=2,
        required_params=["diameter", "length"],
        ports=[
            PortDefinition("start", "round", (-1.0, 0.0, 0.0)),
            PortDefinition("end", "round", (1.0, 0.0, 0.0)),
        ],
    ),
    "D_TRANSITION_R2RECT": PartFamily(
        family_code="D_TRANSITION_R2RECT",
        system_type="duct",
        family_name="원사각 변환관",
        shape_type="mixed",
        port_count=2,
        required_params=["width", "height", "diameter"],
        ports=[
            PortDefinition("in", "rect", (-1.0, 0.0, 0.0)),
            PortDefinition("out", "round", (1.0, 0.0, 0.0)),
        ],
    ),
}


def get_part_family(kind: ComponentKind | None, shape: DuctShape, mode: str) -> PartFamily:
    """Resolve the canonical PartFamily for a given component configuration."""
    is_round = shape is DuctShape.ROUND
    if mode == "pipe":
        if kind is ComponentKind.ELBOW:
            return PART_CATALOG["P_ELBOW_90"]
        if kind is ComponentKind.TEE:
            return PART_CATALOG["P_TEE"]
        if kind is ComponentKind.TRANSITION:
            return PART_CATALOG["P_REDUCER"]
        if kind is ComponentKind.VALVE:
            return PART_CATALOG["P_VALVE"]
        return PART_CATALOG["P_STRAIGHT"]

    # Duct mode
    if is_round:
        if kind is ComponentKind.TRANSITION:
            return PART_CATALOG["D_TRANSITION_R2RECT"]
        return PART_CATALOG["D_STRAIGHT_ROUND"]

    if kind is ComponentKind.ELBOW:
        return PART_CATALOG["D_ELBOW_RECT_90"]
    if kind is ComponentKind.TEE:
        return PART_CATALOG["D_TEE_RECT"]
    if kind is ComponentKind.TRANSITION:
        return PART_CATALOG["D_TRANSITION_RECT"]
    return PART_CATALOG["D_STRAIGHT_RECT"]
