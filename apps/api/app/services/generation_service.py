"""Application service orchestrating parse -> compile -> scene.

This is the single use-case entry point the API layer depends on. It wires the
strategy (parser), the engine (compiler) and the spec repository together so the
HTTP layer stays thin and the workflow is unit-testable without FastAPI.
"""
from __future__ import annotations

from ..domain.enums import DesignMode
from ..domain.scene import SceneDocument
from ..engine.assembly import build_assembly_scene, is_assembly_input
from ..engine.compiler import NetworkCompiler
from ..engine.duct_v2 import build_v2_scene, is_v2_input
from ..parsing.base import Row
from ..parsing.factory import ParserFactory
from ..specs.repository import SpecRepository


class GenerationService:
    def __init__(
        self,
        specs: SpecRepository,
        parser_factory: ParserFactory | None = None,
        compiler: NetworkCompiler | None = None,
    ) -> None:
        self._specs = specs
        self._parsers = parser_factory or ParserFactory(specs)
        self._compiler = compiler or NetworkCompiler()

    def generate(self, mode: DesignMode, rows: list[Row]) -> SceneDocument:
        # v2 duct schema (``duct_3d_sheet_v2``): rows carry an element-id graph and
        # absolute centerline geometry (origin/end/dir + orientation_code). This is
        # the canonical DUCT path and takes precedence when those columns appear.
        if is_v2_input(rows):
            return build_v2_scene(mode, rows, self._specs)
        # Plan_v2 assembly input (rows carry a ``part_type``): the user supplies
        # only assembly order + connectivity + angles, and the engine computes
        # every position. Legacy x/y/z and direction+length rows keep the
        # original parser path.
        if is_assembly_input(rows):
            return build_assembly_scene(mode, rows, self._specs)
        parser = self._parsers.for_mode(mode)
        network = parser.parse(rows)
        return self._compiler.compile(network)
