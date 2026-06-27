"""NetworkCompiler: walks a Network and emits a SceneDocument.

This is the routing step (plan §2 "라우팅 연산 엔진"): consecutive nodes of a run
become straight segments, and any node carrying a fitting emits a fitting element
at that joint. Element ids are stable and traceable back to runs/joints.
"""
from __future__ import annotations

from ..domain.components import Network
from ..domain.scene import SceneDocument
from .geometry_factory import GeometryFactory, sections_match
from .scene_builder import SceneBuilder


class NetworkCompiler:
    def __init__(self, factory: GeometryFactory | None = None) -> None:
        self._factory = factory or GeometryFactory()

    def compile(self, network: Network) -> SceneDocument:
        builder = SceneBuilder()
        for run_idx, run in enumerate(network.runs):
            run_id = f"R{run_idx}"
            # straight segments between consecutive nodes
            for i in range(len(run.nodes) - 1):
                a, b = run.nodes[i], run.nodes[i + 1]
                eid = f"{run_id}-SEG{i:03d}"
                a_section = a.section or run.section
                b_section = b.section or run.section
                if run.mode.value == "duct" and not sections_match(a_section, b_section):
                    builder.add(self._factory.build_transition(run, a, b, eid))
                else:
                    builder.add(self._factory.build_segment(run, a, b, eid))
            # fittings placed at nodes
            for i, node in enumerate(run.nodes):
                if node.fitting is not None:
                    eid = f"{run_id}-FIT{i:03d}"
                    prev_node = run.nodes[i - 1] if i > 0 else None
                    next_node = run.nodes[i + 1] if i + 1 < len(run.nodes) else None
                    builder.add(
                        self._factory.build_fitting(run, node, eid, prev_node, next_node)
                    )
        for err_idx, marker in enumerate(network.error_markers):
            builder.add(self._factory.build_error_marker(marker, f"ERR-{err_idx:03d}"))
        return builder.build()
