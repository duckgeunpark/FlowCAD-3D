"""Factory that selects the right parsing strategy for a design mode."""
from __future__ import annotations

from ..domain.enums import DesignMode
from ..specs.repository import SpecRepository
from .base import InputParser
from .duct_parser import DuctInputParser
from .pipe_parser import PipeInputParser


class ParserFactory:
    """Maps a :class:`DesignMode` to its :class:`InputParser` strategy."""

    def __init__(self, specs: SpecRepository) -> None:
        self._specs = specs

    def for_mode(self, mode: DesignMode) -> InputParser:
        if mode is DesignMode.PIPE:
            return PipeInputParser(self._specs)
        if mode is DesignMode.DUCT:
            return DuctInputParser(self._specs)
        raise ValueError(f"unsupported design mode: {mode}")
