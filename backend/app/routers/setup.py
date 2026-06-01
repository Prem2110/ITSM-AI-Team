from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.app_settings_repository import AppSettingsRepository
from ..repositories.user_repository import UserRepository
from ..schemas.setup import SetupCompleteRequest, AppSettingsPatch, AppSettingsResponse
from ..schemas.user import UserCreate, UserResponse
from ..utils import utcnow

router = APIRouter(prefix="/api", tags=["setup"])


@router.get("/setup/status")
async def get_setup_status(session: AsyncSession = Depends(get_db)) -> dict:
    settings = await AppSettingsRepository(session).get()
    return {
        "completed": settings is not None,
        "company_name": settings.company_name if settings else None,
    }


@router.post("/setup/complete", status_code=200)
async def complete_setup(
    req: SetupCompleteRequest,
    session: AsyncSession = Depends(get_db),
) -> dict:
    repo = AppSettingsRepository(session)
    if await repo.get() is not None:
        raise HTTPException(status_code=409, detail="Setup already completed")

    user_repo = UserRepository(session)
    admin = await user_repo.create(UserCreate(
        name=req.admin.name,
        email=req.admin.email,
        role="admin",
    ))
    # Flush so admin.id is assigned before referencing it in app_settings
    await session.flush()

    now = utcnow()
    from ..config import app_config as _cfg
    await repo.create({
        "company_name": req.company_name,
        "timezone": req.timezone,
        "sla_targets": req.sla_targets,
        "resolution_codes": req.resolution_codes,
        "categories": req.categories if req.categories else _cfg.categories,
        "setup_completed_at": now,
        "setup_completed_by": admin.id,
        "created_at": now,
        "updated_at": now,
    })

    return {
        "completed": True,
        "admin": UserResponse.model_validate(admin).model_dump(),
    }


@router.get("/settings", response_model=AppSettingsResponse)
async def get_settings(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    settings = await AppSettingsRepository(session).get()
    if settings is None:
        raise HTTPException(status_code=404, detail="App not yet configured")
    return settings


@router.patch("/settings", response_model=AppSettingsResponse)
async def patch_settings(
    req: AppSettingsPatch,
    caller: CallerContext = require_scope("Admin"),
    session: AsyncSession = Depends(get_db),
):
    repo = AppSettingsRepository(session)
    fields = req.model_dump(exclude_none=True)
    if not fields:
        settings = await repo.get()
        if settings is None:
            raise HTTPException(status_code=404, detail="App not yet configured")
        return settings
    settings = await repo.update(fields)
    if settings is None:
        raise HTTPException(status_code=404, detail="App not yet configured")
    return settings
