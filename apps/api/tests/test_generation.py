"""End-to-end-ish tests for the generation pipeline (no HTTP layer)."""
from __future__ import annotations

import pytest

from app.domain.enums import ComponentKind, DesignMode
from app.parsing.base import ParseError
from app.api.schemas import SceneDocumentDTO
from app.services.generation_service import GenerationService
from app.specs.repository import InMemorySpecRepository, SpecNotFoundError


@pytest.fixture()
def service() -> GenerationService:
    return GenerationService(specs=InMemorySpecRepository())


def _pipe_rows() -> list[dict]:
    return [
        {"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "joint_no": "JNT-001"},
        {"run_id": "R1", "seq": 2, "x": 1000, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "fitting": "elbow",
         "joint_no": "JNT-002"},
        {"run_id": "R1", "seq": 3, "x": 1000, "y": 0, "z": 800,
         "nominal": "100A", "schedule": "Sch40", "fitting": "valve",
         "joint_no": "JNT-003"},
    ]


def test_pipe_generation_produces_segments_and_fittings(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())
    kinds = [e.kind for e in scene.elements]
    assert kinds.count(ComponentKind.PIPE_SEGMENT) == 2  # 3 nodes -> 2 segments
    assert ComponentKind.ELBOW in kinds
    assert ComponentKind.VALVE in kinds
    assert len(scene.bom) == len(scene.elements)


def test_segment_radius_matches_spec(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())
    seg = next(e for e in scene.elements if e.kind is ComponentKind.PIPE_SEGMENT)
    assert seg.params["radius"] == pytest.approx(114.3 / 2)  # 100A Sch40 OD


def test_pipe_segments_trim_to_fitting_connection_faces(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())
    segments = [e for e in scene.elements if e.kind is ComponentKind.PIPE_SEGMENT]

    bend_radius = 114.3 * 1.5
    valve_clearance = 250 / 2 + 18 / 2

    assert segments[0].params["start"] == pytest.approx([0.0, 0.0, 0.0])
    assert segments[0].params["end"] == pytest.approx([1000 - bend_radius, 0.0, 0.0])
    assert segments[1].params["start"] == pytest.approx([1000.0, 0.0, bend_radius])
    assert segments[1].params["end"] == pytest.approx([1000.0, 0.0, 800 - valve_clearance])


def test_pipe_fittings_include_standard_sizing_and_directions(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())
    elbow = next(e for e in scene.elements if e.kind is ComponentKind.ELBOW)
    valve = next(e for e in scene.elements if e.kind is ComponentKind.VALVE)

    assert elbow.params["radius"] == pytest.approx(114.3 / 2)
    assert elbow.params["bendRadius"] == pytest.approx(114.3 * 1.5)
    assert elbow.params["inDirection"] == pytest.approx([1.0, 0.0, 0.0])
    assert elbow.params["outDirection"] == pytest.approx([0.0, 0.0, 1.0])
    assert valve.params["bodyLength"] >= 250
    assert valve.params["direction"] == pytest.approx([0.0, 0.0, 1.0])


def test_items_have_numbers_and_pipe_joint_ports(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())

    assert [e.item_no for e in scene.elements] == [
        f"FC-{i:03d}" for i in range(1, len(scene.elements) + 1)
    ]
    assert all(e.user_data["itemNo"] == e.item_no for e in scene.elements)
    assert all(row.item_no for row in scene.bom)
    assert all(row.joint_nos for row in scene.bom)

    first_segment = next(e for e in scene.elements if e.id == "R0-SEG000")
    elbow = next(e for e in scene.elements if e.kind is ComponentKind.ELBOW)

    assert len(first_segment.joints) == 2
    assert len(elbow.joints) == 2
    assert first_segment.joints[0].no == "JNT-001"
    assert first_segment.joints[0].open is True
    assert first_segment.joints[1].no == "JNT-002-IN"
    assert first_segment.joints[1].open is False
    assert {j.no for j in elbow.joints} == {"JNT-002-IN", "JNT-002-OUT"}


def test_tee_has_three_joint_ports_with_empty_branch(service: GenerationService) -> None:
    rows = [
        {"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "joint_no": "J-001"},
        {"run_id": "R1", "seq": 2, "x": 1000, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "fitting": "tee",
         "joint_no": "J-002"},
        {"run_id": "R1", "seq": 3, "x": 2000, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "joint_no": "J-003"},
    ]

    scene = service.generate(DesignMode.PIPE, rows)
    tee = next(e for e in scene.elements if e.kind is ComponentKind.TEE)

    assert len(tee.joints) == 3
    assert {j.role for j in tee.joints} == {"in", "out", "branch"}
    assert {j.no for j in tee.joints} == {"J-002-IN", "J-002-OUT", "J-002-BR"}
    assert next(j for j in tee.joints if j.role == "branch").open is True
    assert next(j for j in tee.joints if j.role == "in").open is False
    assert next(j for j in tee.joints if j.role == "out").open is False


def test_scene_dto_exposes_item_numbers_and_joints(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())
    dto = SceneDocumentDTO.from_domain(scene)

    assert dto.elements[0].itemNo == "FC-001"
    assert dto.elements[0].joints[0]["no"] == "JNT-001"
    assert dto.bom[0].itemNo == "FC-001"
    assert "JNT-001" in dto.bom[0].jointNos


def test_pipe_rows_can_use_direction_length_instead_of_xyz(service: GenerationService) -> None:
    rows = [
        {"run_id": "R1", "seq": 1, "joint_no": "J-001",
         "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R1", "seq": 2, "joint_no": "J-002",
         "direction": "E", "length": 1000, "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R1", "seq": 3, "joint_no": "J-003",
         "direction": "U", "length": 500, "nominal": "100A", "schedule": "Sch40"},
    ]

    scene = service.generate(DesignMode.PIPE, rows)
    segments = [e for e in scene.elements if e.kind is ComponentKind.PIPE_SEGMENT]

    assert segments[0].params["start"] == pytest.approx([0.0, 0.0, 0.0])
    assert segments[0].params["end"] == pytest.approx([1000.0, 0.0, 0.0])
    assert segments[1].params["start"] == pytest.approx([1000.0, 0.0, 0.0])
    assert segments[1].params["end"] == pytest.approx([1000.0, 0.0, 500.0])


def test_repeated_joint_number_reuses_existing_position(service: GenerationService) -> None:
    rows = [
        {"run_id": "R1", "seq": 1, "joint_no": "J-A",
         "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R1", "seq": 2, "joint_no": "J-B",
         "direction": "E", "length": 1000, "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R2", "seq": 1, "joint_no": "J-B",
         "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R2", "seq": 2, "joint_no": "J-C",
         "direction": "N", "length": 700, "nominal": "100A", "schedule": "Sch40"},
    ]

    scene = service.generate(DesignMode.PIPE, rows)
    branch_segment = next(e for e in scene.elements if e.id == "R1-SEG000")

    assert branch_segment.params["start"] == pytest.approx([1000.0, 0.0, 0.0])
    assert branch_segment.params["end"] == pytest.approx([1000.0, 700.0, 0.0])


def test_fitting_rotation_is_exposed_and_rectangular_snaps_to_four_directions(
    service: GenerationService,
) -> None:
    pipe_rows = [
        {"run_id": "R1", "seq": 1, "joint_no": "J-001",
         "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R1", "seq": 2, "joint_no": "J-002", "fitting": "tee",
         "direction": "E", "length": 1000, "nominal": "100A", "schedule": "Sch40",
         "rotation": 45},
        {"run_id": "R1", "seq": 3, "joint_no": "J-003",
         "direction": "E", "length": 1000, "nominal": "100A", "schedule": "Sch40"},
    ]
    duct_rows = [
        {"run_id": "D1", "seq": 1, "joint_no": "D-001",
         "shape": "rectangular", "width": 400, "height": 300},
        {"run_id": "D1", "seq": 2, "joint_no": "D-002", "fitting": "damper",
         "direction": "E", "length": 1000, "shape": "rectangular",
         "width": 400, "height": 300, "rotation": 44},
    ]

    tee = next(e for e in service.generate(DesignMode.PIPE, pipe_rows).elements
               if e.kind is ComponentKind.TEE)
    damper = next(e for e in service.generate(DesignMode.DUCT, duct_rows).elements
                  if e.kind is ComponentKind.DAMPER)

    assert tee.params["rollDeg"] == pytest.approx(45)
    assert damper.params["rollDeg"] == pytest.approx(0)


def test_bounds_cover_geometry(service: GenerationService) -> None:
    scene = service.generate(DesignMode.PIPE, _pipe_rows())
    assert scene.bounds_min.x == 0
    assert scene.bounds_max.z == 800


def test_unknown_spec_raises(service: GenerationService) -> None:
    rows = [
        {"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0, "nominal": "999A"},
        {"run_id": "R1", "seq": 2, "x": 100, "y": 0, "z": 0, "nominal": "999A"},
    ]
    with pytest.raises(SpecNotFoundError):
        service.generate(DesignMode.PIPE, rows)


def test_single_node_run_rejected(service: GenerationService) -> None:
    rows = [{"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0, "nominal": "100A"}]
    with pytest.raises(ParseError):
        service.generate(DesignMode.PIPE, rows)


@pytest.mark.parametrize("bad", ["inf", "-inf", "nan", "1e400"])
def test_non_finite_coordinates_rejected(service: GenerationService, bad: str) -> None:
    rows = [
        {"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0, "nominal": "100A"},
        {"run_id": "R1", "seq": 2, "x": bad, "y": 0, "z": 0, "nominal": "100A"},
    ]
    with pytest.raises(ParseError):
        service.generate(DesignMode.PIPE, rows)


def test_non_numeric_seq_does_not_crash(service: GenerationService) -> None:
    rows = [
        {"run_id": "R1", "seq": "abc", "x": 0, "y": 0, "z": 0, "nominal": "100A"},
        {"run_id": "R1", "seq": "nan", "x": 100, "y": 0, "z": 0, "nominal": "100A"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)  # falls back to row order
    assert len(scene.elements) == 1


def test_duct_rectangular_generation(service: GenerationService) -> None:
    rows = [
        {"run_id": "D1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "shape": "rectangular", "width": 400, "height": 300},
        {"run_id": "D1", "seq": 2, "x": 2000, "y": 0, "z": 0,
         "shape": "rectangular", "width": 400, "height": 300},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    seg = scene.elements[0]
    assert seg.kind is ComponentKind.DUCT_SEGMENT
    assert seg.params["width"] == 400


def test_duct_rectangular_to_round_transition(service: GenerationService) -> None:
    rows = [
        {"run_id": "D1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "shape": "rectangular", "width": 400, "height": 300},
        {"run_id": "D1", "seq": 2, "x": 1000, "y": 0, "z": 0,
         "shape": "round", "diameter": 350},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    transition = scene.elements[0]
    assert transition.kind is ComponentKind.TRANSITION
    assert transition.params["fromShape"] == "rectangular"
    assert transition.params["fromWidth"] == 400
    assert transition.params["fromHeight"] == 300
    assert transition.params["toShape"] == "round"
    assert transition.params["toRadius"] == pytest.approx(175)


def test_manual_transition_fitting_has_renderable_span(service: GenerationService) -> None:
    rows = [
        {"run_id": "D1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "shape": "rectangular", "width": 400, "height": 300},
        {"run_id": "D1", "seq": 2, "x": 1000, "y": 0, "z": 0,
         "shape": "round", "diameter": 350, "fitting": "transition"},
        {"run_id": "D1", "seq": 3, "x": 2000, "y": 0, "z": 0,
         "shape": "round", "diameter": 350},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    manual = [e for e in scene.elements if e.kind is ComponentKind.TRANSITION][-1]
    assert "start" in manual.params
    assert "end" in manual.params
    assert manual.params["fromShape"] == "round"
    assert manual.params["toShape"] == "round"
