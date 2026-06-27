"""Concrete strategy: parse duct-mode rows into a Network.

Supports rectangular (``width`` x ``height``) and round (``diameter``) sections.
Ducts carry dimensions per row so adjacent row section changes can become
transition geometry.
"""
from __future__ import annotations

from collections import defaultdict

from ..domain.components import CrossSection, Metadata, Network, Node, Run
from ..domain.enums import DesignMode, DuctShape
from ..domain.geometry import Vec3
from ..specs.repository import SpecRepository
from .base import InputParser, ParseError, Row, parse_fitting


class DuctInputParser(InputParser):
    """Rows -> duct Network.

    Expected row fields::

        run_id, seq, x, y, z, shape, width, height, diameter, fitting,
        drawing_no, fitting_no, joint_no, material
    """

    mode = DesignMode.DUCT

    def __init__(self, specs: SpecRepository) -> None:
        self._specs = specs

    def parse(self, rows: list[Row]) -> Network:
        if not rows:
            raise ParseError("no rows provided")

        grouped: dict[str, list[tuple[int, Row]]] = defaultdict(list)
        for index, row in enumerate(rows):
            run_id = str(row.get("run_id", "R1")) or "R1"
            grouped[run_id].append((index, row))

        runs: list[Run] = []
        positions_by_joint: dict[str, Vec3] = {}
        for run_id, indexed_rows in grouped.items():
            indexed_rows.sort(key=lambda ir: self._seq_key(ir[1].get("seq"), ir[0]))
            runs.append(self._build_run(run_id, indexed_rows, positions_by_joint))

        error_markers = self.check_joint_compatibility(runs)
        return Network(mode=self.mode, runs=runs, error_markers=error_markers)

    def _build_run(
        self,
        run_id: str,
        indexed_rows: list[tuple[int, Row]],
        positions_by_joint: dict[str, Vec3],
    ) -> Run:
        first_index, first = indexed_rows[0]
        default_section, default_spec_label = self._resolve_section(first, first_index)

        nodes: list[Node] = []
        previous_position: Vec3 | None = None
        for index, row in indexed_rows:
            section, spec_label = self._resolve_section(
                row, index, default_section, default_spec_label
            )
            position = self._position_for_row(
                row, index, previous_position, positions_by_joint
            )
            previous_position = position

            material = str(row.get("material", "Galvanized Steel"))
            duct_spec = self._specs.get_duct(section.width, section.height, section.outer_diameter, material)

            extra = _row_extra(row)
            extra.update({
                "material": duct_spec.material,
                "sheetGauge": duct_spec.sheet_gauge,
                "stiffenerSpec": duct_spec.stiffener_spec,
                "maxSpacing": duct_spec.max_spacing,
                "materialSpec": duct_spec.material_spec,
                "turningVanesRequired": "Yes" if duct_spec.turning_vanes_required else "No",
            })

            metadata = Metadata(
                drawing_no=str(row.get("drawing_no", "")),
                fitting_no=str(row.get("fitting_no", "")),
                joint_no=str(row.get("joint_no", "")),
                item_no=str(row.get("item_no", row.get("itemNo", ""))),
                spec=spec_label,
                joint_nos=self._parse_joint_nos(row),
                extra=extra,
            )
            nodes.append(
                Node(
                    position=position,
                    metadata=metadata,
                    fitting=parse_fitting(row.get("fitting")),
                    section=section,
                )
            )

        if len(nodes) < 2:
            raise ParseError(f"run {run_id!r} needs at least 2 nodes")
        return Run(mode=self.mode, section=default_section, nodes=nodes)

    def _resolve_section(
        self,
        row: Row,
        index: int,
        default: CrossSection | None = None,
        default_label: str | None = None,
    ) -> tuple[CrossSection, str]:
        raw_shape = row.get("shape", None)
        shape = str(
            raw_shape
            if raw_shape not in (None, "")
            else (default.shape.value if default else "rectangular")
        ).strip().lower()

        if shape in ("round", "circular", "??", "?", "?"):
            raw_diameter = row.get("diameter", None)
            if raw_diameter in (None, "") and default and default.shape is DuctShape.ROUND:
                diameter = default.outer_diameter
            else:
                diameter = self._to_float(
                    self._require(row, "diameter", index), "diameter", index
                )
            return (
                CrossSection(shape=DuctShape.ROUND, outer_diameter=diameter),
                f"Round ?{diameter:g}",
            )

        raw_width = row.get("width", None)
        raw_height = row.get("height", None)
        if (
            raw_width in (None, "")
            and raw_height in (None, "")
            and default
            and default.shape is DuctShape.RECTANGULAR
        ):
            width, height = default.width, default.height
        else:
            width = self._to_float(self._require(row, "width", index), "width", index)
            height = self._to_float(self._require(row, "height", index), "height", index)
        return (
            CrossSection(shape=DuctShape.RECTANGULAR, width=width, height=height),
            f"Rect {width:g}x{height:g}",
        )


def _row_extra(row: Row) -> dict[str, str]:
    extra: dict[str, str] = {}
    for key in ("rotation", "rotation_deg", "angle", "orientation"):
        value = row.get(key)
        if value not in (None, ""):
            extra[key] = str(value)
    return extra
