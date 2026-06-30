"""v2 duct schema engine (``duct_3d_sheet_v2.xlsx`` → SceneDocument).

This is the canonical DUCT input path. Unlike the pipe ``AssemblyResolver``
(which infers positions from relative connectivity), the v2 sheet supplies
**absolute centerline geometry** per element row:

* ``origin_x/y/z`` — the element's centerline vertex (a fitting's corner, a
  straight's start). ``end_x/y/z`` — a straight's far vertex.
* ``orientation_code`` (e.g. ``XP_YP``, ``YP_YP_BRANCH_XP``, ``XP_ZP_ZN``) — the
  in / out / branch axes, with ``dir_x/y/z`` + the ``from/to/branch_to`` element
  graph as fallbacks.
* ``family_code`` / ``fitting_type`` / ``shape_code`` / ``part_subtype`` — the
  standard classification that selects the renderable :class:`ComponentKind`.

The engine resolves each row to absolute faces, trims straights back to the
neighbouring corner-fitting connection faces, and emits the existing flat Scene
Document contract (so the Three.js GeometryFactory renders it directly).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..domain.enums import ComponentKind, DesignMode, DuctShape
from ..domain.geometry import Vec3
from ..domain.scene import Diagnostic, JointPort, SceneDocument, SceneElement
from ..specs.repository import SpecRepository
from .geometry_factory import elbow_bend_radius
from .scene_builder import SceneBuilder

# Corner fittings whose centerline vertex coincides with the connection point, so
# abutting straights must be trimmed back to the fitting's connection face.
_CORNER_KINDS = {
    ComponentKind.ELBOW,
    ComponentKind.TEE,
    ComponentKind.WYE,
    ComponentKind.CROSS,
    ComponentKind.SPLITTER,
    ComponentKind.TAP,
}

_PALETTE: dict[ComponentKind, str] = {
    ComponentKind.PIPE_SEGMENT: "#9aa7b4",
    ComponentKind.DUCT_SEGMENT: "#c9b377",
    ComponentKind.ELBOW: "#6c8cd5",
    ComponentKind.TEE: "#5cb88a",
    ComponentKind.WYE: "#49b58f",
    ComponentKind.CROSS: "#3fa3a3",
    ComponentKind.SPLITTER: "#7a5cd5",
    ComponentKind.TAP: "#5c9bd5",
    ComponentKind.CAP: "#8a8f98",
    ComponentKind.VALVE: "#d56c6c",
    ComponentKind.TRANSITION: "#b07cd5",
    ComponentKind.DAMPER: "#d59a4f",
    ComponentKind.ERROR_MARKER: "#ef4444",
}

_AXIS_TOKENS: dict[str, Vec3] = {
    "XP": Vec3(1, 0, 0), "XN": Vec3(-1, 0, 0),
    "YP": Vec3(0, 1, 0), "YN": Vec3(0, -1, 0),
    "ZP": Vec3(0, 0, 1), "ZN": Vec3(0, 0, -1),
}

# v2 ``branch_b_side`` / ``branch_c_side`` keywords -> world axis. Used for complex
# splitters / double-branch parts authored by side instead of orientation codes.
_SIDE_AXIS: dict[str, Vec3] = {
    "RIGHT": Vec3(1, 0, 0), "LEFT": Vec3(-1, 0, 0),
    "FRONT": Vec3(0, 1, 0), "BACK": Vec3(0, -1, 0),
    "TOP": Vec3(0, 0, 1), "BOTTOM": Vec3(0, 0, -1),
}

# fitting_type / family keyword -> ComponentKind for FITTING rows.
_FITTING_KIND: dict[str, ComponentKind] = {
    "ELBOW": ComponentKind.ELBOW,
    "BEND": ComponentKind.ELBOW,
    "TEE": ComponentKind.TEE,
    "WYE": ComponentKind.WYE,
    "CROSS": ComponentKind.CROSS,
    "TAP": ComponentKind.TAP,
    "TAKEOFF": ComponentKind.TAP,
    "SHOE": ComponentKind.TAP,
    "BOOT": ComponentKind.TAP,
    "SPLITTER": ComponentKind.SPLITTER,
    "TRANSITION": ComponentKind.TRANSITION,
    "REDUCER": ComponentKind.TRANSITION,
    "OFFSET": ComponentKind.TRANSITION,
    "CAP": ComponentKind.CAP,
    "DAMPER_BOX": ComponentKind.DAMPER,
    "DAMPER": ComponentKind.DAMPER,
}

_SPLITTER_SUBTYPES = {
    "BULLHEAD_TEE_DOUBLE_ELBOW",
    "DOUBLE_Y_BRANCH_PANTS",
    "CROSS_BRANCH",
}


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def _num(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _str(value: object) -> str:
    return "" if value in (None, "") else str(value).strip()


def _norm(v: Vec3) -> Vec3:
    length = v.length()
    if length <= 1e-9:
        return Vec3(1.0, 0.0, 0.0)
    return v.scaled(1.0 / length)


def _unit_list(v: Vec3) -> list[float]:
    n = _norm(v)
    return [n.x, n.y, n.z]


def _shape_of(code: str) -> DuctShape:
    c = code.strip().upper()
    if c in ("ROUND", "CIRCULAR"):
        return DuctShape.ROUND
    if c == "OVAL":
        return DuctShape.OVAL
    if c in ("FLAT_OVAL", "FLATOVAL"):
        return DuctShape.FLAT_OVAL
    return DuctShape.RECTANGULAR


def _parse_orientation(code: str) -> list[Vec3]:
    """Tokenize ``orientation_code`` into ordered axis vectors.

    ``XP_YP`` -> [+X, +Y]; ``YP_YP_BRANCH_XP`` -> [+Y, +Y, +X];
    ``XP_ZP_ZN`` -> [+X, +Z, -Z]. Non-axis keywords (``BRANCH``) are ignored.
    """
    axes: list[Vec3] = []
    for tok in code.strip().upper().split("_"):
        if tok in _AXIS_TOKENS:
            axes.append(_AXIS_TOKENS[tok])
    return axes


@dataclass(slots=True)
class _Section:
    shape: DuctShape
    width: float = 0.0
    height: float = 0.0
    diameter: float = 0.0
    major: float = 0.0
    minor: float = 0.0

    @property
    def nominal_radius(self) -> float:
        if self.shape is DuctShape.ROUND:
            return self.diameter / 2.0
        if self.shape in (DuctShape.OVAL, DuctShape.FLAT_OVAL):
            return max(self.major, self.minor, self.width, self.height) / 2.0 or 100.0
        return max(self.width, self.height) / 2.0 or 100.0

    def label(self) -> str:
        if self.shape is DuctShape.ROUND:
            return f"Round Ø{self.diameter:g}"
        if self.shape in (DuctShape.OVAL, DuctShape.FLAT_OVAL):
            return f"Oval {self.major:g}x{self.minor:g}"
        return f"Rect {self.width:g}x{self.height:g}"


@dataclass(slots=True)
class _El:
    """A resolved v2 element ready to render."""

    eid: str
    row: dict
    kind: ComponentKind
    is_segment: bool
    section: _Section
    out_section: _Section
    origin: Vec3
    end: Vec3
    in_dir: Vec3
    out_dir: Vec3
    branch_dirs: list[Vec3] = field(default_factory=list)
    from_id: str = ""
    to_id: str = ""
    branch_id: str = ""
    # Trimmed faces (filled in pass 2).
    start_face: Vec3 = field(default_factory=Vec3)
    end_face: Vec3 = field(default_factory=Vec3)


# --------------------------------------------------------------------------- #
# Public entry points
# --------------------------------------------------------------------------- #
_V2_MARKERS = ("element_id", "family_code", "element_type", "shape_code")


def is_v2_input(rows: list[dict]) -> bool:
    """v2 rows are identified by the element-graph / standard-code columns."""
    for r in rows:
        if any(_str(r.get(k)) for k in _V2_MARKERS):
            return True
    return False


def build_v2_scene(
    mode: DesignMode, rows: list[dict], specs: SpecRepository
) -> SceneDocument:
    resolver = _V2Resolver(specs)
    return resolver.build(mode, rows)


# --------------------------------------------------------------------------- #
# Resolver
# --------------------------------------------------------------------------- #
class _V2Resolver:
    def __init__(self, specs: SpecRepository) -> None:
        self._specs = specs

    def build(self, mode: DesignMode, rows: list[dict]) -> SceneDocument:
        data_rows = [r for r in rows if self._is_data_row(r)]
        builder = SceneBuilder()
        diagnostics: list[dict] = []

        elements: list[_El] = []
        by_id: dict[str, _El] = {}
        for idx, row in enumerate(data_rows):
            try:
                el = self._resolve(row, mode, idx)
            except _RowError as exc:
                diagnostics.append(exc.diag)
                continue
            elements.append(el)
            if el.eid:
                by_id[el.eid] = el

        # Pass 2: trim straight faces to neighbouring corner fittings.
        for el in elements:
            if el.is_segment:
                self._trim_segment(el, by_id)
            else:
                el.start_face = el.origin
                el.end_face = el.end

        for el in elements:
            builder.add(self._to_scene_element(el, by_id))

        marker_idx = 0
        for d in diagnostics:
            if d.get("level") == "error" and d.get("position") is not None:
                builder.add(self._error_marker(d, f"V2ERR-{marker_idx:03d}"))
                marker_idx += 1
        builder.add_diagnostics([
            Diagnostic(
                level=d["level"], code=d["code"], seq=d.get("seq", ""),
                message=d["message"], suggestion=d.get("suggestion", ""),
                position=(list(d["position"].as_tuple())
                          if d.get("position") is not None else None),
            )
            for d in diagnostics
        ])
        return builder.build()

    # -- row resolution -------------------------------------------------------
    @staticmethod
    def _is_data_row(row: dict) -> bool:
        rt = _str(row.get("row_type")).upper()
        if rt and rt != "DATA":
            return False
        # The spec row carries REQ/OPT flags in element_id etc.; require an
        # element_id or origin to qualify as renderable data.
        return bool(_str(row.get("element_id"))) or any(
            _num(row.get(k)) is not None for k in ("origin_x", "origin_y", "origin_z")
        )

    def _resolve(self, row: dict, mode: DesignMode, idx: int) -> _El:
        eid = _str(row.get("element_id")) or f"E{idx:04d}"
        element_type = _str(row.get("element_type")).upper() or "STRAIGHT"
        fitting_type = _str(row.get("fitting_type")).upper()
        part_subtype = _str(row.get("part_subtype")).upper()
        shape = _shape_of(_str(row.get("shape_code")))

        section = self._section(row, shape, prefix="")
        # A transition's outlet can change shape (e.g. RECT → ROUND), so infer the
        # outlet shape from the outlet_* dims / family code rather than assuming it
        # matches the inlet ``shape_code``.
        out_section = self._section(row, self._outlet_shape(row, shape), prefix="outlet")
        # A family-hint round outlet with no outlet_diameter would size to 0; fall
        # back to the inlet's nominal size so the transition stays non-degenerate.
        if out_section.shape is DuctShape.ROUND and out_section.diameter <= 0:
            out_section.diameter = section.nominal_radius * 2

        origin = self._vec(row, "origin_x", "origin_y", "origin_z")
        if origin is None:
            raise _RowError(_diag(
                "error", "MISSING_ORIGIN", eid,
                f"[{eid}] origin 좌표가 없습니다.",
                suggestion="origin_x/y/z 를 입력하세요.",
            ))

        axes = _parse_orientation(_str(row.get("orientation_code")))
        dir_vec = self._vec(row, "dir_x", "dir_y", "dir_z")
        is_segment = element_type == "STRAIGHT" or fitting_type in ("", "NONE")
        kind = self._kind(element_type, fitting_type, part_subtype, shape, is_segment, mode)
        is_segment = kind in (ComponentKind.DUCT_SEGMENT, ComponentKind.PIPE_SEGMENT)

        # Directions
        in_dir = axes[0] if axes else (dir_vec or Vec3(1, 0, 0))
        if is_segment or kind in (ComponentKind.TRANSITION, ComponentKind.CAP,
                                  ComponentKind.VALVE, ComponentKind.DAMPER):
            main_dir = dir_vec or (axes[0] if axes else Vec3(1, 0, 0))
            in_dir = main_dir
            out_dir = main_dir
        else:
            out_dir = axes[1] if len(axes) > 1 else (dir_vec or in_dir)

        branch_dirs = self._branch_dirs(row, kind, axes, in_dir, out_dir)

        # End coordinate for straights.
        end = self._vec(row, "end_x", "end_y", "end_z")
        if end is None:
            length = _num(row.get("centerline_length")) or _num(row.get("path_length"))
            if length is None:
                length = section.nominal_radius * 6 if section else 1000.0
            end = origin + _norm(out_dir).scaled(length)

        return _El(
            eid=eid, row=row, kind=kind, is_segment=is_segment,
            section=section, out_section=out_section,
            origin=origin, end=end,
            in_dir=_norm(in_dir), out_dir=_norm(out_dir),
            branch_dirs=[_norm(b) for b in branch_dirs],
            from_id=_str(row.get("from_element_id")),
            to_id=_str(row.get("to_element_id")),
            branch_id=_str(row.get("branch_to_element_id")),
        )

    def _kind(
        self, element_type: str, fitting_type: str, part_subtype: str,
        shape: DuctShape, is_segment: bool, mode: DesignMode,
    ) -> ComponentKind:
        if is_segment:
            return (ComponentKind.PIPE_SEGMENT if mode is DesignMode.PIPE
                    else ComponentKind.DUCT_SEGMENT)
        if part_subtype in _SPLITTER_SUBTYPES:
            return (ComponentKind.CROSS if "CROSS" in part_subtype
                    else ComponentKind.SPLITTER)
        for key, kind in _FITTING_KIND.items():
            if key in fitting_type:
                return kind
        # Fall back to element_type semantics.
        if element_type in ("TERMINAL", "ACCESSORY"):
            return ComponentKind.CAP
        return (ComponentKind.PIPE_SEGMENT if mode is DesignMode.PIPE
                else ComponentKind.DUCT_SEGMENT)

    @staticmethod
    def _outlet_shape(row: dict, inlet_shape: DuctShape) -> DuctShape:
        """Shape of a transition's outlet section, inferred from the outlet dims
        (``outlet_diameter`` → round, ``outlet_width/height`` → rect) and, failing
        that, the ``family_code`` / ``standard_code`` hint; else the inlet shape."""
        if _num(row.get("outlet_diameter")) is not None:
            return DuctShape.ROUND
        if _num(row.get("outlet_width")) is not None or _num(row.get("outlet_height")) is not None:
            return DuctShape.RECTANGULAR
        hint = (_str(row.get("family_code")) + " " + _str(row.get("standard_code"))).upper()
        if "RECT" in hint and "ROUND" in hint:
            # e.g. TRANSITION_RECT_ROUND: inlet rect, outlet round.
            return DuctShape.ROUND
        return inlet_shape

    def _section(self, row: dict, shape: DuctShape, prefix: str) -> _Section:
        def g(name: str) -> float | None:
            key = f"{prefix}_{name}" if prefix else name
            return _num(row.get(key))

        if shape is DuctShape.ROUND:
            d = g("diameter") or _num(row.get("diameter")) or 0.0
            return _Section(shape=DuctShape.ROUND, diameter=d)
        if shape in (DuctShape.OVAL, DuctShape.FLAT_OVAL):
            major = _num(row.get("major_axis")) or g("width") or 0.0
            minor = _num(row.get("minor_axis")) or g("height") or 0.0
            return _Section(shape=shape, major=major, minor=minor,
                            width=major, height=minor)
        w = g("width") or _num(row.get("width")) or 0.0
        h = g("height") or _num(row.get("height")) or 0.0
        return _Section(shape=DuctShape.RECTANGULAR, width=w, height=h)

    @staticmethod
    def _fallback_branch(main: Vec3) -> Vec3:
        candidate = Vec3(-main.y, main.x, 0.0)
        if candidate.length() <= 1e-9:
            return Vec3(1.0, 0.0, 0.0)
        return _norm(candidate)

    def _branch_dirs(
        self, row: dict, kind: ComponentKind, axes: list[Vec3],
        in_dir: Vec3, out_dir: Vec3,
    ) -> list[Vec3]:
        """Resolve branch arm directions, most explicit signal first.

        1. ``orientation_code`` axes (in/out/branch...) — authoritative when present.
        2. ``branch_b_side`` / ``branch_c_side`` mapped to world axes (v2 complex
           splitters / double-branch parts authored by side instead of axis codes).
        3. an angled fallback off the run (wye/lateral honour ``branch_angle_deg``).
        """
        sides = [
            self._side_axis(_str(row.get("branch_b_side"))),
            self._side_axis(_str(row.get("branch_c_side"))),
        ]
        angle = _num(row.get("branch_angle_deg"))
        if angle is None:
            angle = _num(row.get("angle_deg"))

        # An explicit orientation-code branch axis is the authored direction itself,
        # so it is returned verbatim; only the side-keyword / fallback path is angled
        # off the run (where the side is a reference, not the final direction).
        if kind is ComponentKind.TAP:
            if len(axes) > 1:
                return [axes[1]]
            side = sides[0] or self._fallback_branch(in_dir)
            return [self._angled_branch(in_dir, side, angle, kind)]
        if kind in (ComponentKind.TEE, ComponentKind.WYE):
            if len(axes) > 2:
                return [axes[2]]
            side = sides[0] or self._fallback_branch(in_dir)
            return [self._angled_branch(out_dir, side, angle, kind)]
        # CROSS / SPLITTER: two (or more) arms.
        if len(axes) > 1:
            return list(axes[1:])
        resolved = [s for s in sides if s is not None]
        if resolved:
            return resolved
        fb = self._fallback_branch(in_dir)
        return [fb, fb.scaled(-1)]

    @staticmethod
    def _side_axis(side: str) -> Vec3 | None:
        return _SIDE_AXIS.get(side.strip().upper())

    @staticmethod
    def _angled_branch(
        run: Vec3, side: Vec3, angle: float | None, kind: ComponentKind
    ) -> Vec3:
        """Branch direction at ``angle`` off the ``run`` toward ``side``.

        A tee defaults to a perpendicular (90°) branch; a wye/lateral to 45°.
        ``angle`` (``branch_angle_deg``) overrides the default when supplied.
        """
        run = _norm(run)
        side = _norm(side)
        default = 45.0 if kind is ComponentKind.WYE else 90.0
        theta = math.radians(angle if angle is not None else default)
        if abs(theta - math.pi / 2.0) <= 1e-6:
            return side
        return _norm(run.scaled(math.cos(theta)) + side.scaled(math.sin(theta)))

    @staticmethod
    def _vec(row: dict, *keys: str) -> Vec3 | None:
        vals = [_num(row.get(k)) for k in keys]
        if all(v is None for v in vals):
            return None
        return Vec3(vals[0] or 0.0, vals[1] or 0.0, vals[2] or 0.0)

    # -- trimming -------------------------------------------------------------
    def _trim_segment(self, el: _El, by_id: dict[str, _El]) -> None:
        start, end = el.origin, el.end
        span = end - start
        length = span.length()
        if length <= 1e-9:
            el.start_face, el.end_face = start, end
            return
        unit = span.scaled(1.0 / length)

        start_clear = self._neighbor_clearance(el, by_id.get(el.from_id), at_start=True)
        end_clear = self._neighbor_clearance(el, by_id.get(el.to_id), at_start=False)
        total = start_clear + end_clear
        if total > length * 0.9 and total > 0:
            scale = (length * 0.9) / total
            start_clear *= scale
            end_clear *= scale
        el.start_face = start + unit.scaled(start_clear)
        el.end_face = end - unit.scaled(end_clear)

    def _neighbor_clearance(
        self, seg: _El, neighbor: _El | None, at_start: bool
    ) -> float:
        if neighbor is None or neighbor.kind not in _CORNER_KINDS:
            return 0.0
        sec = neighbor.section
        radius = sec.nominal_radius
        if neighbor.kind is ComponentKind.ELBOW:
            return elbow_bend_radius(_as_cross(sec))
        # Is this segment on the neighbour's branch or its run?
        on_branch = neighbor.branch_id and neighbor.branch_id == seg.eid
        if neighbor.kind in (ComponentKind.TEE, ComponentKind.WYE):
            if on_branch:
                return max(radius * 4.0, 300.0)
            return max(radius * 5.0, 400.0) / 2.0
        if neighbor.kind in (ComponentKind.CROSS, ComponentKind.SPLITTER, ComponentKind.TAP):
            return max(radius * 4.0, 300.0)
        return radius

    # -- scene element emission ----------------------------------------------
    def _to_scene_element(self, el: _El, by_id: dict[str, _El]) -> SceneElement:
        if el.is_segment:
            return self._segment_element(el)
        if el.kind is ComponentKind.ELBOW:
            return self._elbow_element(el)
        if el.kind in (ComponentKind.TEE, ComponentKind.WYE, ComponentKind.TAP):
            return self._branch_element(el, single=True)
        if el.kind in (ComponentKind.CROSS, ComponentKind.SPLITTER):
            return self._branch_element(el, single=False)
        if el.kind is ComponentKind.TRANSITION:
            return self._transition_element(el)
        if el.kind is ComponentKind.CAP:
            return self._cap_element(el)
        if el.kind in (ComponentKind.VALVE, ComponentKind.DAMPER):
            return self._inline_element(el)
        return self._segment_element(el)

    def _segment_element(self, el: _El) -> SceneElement:
        sec = el.section
        start, end = el.start_face, el.end_face
        length = (end - start).length()
        params: dict = {
            "start": list(start.as_tuple()),
            "end": list(end.as_tuple()),
            "direction": _unit_list(el.out_dir),
        }
        params.update(_shape_params(sec))
        joints = [
            self._joint(el, "start", start, _unit_list((start - end)), el.from_id),
            self._joint(el, "end", end, _unit_list((end - start)), el.to_id),
        ]
        return SceneElement(
            id=el.eid, kind=el.kind, params=params,
            color=_PALETTE.get(el.kind, "#cccccc"),
            user_data=self._user_data(el, length_mm=length),
            joints=joints,
        )

    def _elbow_element(self, el: _El) -> SceneElement:
        sec = el.section
        corner = el.origin
        leg = elbow_bend_radius(_as_cross(sec))
        in_face = corner - el.in_dir.scaled(leg)
        out_face = corner + el.out_dir.scaled(leg)
        params: dict = {
            "position": list(corner.as_tuple()),
            "radius": sec.nominal_radius,
            "bendRadius": leg,
            "inDirection": _unit_list(el.in_dir),
            "outDirection": _unit_list(el.out_dir),
            "direction": _unit_list(el.out_dir),
        }
        if sec.shape is not DuctShape.ROUND:
            params.update({"width": sec.width or sec.major, "height": sec.height or sec.minor})
        arc = _elbow_arc_length(el.in_dir, el.out_dir, leg)
        joints = [
            self._joint(el, "in", in_face, _unit_list(el.in_dir.scaled(-1)), el.from_id),
            self._joint(el, "out", out_face, _unit_list(el.out_dir), el.to_id),
        ]
        return SceneElement(
            id=el.eid, kind=ComponentKind.ELBOW, params=params,
            color=_PALETTE[ComponentKind.ELBOW],
            user_data=self._user_data(el, length_mm=arc),
            joints=joints,
        )

    def _branch_element(self, el: _El, single: bool) -> SceneElement:
        sec = el.section
        corner = el.origin
        radius = sec.nominal_radius
        run_len = max(radius * 5.0, 400.0)
        branch_len = max(radius * 4.0, 300.0)
        branch_sec = self._branch_section(el)

        through = el.kind in (ComponentKind.TEE, ComponentKind.WYE)
        params: dict = {
            "position": list(corner.as_tuple()),
            "radius": radius,
            "direction": _unit_list(el.out_dir),
            "mainDirection": _unit_list(el.out_dir),
            "inDirection": _unit_list(el.in_dir),
            "runLength": run_len,
            "branchLength": branch_len,
            "through": through,
        }
        subtype = _str(el.row.get("part_subtype"))
        if subtype:
            params["partSubtype"] = subtype
        params.update(_shape_params(sec))
        joints: list[JointPort] = []
        branches: list[dict] = []

        if single and el.kind is not ComponentKind.TAP:
            # Through-run tee/wye: in + out along the run axis.
            in_face = corner - el.out_dir.scaled(run_len / 2.0)
            out_face = corner + el.out_dir.scaled(run_len / 2.0)
            joints.append(self._joint(el, "in", in_face, _unit_list(el.out_dir.scaled(-1)), el.from_id))
            joints.append(self._joint(el, "out", out_face, _unit_list(el.out_dir), el.to_id))
        else:
            # Tap / splitter: a single inlet stub along the in axis.
            in_face = corner - el.in_dir.scaled(branch_len / 2.0)
            joints.append(self._joint(el, "in", in_face, _unit_list(el.in_dir.scaled(-1)), el.from_id))

        for i, bdir in enumerate(el.branch_dirs):
            bface = corner + bdir.scaled(branch_len)
            branch = {
                "direction": _unit_list(bdir),
                "length": branch_len,
                "role": "branch",
            }
            branch.update(_branch_shape_params(branch_sec))
            branches.append(branch)
            if single:
                neighbor = el.branch_id if i == 0 else ""
            else:
                # Multi-branch (cross/splitter): map arms to to_element then
                # branch_to_element so both read as connected.
                neighbor = [el.to_id, el.branch_id][i] if i < 2 else ""
            joints.append(self._joint(el, f"branch{i}" if i else "branch",
                                      bface, _unit_list(bdir), neighbor))
        params["branches"] = branches
        # Keep legacy single-branch keys so older renderers still work.
        if el.branch_dirs:
            params["branchDirection"] = _unit_list(el.branch_dirs[0])
        if _num(el.row.get("branch_angle_deg")) is not None:
            params["branchAngleDeg"] = _num(el.row.get("branch_angle_deg"))

        kind = el.kind
        return SceneElement(
            id=el.eid, kind=kind, params=params,
            color=_PALETTE.get(kind, "#5cb88a"),
            user_data=self._user_data(el, length_mm=run_len if single else branch_len),
            joints=joints,
        )

    def _transition_element(self, el: _El) -> SceneElement:
        from_sec = el.section
        to_sec = el.out_section
        start = el.origin
        end = el.end if (el.end - el.origin).length() > 1e-6 else \
            el.origin + el.out_dir.scaled(max(from_sec.nominal_radius * 4, 300.0))
        params: dict = {
            "start": list(start.as_tuple()),
            "end": list(end.as_tuple()),
            "direction": _unit_list(end - start),
        }
        params.update(_section_params("from", from_sec))
        params.update(_section_params("to", to_sec))
        joints = [
            self._joint(el, "in", start, _unit_list(start - end), el.from_id),
            self._joint(el, "out", end, _unit_list(end - start), el.to_id),
        ]
        return SceneElement(
            id=el.eid, kind=ComponentKind.TRANSITION, params=params,
            color=_PALETTE[ComponentKind.TRANSITION],
            user_data=self._user_data(el, length_mm=(end - start).length()),
            joints=joints,
        )

    def _cap_element(self, el: _El) -> SceneElement:
        sec = el.section
        thickness = max(sec.nominal_radius * 0.12, 25.0)
        start = el.origin
        end = el.origin + el.in_dir.scaled(thickness)
        params: dict = {
            "start": list(start.as_tuple()),
            "end": list(end.as_tuple()),
            "direction": _unit_list(el.in_dir),
        }
        params.update(_shape_params(sec))
        joints = [self._joint(el, "in", start, _unit_list(el.in_dir.scaled(-1)), el.from_id)]
        return SceneElement(
            id=el.eid, kind=ComponentKind.CAP, params=params,
            color=_PALETTE[ComponentKind.CAP],
            user_data=self._user_data(el, length_mm=thickness),
            joints=joints,
        )

    def _inline_element(self, el: _El) -> SceneElement:
        sec = el.section
        radius = sec.nominal_radius
        center = el.origin
        half = max(radius * 3.0, 300.0) / 2.0
        params: dict = {
            "position": list(center.as_tuple()),
            "radius": radius,
            "direction": _unit_list(el.out_dir),
            "bodyLength": half * 2.0,
            "bladeThickness": max(min(radius * 0.08, 30.0), 8.0),
        }
        params.update(_shape_params(sec))
        in_face = center - el.out_dir.scaled(half)
        out_face = center + el.out_dir.scaled(half)
        joints = [
            self._joint(el, "in", in_face, _unit_list(el.out_dir.scaled(-1)), el.from_id),
            self._joint(el, "out", out_face, _unit_list(el.out_dir), el.to_id),
        ]
        return SceneElement(
            id=el.eid, kind=el.kind, params=params,
            color=_PALETTE.get(el.kind, "#d59a4f"),
            user_data=self._user_data(el, length_mm=half * 2.0),
            joints=joints,
        )

    def _branch_section(self, el: _El) -> _Section:
        bw = _num(el.row.get("branch_width"))
        bh = _num(el.row.get("branch_height"))
        bd = _num(el.row.get("branch_diameter"))
        if bd is not None:
            return _Section(shape=DuctShape.ROUND, diameter=bd)
        if bw is not None or bh is not None:
            return _Section(shape=DuctShape.RECTANGULAR, width=bw or el.section.width,
                            height=bh or el.section.height)
        return el.section

    # -- joints & metadata ----------------------------------------------------
    def _joint(
        self, el: _El, role: str, position: Vec3, direction: list[float], neighbor_id: str
    ) -> JointPort:
        if neighbor_id:
            no = "J-" + "_".join(sorted([el.eid, neighbor_id]))
        else:
            no = f"{el.eid}-{role.upper()}"
        return JointPort(
            id=f"{el.eid}-{role}", no=no,
            position=list(position.as_tuple()),
            direction=direction, role=role, open=False,
        )

    def _user_data(self, el: _El, length_mm: float) -> dict[str, str]:
        row = el.row
        name_ko = _str(row.get("part_name_ko"))
        name_en = _str(row.get("part_name_en"))
        spec = _str(row.get("spec_code")) or _str(row.get("material_code"))
        data: dict[str, str] = {
            "elementId": el.eid,
            "seq": _str(row.get("seq")),
            "lineId": _str(row.get("line_id")),
            "systemId": _str(row.get("system_id")),
            "service": _str(row.get("service")),
            "itemNo": _str(row.get("bom_item_no")) or el.eid,
            "drawingNo": _str(row.get("line_id")),
            "fittingNo": _str(row.get("family_code")),
            "jointNo": _str(row.get("element_id")),
            "spec": spec,
            "familyCode": _str(row.get("family_code")),
            "shape": el.section.shape.value,
            "material": _str(row.get("material_code")),
            "partType": _str(row.get("family_code")).lower(),
            "description": name_ko or name_en or el.kind.value,
            "partNameKo": name_ko,
            "partNameEn": name_en,
            "reviewStatus": _str(row.get("review_status")),
            "length_mm": str(round(length_mm, 1)),
        }
        note = _str(row.get("note"))
        if note:
            data["note"] = note
        return {k: v for k, v in data.items() if v != ""}

    def _error_marker(self, d: dict, eid: str) -> SceneElement:
        pos: Vec3 = d["position"]
        return SceneElement(
            id=eid, kind=ComponentKind.ERROR_MARKER,
            params={"position": list(pos.as_tuple())},
            color=_PALETTE[ComponentKind.ERROR_MARKER],
            user_data={"itemNo": d.get("code", "ERR"), "description": d["message"],
                       "desc": d["message"]},
            joints=[],
        )


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
class _RowError(Exception):
    def __init__(self, diag: dict) -> None:
        self.diag = diag
        super().__init__(diag.get("message", "row error"))


def _diag(level: str, code: str, eid: str, message: str, *, suggestion: str = "",
          position: Vec3 | None = None) -> dict:
    return {"level": level, "code": code, "seq": eid, "message": message,
            "suggestion": suggestion, "position": position}


def _as_cross(sec: _Section):
    """Adapt a v2 _Section to the CrossSection shape ``elbow_bend_radius`` reads."""
    from ..domain.components import CrossSection
    if sec.shape is DuctShape.ROUND:
        return CrossSection(shape=DuctShape.ROUND, outer_diameter=sec.diameter)
    return CrossSection(shape=DuctShape.RECTANGULAR,
                        width=sec.width or sec.major, height=sec.height or sec.minor)


def _shape_params(sec: _Section) -> dict:
    if sec.shape is DuctShape.ROUND:
        return {"shape": "round", "radius": sec.diameter / 2.0}
    if sec.shape in (DuctShape.OVAL, DuctShape.FLAT_OVAL):
        return {"shape": sec.shape.value, "majorAxis": sec.major, "minorAxis": sec.minor,
                "width": sec.major, "height": sec.minor}
    return {"shape": "rectangular", "width": sec.width, "height": sec.height}


def _branch_shape_params(sec: _Section) -> dict:
    if sec.shape is DuctShape.ROUND:
        return {"radius": sec.diameter / 2.0}
    return {"width": sec.width, "height": sec.height}


def _section_params(prefix: str, sec: _Section) -> dict:
    if sec.shape is DuctShape.ROUND:
        return {f"{prefix}Shape": "round", f"{prefix}Radius": sec.diameter / 2.0,
                f"{prefix}Width": 0.0, f"{prefix}Height": 0.0}
    if sec.shape in (DuctShape.OVAL, DuctShape.FLAT_OVAL):
        return {f"{prefix}Shape": sec.shape.value,
                f"{prefix}Radius": max(sec.major, sec.minor) / 2.0,
                f"{prefix}Width": sec.major, f"{prefix}Height": sec.minor}
    return {f"{prefix}Shape": "rectangular", f"{prefix}Radius": 0.0,
            f"{prefix}Width": sec.width, f"{prefix}Height": sec.height}


def _elbow_arc_length(in_dir: Vec3, out_dir: Vec3, bend: float) -> float:
    cos_t = max(-1.0, min(1.0, _dot(_norm(in_dir), _norm(out_dir))))
    theta = math.acos(cos_t)
    if theta <= 1e-6:
        return 0.0
    r_centerline = bend * math.tan((math.pi - theta) / 2.0)
    return r_centerline * theta


def _dot(a: Vec3, b: Vec3) -> float:
    return a.x * b.x + a.y * b.y + a.z * b.z
