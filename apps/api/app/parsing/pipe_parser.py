"""Concrete strategy: parse pipe-mode rows into a Network."""
from __future__ import annotations

from collections import defaultdict

from ..domain.components import CrossSection, Metadata, Network, Node, Run
from ..domain.enums import DesignMode, DuctShape
from ..domain.geometry import Vec3
from ..specs.repository import SpecRepository
from .base import InputParser, ParseError, Row, parse_fitting


class PipeInputParser(InputParser):
    """Rows -> pipe Network. Resolves OD/bend radius from the spec repository.

    Expected row fields::

        run_id, seq, x, y, z, nominal, schedule, fitting,
        drawing_no, fitting_no, joint_no
    """

    mode = DesignMode.PIPE

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

        return Network(mode=self.mode, runs=runs)

    def _build_run(
        self,
        run_id: str,
        indexed_rows: list[tuple[int, Row]],
        positions_by_joint: dict[str, Vec3],
    ) -> Run:
        first_index, first = indexed_rows[0]
        nominal = self._require(first, "nominal", first_index)
        schedule = first.get("schedule", "Sch40")
        spec = self._specs.get_pipe(str(nominal), str(schedule))

        section = CrossSection(
            shape=DuctShape.ROUND,
            outer_diameter=spec.outer_diameter,
            wall_thickness=spec.wall_thickness,
            bend_radius=spec.bend_radius,
        )
        spec_label = f"{nominal} {schedule}"

        nodes: list[Node] = []
        previous_position: Vec3 | None = None
        for index, row in indexed_rows:
            position = self._position_for_row(
                row, index, previous_position, positions_by_joint
            )
            previous_position = position
            metadata = Metadata(
                drawing_no=str(row.get("drawing_no", "")),
                fitting_no=str(row.get("fitting_no", "")),
                joint_no=str(row.get("joint_no", "")),
                spec=spec_label,
                extra=_row_extra(row),
            )
            nodes.append(
                Node(position=position, metadata=metadata,
                     fitting=parse_fitting(row.get("fitting")), section=section)
            )

        if len(nodes) < 2:
            raise ParseError(f"run {run_id!r} needs at least 2 nodes")
        return Run(mode=self.mode, section=section, nodes=nodes)


def _row_extra(row: Row) -> dict[str, str]:
    extra: dict[str, str] = {}
    for key in ("rotation", "rotation_deg", "angle", "orientation"):
        value = row.get(key)
        if value not in (None, ""):
            extra[key] = str(value)
    return extra
