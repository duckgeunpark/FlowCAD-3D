"""SceneBuilder (Builder pattern): incrementally assemble a SceneDocument.

Tracks the running bounding box and BOM as elements are added, then produces an
immutable-ish :class:`SceneDocument` on :meth:`build`.
"""
from __future__ import annotations

import math

from ..domain.enums import ComponentKind
from ..domain.geometry import Vec3
from ..domain.scene import BomRow, Diagnostic, SceneDocument, SceneElement


class SceneBuilder:
    def __init__(self) -> None:
        self._elements: list[SceneElement] = []
        self._bom: list[BomRow] = []
        self._diagnostics: list[Diagnostic] = []
        self._min = [math.inf, math.inf, math.inf]
        self._max = [-math.inf, -math.inf, -math.inf]
        self._item_counter = 0

    def add_diagnostics(self, diagnostics: list[Diagnostic]) -> "SceneBuilder":
        self._diagnostics.extend(diagnostics)
        return self

    def add(self, element: SceneElement) -> "SceneBuilder":
        if not element.item_no:
            self._item_counter += 1
            element.item_no = f"FC-{self._item_counter:03d}"
        element.user_data["itemNo"] = element.item_no
        self._elements.append(element)
        self._extend_bounds(element)
        self._bom.append(self._bom_row(element))
        return self

    def build(self) -> SceneDocument:
        if not self._elements:
            return SceneDocument(diagnostics=self._diagnostics)
        self._resolve_open_joints()
        return SceneDocument(
            units="mm",
            bounds_min=Vec3(*self._min),
            bounds_max=Vec3(*self._max),
            elements=self._elements,
            bom=self._bom,
            diagnostics=self._diagnostics,
        )

    # -- internals ------------------------------------------------------------
    def _extend_bounds(self, element: SceneElement) -> None:
        for point in self._points_of(element):
            for i in range(3):
                self._min[i] = min(self._min[i], point[i])
                self._max[i] = max(self._max[i], point[i])

    @staticmethod
    def _points_of(element: SceneElement) -> list[list[float]]:
        params = element.params
        points: list[list[float]] = []
        for key in ("start", "end", "position"):
            value = params.get(key)
            if isinstance(value, list):
                points.append([float(v) for v in value])
        return points

    @staticmethod
    def _bom_row(element: SceneElement) -> BomRow:
        ud = element.user_data
        length = float(ud.get("length_mm", 0.0) or 0.0)
        joint_nos = ", ".join(j.no for j in element.joints)
        return BomRow(
            element_id=element.id,
            item_no=element.item_no,
            joint_no=ud.get("jointNo", ""),
            joint_nos=joint_nos,
            fitting_no=ud.get("fittingNo", ""),
            drawing_no=ud.get("drawingNo", ""),
            description=_DESCRIPTIONS.get(element.kind, element.kind.value),
            spec=ud.get("spec", ""),
            length_mm=length,
        )

    def _resolve_open_joints(self) -> None:
        counts: dict[str, int] = {}
        for element in self._elements:
            for joint in element.joints:
                counts[joint.no] = counts.get(joint.no, 0) + 1
        for element in self._elements:
            for joint in element.joints:
                joint.open = counts.get(joint.no, 0) == 1


_DESCRIPTIONS: dict[ComponentKind, str] = {
    ComponentKind.PIPE_SEGMENT: "Pipe (straight)",
    ComponentKind.DUCT_SEGMENT: "Duct (straight)",
    ComponentKind.ELBOW: "Elbow 90°",
    ComponentKind.TEE: "Tee",
    ComponentKind.VALVE: "Valve",
    ComponentKind.TRANSITION: "Transition",
    ComponentKind.DAMPER: "Damper",
    ComponentKind.ERROR_MARKER: "Design Rule Error Marker",
}
