"""HTTP routes — thin adapters over GenerationService."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from ..domain.enums import DesignMode, ExportFormat
from ..export.base import BackendUnavailableError, ExporterError
from ..parsing.base import ParseError
from ..services.csv_loader import load_csv
from ..services.export_service import ExportService
from ..services.generation_service import GenerationService
from ..services.table_template import build_template_xlsx, load_table
from ..specs.repository import SpecNotFoundError
from .dependencies import get_export_service, get_generation_service
from .schemas import ExportRequest, GenerateRequest, SceneDocumentDTO

router = APIRouter(prefix="/api", tags=["generation"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/generate", response_model=SceneDocumentDTO)
def generate(
    request: GenerateRequest,
    service: GenerationService = Depends(get_generation_service),
) -> SceneDocumentDTO:
    """Generate a Scene Document from JSON table rows."""
    return _run(service, request.mode, request.rows)


@router.post("/generate/csv", response_model=SceneDocumentDTO)
async def generate_from_csv(
    file: UploadFile = File(...),
    mode: DesignMode = Form(DesignMode.PIPE),
    service: GenerationService = Depends(get_generation_service),
) -> SceneDocumentDTO:
    """Generate a Scene Document from an uploaded CSV/Excel export."""
    rows = load_csv(await file.read())
    return _run(service, mode, rows)


_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/template")
def template(mode: DesignMode = DesignMode.PIPE) -> Response:
    """Download an empty Excel (.xlsx) input template for the given mode."""
    content = build_template_xlsx(mode)
    return Response(
        content=content,
        media_type=_XLSX_MEDIA,
        headers={
            "Content-Disposition":
                f'attachment; filename="flowcad_template_{mode.value}.xlsx"'
        },
    )


@router.post("/upload")
async def upload_table(
    file: UploadFile = File(...),
) -> dict[str, list[dict]]:
    """Parse an uploaded .xlsx/.csv into table rows (to populate the editor)."""
    try:
        rows = load_table(file.filename or "upload.csv", await file.read())
    except Exception as exc:  # noqa: BLE001 - surface parse issues to the client
        raise HTTPException(status_code=400,
                            detail=f"파일을 읽을 수 없습니다: {exc}") from exc
    return {"rows": rows}


@router.get("/export/formats")
def export_formats(
    service: ExportService = Depends(get_export_service),
) -> dict[str, bool]:
    """Report which export backends are installed (drives the UI buttons)."""
    return service.availability()


@router.post("/export")
def export(
    request: ExportRequest,
    service: ExportService = Depends(get_export_service),
) -> Response:
    """Generate a scene from rows and stream back the exported CAD/BIM file."""
    try:
        result = service.export(request.mode, request.rows, request.format)
    except SpecNotFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BackendUnavailableError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ExporterError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(
        content=result.content,
        media_type=result.media_type,
        headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
    )


def _run(service: GenerationService, mode: DesignMode, rows: list[dict]) -> SceneDocumentDTO:
    try:
        scene = service.generate(mode, rows)
    except SpecNotFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SceneDocumentDTO.from_domain(scene)
