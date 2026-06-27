"""Application service orchestrating parse -> compile -> scene.

This is the single use-case entry point the API layer depends on. It wires the
strategy (parser), the engine (compiler) and the spec repository together so the
HTTP layer stays thin and the workflow is unit-testable without FastAPI.
"""
from __future__ import annotations

from ..domain.enums import DesignMode
from ..domain.scene import SceneDocument
from ..engine.compiler import NetworkCompiler
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
        parser = self._parsers.for_mode(mode)
        network = parser.parse(rows)
        return self._compiler.compile(network)
