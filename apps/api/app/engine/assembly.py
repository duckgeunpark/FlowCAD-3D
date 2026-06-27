"""Plan_v2 assembly engine: topological rows -> positioned SceneDocument.

This is the heart of Plan_v2. Instead of asking the user for coordinates or a
per-row ``direction``, the user supplies only an *assembly order* and *who
connects to whom* (``connect_to_seq`` / ``connect_port``) plus an ``angle`` on
elbows. The :class:`AssemblyResolver` walks that connection graph, propagating a
heading from part to part, and computes the absolute 3D position and orientation
of every part. ``direction`` remains an optional per-row override.

The resolved parts are then rendered by :class:`AssemblyCompiler`, which *reuses*
the existing :class:`GeometryFactory` (one synthetic Node/Run context per part)
so the SceneDocument contract — and therefore the whole frontend — is unchanged.

Routing: this path activates when rows carry a ``part_type`` column (see
``GenerationService``); legacy ``x/y/z`` and ``direction+length`` rows keep using
the original parsers untouched.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..domain.components import CrossSection, Metadata, Node, Run
from ..domain.enums import ComponentKind, DesignMode, DuctShape
from ..domain.geometry import Vec3
from ..domain.scene import SceneDocument
from ..specs.repository import SpecNotFoundError, SpecRepository
from .geometry_factory import GeometryFactory
from .scene_builder import SceneBuilder

# Lateral spacing between disconnected runs so independent chains do not overlap.
_RUN_STAGGER = 4000.0

# part_type vocabulary -> behaviour class
_STRAIGHT_TYPES = {"straight", "pipe", "duct", "spool", "run"}
_ELBOW_TYPES = {"elbow", "bend", "elbow45", "elbow90"}
_TEE_TYPES = {"tee", "branch", "wye"}
_TRANSITION_TYPES = {"reducer", "transition", "transform", "reducer_conc", "reducer_ecc"}
_VALVE_TYPES = {"valve", "gate_valve", "butterfly_valve"}
_DAMPER_TYPES = {"damper", "vd", "fd"}
_CAP_TYPES = {"cap", "blind"}

_DIRECTIONS: dict[str, Vec3] = {
    "e": Vec3(1, 0, 0), "east": Vec3(1, 0, 0), "x+": Vec3(1, 0, 0), "+x": Vec3(1, 0, 0),
    "w": Vec3(-1, 0, 0), "west": Vec3(-1, 0, 0), "x-": Vec3(-1, 0, 0), "-x": Vec3(-1, 0, 0),
    "n": Vec3(0, 1, 0), "north": Vec3(0, 1, 0), "y+": Vec3(0, 1, 0), "+y": Vec3(0, 1, 0),
    "s": Vec3(0, -1, 0), "south": Vec3(0, -1, 0), "y-": Vec3(0, -1, 0), "-y": Vec3(0, -1, 0),
    "u": Vec3(0, 0, 1), "up": Vec3(0, 0, 1), "z+": Vec3(0, 0, 1), "+z": Vec3(0, 0, 1),
    "d": Vec3(0, 0, -1), "down": Vec3(0, 0, -1), "z-": Vec3(0, 0, -1), "-z": Vec3(0, 0, -1),
}


class AssemblyError(ValueError):
    """Raised for structurally invalid assembly input (carries the seq)."""

    def __init__(self, message: str, *, seq: str | None = None) -> None:
        self.seq = seq
        prefix = f"[seq {seq}] " if seq else ""
        super().__init__(prefix + message)


# --------------------------------------------------------------------------- #
# Small vector helpers (Vec3 is intentionally minimal)
# --------------------------------------------------------------------------- #
def _norm(v: Vec3) -> Vec3:
    length = v.length()
    if length <= 1e-9:
        return Vec3(1.0, 0.0, 0.0)
    return v.scaled(1.0 / length)


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return Vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    )


def _dot(a: Vec3, b: Vec3) -> float:
    return a.x * b.x + a.y * b.y + a.z * b.z


def _rotate_axis(v: Vec3, axis: Vec3, degrees: float) -> Vec3:
    """Rodrigues rotation of ``v`` about ``axis`` by ``degrees``."""
    axis = _norm(axis)
    if abs(degrees) <= 1e-9:
        return v
    theta = math.radians(degrees)
    c, s = math.cos(theta), math.sin(theta)
    return (
        v.scaled(c)
        + _cross(axis, v).scaled(s)
        + axis.scaled(_dot(axis, v) * (1.0 - c))
    )


def _perp_in_plan(v: Vec3) -> Vec3:
    """A horizontal perpendicular to ``v`` (matches GeometryFactory tee branch)."""
    candidate = Vec3(-v.y, v.x, 0.0)
    if candidate.length() <= 1e-9:
        return Vec3(1.0, 0.0, 0.0)
    return _norm(candidate)


def _turn_axis_for(h_in: Vec3) -> Vec3:
    """Axis an elbow turns about. Default vertical (+Z) so turns read in plan;
    if the run is already vertical, turn about +Y instead."""
    if abs(_dot(_norm(h_in), Vec3(0, 0, 1))) > 0.95:
        return Vec3(0.0, 1.0, 0.0)
    return Vec3(0.0, 0.0, 1.0)


# --------------------------------------------------------------------------- #
# Resolved model
# --------------------------------------------------------------------------- #
@dataclass(slots=True)
class ResolvedPart:
    seq: str
    role: str                         # 'segment' | 'fitting' | 'transition'
    kind: ComponentKind | None        # fitting kind, or None for straight
    in_section: CrossSection
    out_section: CrossSection
    start_pos: Vec3
    end_pos: Vec3
    corner_pos: Vec3
    in_dir: Vec3
    out_dir: Vec3
    metadata: Metadata
    ports: dict[str, tuple[Vec3, Vec3]] = field(default_factory=dict)
    start_neighbor: ComponentKind | None = None
    end_neighbor: ComponentKind | None = None


def _classify(part_type: str) -> tuple[str, ComponentKind | None]:
    pt = part_type.strip().lower()
    if pt in _ELBOW_TYPES:
        return "fitting", ComponentKind.ELBOW
    if pt in _TEE_TYPES:
        return "fitting", ComponentKind.TEE
    if pt in _VALVE_TYPES:
        return "fitting", ComponentKind.VALVE
    if pt in _DAMPER_TYPES:
        return "fitting", ComponentKind.DAMPER
    if pt in _TRANSITION_TYPES:
        return "transition", ComponentKind.TRANSITION
    if pt in _CAP_TYPES:
        return "cap", None
    # default: a straight segment (also covers 'pipe'/'duct'/'straight')
    return "segment", None


def _num(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _parse_direction(value: object) -> Vec3 | None:
    raw = str(value or "").strip().lower().replace(" ", "")
    if not raw:
        return None
    if raw in _DIRECTIONS:
        return _DIRECTIONS[raw]
    if "," in raw:
        parts = raw.split(",")
        if len(parts) == 3:
            try:
                v = Vec3(float(parts[0]), float(parts[1]), float(parts[2]))
            except ValueError:
                return None
            if v.length() > 1e-9:
                return _norm(v)
    return None


class AssemblyResolver:
    """Walk the connection graph and compute absolute placement for each part."""

    def __init__(self, specs: SpecRepository) -> None:
        self._specs = specs

    # -- section resolution ---------------------------------------------------
    def _resolve_section(
        self,
        row: dict,
        system_type: str,
        prev: CrossSection | None,
        seq: str,
    ) -> tuple[CrossSection, str]:
        if system_type == "pipe":
            return self._resolve_pipe_section(row, prev, seq)
        return self._resolve_duct_section(row, prev, seq)

    def _resolve_pipe_section(
        self, row: dict, prev: CrossSection | None, seq: str
    ) -> tuple[CrossSection, str]:
        nominal = str(row.get("nominal", "")).strip()
        size_a = _num(row.get("size_a")) or _num(row.get("diameter"))
        if nominal:
            schedule = str(row.get("schedule", "Sch40")).strip() or "Sch40"
            try:
                spec = self._specs.get_pipe(nominal, schedule)
            except SpecNotFoundError:
                raise
            return (
                CrossSection(
                    shape=DuctShape.ROUND,
                    outer_diameter=spec.outer_diameter,
                    wall_thickness=spec.wall_thickness,
                    bend_radius=spec.bend_radius,
                ),
                f"{nominal} {schedule}",
            )
        if size_a is not None:
            return (
                CrossSection(
                    shape=DuctShape.ROUND,
                    outer_diameter=size_a,
                    bend_radius=size_a * 1.5,
                ),
                f"Ø{size_a:g}",
            )
        if prev is not None:
            return prev, f"Ø{prev.outer_diameter:g}"
        raise AssemblyError("배관 규격 누락: nominal 또는 size_a(직경) 필요", seq=seq)

    def _resolve_duct_section(
        self, row: dict, prev: CrossSection | None, seq: str
    ) -> tuple[CrossSection, str]:
        shape = str(row.get("shape", "")).strip().lower()
        size_a = _num(row.get("size_a"))
        size_b = _num(row.get("size_b"))
        # Explicit width/height/diameter columns are an optional power-user override.
        width = _num(row.get("width"))
        height = _num(row.get("height"))
        diameter = _num(row.get("diameter"))

        explicit_round = shape in ("round", "circular") or diameter is not None
        explicit_rect = (width is not None and height is not None)

        if explicit_round:
            d = diameter if diameter is not None else size_a
            if d is not None:
                return CrossSection(shape=DuctShape.ROUND, outer_diameter=d), f"Round Ø{d:g}"
        if explicit_rect:
            return (
                CrossSection(shape=DuctShape.RECTANGULAR, width=width, height=height),
                f"Rect {width:g}x{height:g}",
            )

        # Plan_v2 size convention: size_b present -> rectangular (size_a x size_b);
        # size_a only -> round (size_a is the diameter).
        if size_a is not None and size_b is not None:
            return (
                CrossSection(shape=DuctShape.RECTANGULAR, width=size_a, height=size_b),
                f"Rect {size_a:g}x{size_b:g}",
            )
        if size_a is not None:
            return CrossSection(shape=DuctShape.ROUND, outer_diameter=size_a), f"Round Ø{size_a:g}"

        if prev is not None:
            if prev.shape is DuctShape.ROUND:
                return prev, f"Round Ø{prev.outer_diameter:g}"
            return prev, f"Rect {prev.width:g}x{prev.height:g}"
        raise AssemblyError("덕트 규격 누락: width/height 또는 diameter 필요", seq=seq)

    # -- metadata -------------------------------------------------------------
    @staticmethod
    def _metadata(row: dict, spec_label: str) -> Metadata:
        jnos_raw = row.get("joint_nos", row.get("joint_no", ""))
        if isinstance(jnos_raw, list):
            jnos = [str(j).strip() for j in jnos_raw if str(j).strip()]
        else:
            jnos = [s.strip() for s in str(jnos_raw or "").split(",") if s.strip()]
        extra: dict[str, str] = {}
        for key in ("rotation", "rotation_deg", "angle", "orientation", "note", "material", "spec"):
            value = row.get(key)
            if value not in (None, ""):
                extra[key] = str(value)
        return Metadata(
            drawing_no=str(row.get("drawing_no", "")),
            fitting_no=str(row.get("fitting_no", "")),
            joint_no=str(row.get("joint_no", "")) or (jnos[0] if jnos else ""),
            item_no=str(row.get("item_no", "")),
            spec=spec_label,
            joint_nos=jnos,
            extra=extra,
        )

    # -- main resolve ---------------------------------------------------------
    def resolve(
        self, rows: list[dict], mode: DesignMode
    ) -> tuple[list[ResolvedPart], list[dict]]:
        if not rows:
            raise AssemblyError("no rows provided")

        indexed = list(enumerate(rows))
        indexed.sort(key=lambda ir: _seq_sort_key(ir[1].get("seq"), ir[0]))

        parts: dict[str, ResolvedPart] = {}
        order: list[ResolvedPart] = []
        # who connects onto seq X at which port (for trim/neighbor hints)
        children: dict[str, list[tuple[str, str]]] = {}
        errors: list[dict] = []
        root_index = 0

        for fallback, row in indexed:
            seq = str(row.get("seq", fallback)).strip() or str(fallback)
            system_type = str(
                row.get("system_type", row.get("item_type", mode.value))
            ).strip().lower()
            if system_type not in ("pipe", "duct"):
                system_type = mode.value
            part_type = str(row.get("part_type", row.get("item_type", "straight")))
            role, kind = _classify(part_type)

            connect_to = str(row.get("connect_to_seq", "")).strip()
            connect_port = str(row.get("connect_port", "")).strip().lower() or "end"
            parent = parts.get(connect_to) if connect_to else None

            # entry position + heading
            if parent is not None:
                entry_pos, h_in = _parent_port(parent, connect_port)
            else:
                entry_pos = Vec3(0.0, root_index * _RUN_STAGGER, 0.0)
                h_in = Vec3(1.0, 0.0, 0.0)
                root_index += 1
            override = _parse_direction(row.get("direction"))
            if override is not None:
                h_in = override
            h_in = _norm(h_in)

            prev_section = parent.out_section if parent is not None else None
            section, spec_label = self._resolve_section(row, system_type, prev_section, seq)
            metadata = self._metadata(row, spec_label)
            length = _num(row.get("length")) or 0.0

            resolved = self._place(
                seq, role, kind, system_type, section, prev_section,
                entry_pos, h_in, length, row, metadata, mode,
            )
            parts[seq] = resolved
            order.append(resolved)

            if parent is not None:
                children.setdefault(connect_to, []).append((seq, connect_port))
                marker = self._check_rule(parent, resolved, connect_port, entry_pos)
                if marker is not None:
                    errors.append(marker)

        _assign_neighbors(parts, children)
        return order, errors

    def _place(
        self, seq, role, kind, system_type, section, prev_section,
        entry_pos, h_in, length, row, metadata, mode,
    ) -> ResolvedPart:
        if role == "fitting" and kind is ComponentKind.ELBOW:
            angle = _num(row.get("angle"))
            override = _parse_direction(row.get("direction"))
            if override is not None:
                out_dir = override
            else:
                turn = angle if angle is not None else 90.0
                out_dir = _norm(_rotate_axis(h_in, _turn_axis_for(h_in), turn))
            ports = {
                "in": (entry_pos, h_in.scaled(-1)), "start": (entry_pos, h_in.scaled(-1)),
                "out": (entry_pos, out_dir), "end": (entry_pos, out_dir),
            }
            return ResolvedPart(seq, "fitting", kind, section, section,
                                entry_pos, entry_pos, entry_pos, h_in, out_dir,
                                metadata, ports)

        if role == "fitting" and kind is ComponentKind.TEE:
            roll = _num(row.get("rotation")) or _num(row.get("angle")) or 0.0
            branch = _rotate_axis(_perp_in_plan(h_in), h_in, roll)
            ports = {
                "in": (entry_pos, h_in.scaled(-1)), "start": (entry_pos, h_in.scaled(-1)),
                "out": (entry_pos, h_in), "end": (entry_pos, h_in),
                "branch": (entry_pos, _norm(branch)),
            }
            return ResolvedPart(seq, "fitting", kind, section, section,
                                entry_pos, entry_pos, entry_pos, h_in, h_in,
                                metadata, ports)

        if role == "fitting" and kind in (ComponentKind.VALVE, ComponentKind.DAMPER):
            half = _inline_half(kind, section)
            corner = entry_pos + h_in.scaled(half)
            out_face = entry_pos + h_in.scaled(2 * half)
            ports = {
                "in": (entry_pos, h_in.scaled(-1)), "start": (entry_pos, h_in.scaled(-1)),
                "out": (out_face, h_in), "end": (out_face, h_in),
            }
            return ResolvedPart(seq, "fitting", kind, section, section,
                                entry_pos, out_face, corner, h_in, h_in,
                                metadata, ports)

        if role == "transition":
            # in-section inherited from parent, out-section from this row
            in_section = prev_section or section
            span = length if length > 0 else max(_nominal_radius(section) * 4, 300.0)
            end = entry_pos + h_in.scaled(span)
            ports = {
                "in": (entry_pos, h_in.scaled(-1)), "start": (entry_pos, h_in.scaled(-1)),
                "out": (end, h_in), "end": (end, h_in),
            }
            return ResolvedPart(seq, "transition", ComponentKind.TRANSITION,
                                in_section, section, entry_pos, end, entry_pos,
                                h_in, h_in, metadata, ports)

        if role == "cap":
            ports = {"in": (entry_pos, h_in.scaled(-1)), "start": (entry_pos, h_in.scaled(-1))}
            return ResolvedPart(seq, "cap", None, section, section,
                                entry_pos, entry_pos, entry_pos, h_in, h_in,
                                metadata, ports)

        # default: straight segment
        if length <= 0:
            length = max(_nominal_radius(section) * 6, 500.0)
        end = entry_pos + h_in.scaled(length)
        ports = {
            "in": (entry_pos, h_in.scaled(-1)), "start": (entry_pos, h_in.scaled(-1)),
            "out": (end, h_in), "end": (end, h_in),
        }
        return ResolvedPart(seq, "segment", None, section, section,
                            entry_pos, end, entry_pos, h_in, h_in, metadata, ports)

    # -- connection rule engine ----------------------------------------------
    @staticmethod
    def _check_rule(
        parent: ResolvedPart, child: ResolvedPart, port: str, pos: Vec3
    ) -> dict | None:
        # transitions/reducers legitimately bridge mismatched sections
        if ComponentKind.TRANSITION in (parent.kind, child.kind):
            return None
        # tee branch may carry a different size in MVP
        if port in ("branch",):
            return None
        a = parent.out_section
        b = child.in_section
        desc = ""
        if a.shape is not b.shape:
            desc = f"형상 불일치: {a.shape.value} ↔ {b.shape.value} (변환관 필요)"
        elif a.shape is DuctShape.ROUND:
            if abs(a.outer_diameter - b.outer_diameter) > 1e-3:
                desc = (f"직경 불일치: Ø{a.outer_diameter:g} ↔ Ø{b.outer_diameter:g} "
                        "(ROUND_SAME_DIA)")
        else:
            if abs(a.width - b.width) > 1e-3 or abs(a.height - b.height) > 1e-3:
                desc = (f"단면 불일치: {a.width:g}x{a.height:g} ↔ "
                        f"{b.width:g}x{b.height:g} (RECT_SAME_WH)")
        if not desc:
            return None
        jno = child.metadata.joint_no or parent.metadata.joint_no or f"{parent.seq}-{child.seq}"
        return {"joint_no": jno, "position": pos, "desc": f"[연결 {parent.seq}→{child.seq}] {desc}"}


def _parent_port(parent: ResolvedPart, port: str) -> tuple[Vec3, Vec3]:
    if port in parent.ports:
        return parent.ports[port]
    # graceful default: the parent's downstream exit
    for fallback in ("end", "out"):
        if fallback in parent.ports:
            return parent.ports[fallback]
    return parent.end_pos, parent.out_dir


def _assign_neighbors(
    parts: dict[str, ResolvedPart], children: dict[str, list[tuple[str, str]]]
) -> None:
    """Tell each straight which fitting (if any) sits at its start/end so the
    GeometryFactory trims it to the fitting connection face."""
    for seq, kid_list in children.items():
        parent = parts.get(seq)
        if parent is None:
            continue
        for child_seq, port in kid_list:
            child = parts.get(child_seq)
            if child is None:
                continue
            # child's start touches parent's port -> child.start_neighbor = parent fitting
            if parent.kind is not None and parent.role in ("fitting",):
                if child.start_neighbor is None:
                    child.start_neighbor = parent.kind
            # parent's downstream end touches a fitting child
            if child.kind is not None and child.role in ("fitting",) and port in ("end", "out"):
                if parent.end_neighbor is None and parent.role == "segment":
                    parent.end_neighbor = child.kind


# --------------------------------------------------------------------------- #
# Compiler: render resolved parts via the existing GeometryFactory
# --------------------------------------------------------------------------- #
class AssemblyCompiler:
    def __init__(self, factory: GeometryFactory | None = None) -> None:
        self._factory = factory or GeometryFactory()

    def compile(
        self, parts: list[ResolvedPart], mode: DesignMode, errors: list[dict]
    ) -> SceneDocument:
        builder = SceneBuilder()
        for rp in parts:
            eid = f"A{rp.seq}"
            if rp.role == "segment":
                builder.add(self._segment(rp, mode, eid))
            elif rp.role == "transition":
                builder.add(self._transition(rp, mode, eid))
            elif rp.role == "fitting":
                builder.add(self._fitting(rp, mode, eid))
            # 'cap' renders no geometry in the MVP (it only closes a port)
        for i, marker in enumerate(errors):
            builder.add(self._factory.build_error_marker(marker, f"AERR-{i:03d}"))
        return builder.build()

    def _segment(self, rp: ResolvedPart, mode: DesignMode, eid: str):
        run = Run(mode=mode, section=rp.in_section, nodes=[])
        a = Node(position=rp.start_pos, metadata=rp.metadata,
                 fitting=rp.start_neighbor, section=rp.in_section)
        b = Node(position=rp.end_pos, metadata=rp.metadata,
                 fitting=rp.end_neighbor, section=rp.in_section)
        return self._factory.build_segment(run, a, b, eid)

    def _transition(self, rp: ResolvedPart, mode: DesignMode, eid: str):
        run = Run(mode=mode, section=rp.in_section, nodes=[])
        a = Node(position=rp.start_pos, metadata=rp.metadata, section=rp.in_section)
        b = Node(position=rp.end_pos, metadata=rp.metadata, section=rp.out_section)
        return self._factory.build_transition(run, a, b, eid)

    def _fitting(self, rp: ResolvedPart, mode: DesignMode, eid: str):
        run = Run(mode=mode, section=rp.in_section, nodes=[])
        corner = Node(position=rp.corner_pos, metadata=rp.metadata,
                      fitting=rp.kind, section=rp.in_section)
        prev = Node(position=rp.corner_pos + rp.in_dir.scaled(-1000.0),
                    metadata=rp.metadata, section=rp.in_section)
        nxt = Node(position=rp.corner_pos + rp.out_dir.scaled(1000.0),
                   metadata=rp.metadata, section=rp.out_section)
        return self._factory.build_fitting(run, corner, eid, prev, nxt)


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
def _nominal_radius(section: CrossSection) -> float:
    if section.shape is DuctShape.ROUND:
        return section.outer_diameter / 2.0
    return max(section.width, section.height) / 2.0


def _inline_half(kind: ComponentKind, section: CrossSection) -> float:
    """Half the face-to-face length of an in-line fitting (matches GeometryFactory)."""
    radius = _nominal_radius(section)
    if kind is ComponentKind.VALVE:
        body = max(radius * 4.0, 250.0)
        flange = max(radius * 0.28, 18.0)
        return body / 2.0 + flange / 2.0
    # damper
    return max(radius * 3.0, 300.0) / 2.0


def _seq_sort_key(value: object, fallback: int) -> float:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return float(fallback)
    return result if math.isfinite(result) else float(fallback)


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def is_assembly_input(rows: list[dict]) -> bool:
    """Plan_v2 assembly rows are identified by a non-empty ``part_type`` column."""
    return any(str(r.get("part_type", "")).strip() for r in rows)


def build_assembly_scene(
    mode: DesignMode, rows: list[dict], specs: SpecRepository
) -> SceneDocument:
    resolver = AssemblyResolver(specs)
    parts, errors = resolver.resolve(rows, mode)
    return AssemblyCompiler().compile(parts, mode, errors)
