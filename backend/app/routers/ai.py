from __future__ import annotations
from collections import defaultdict
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..models.incident import Incident
from ..models.incident_event import IncidentEvent as IncidentEventModel
from ..repositories.incident_repository import IncidentRepository
from ..repositories.app_settings_repository import AppSettingsRepository
from ..repositories.user_repository import UserRepository
from ..services.ai_service import AIService
from ..config import app_config
from ..utils import utcnow

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _build_ai_service(settings) -> AIService | None:
    if not settings or not settings.ai_enabled:
        return None
    if not settings.openrouter_api_key:
        return None
    return AIService(
        api_key=settings.openrouter_api_key,
        model=settings.openrouter_model or "openai/gpt-4o-mini",
    )


@router.get("/status")
async def get_ai_status(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    repo = AppSettingsRepository(session)
    settings = await repo.get()
    return {
        "ai_enabled": bool(settings and settings.ai_enabled),
        "model": (settings.openrouter_model or "openai/gpt-4o-mini") if settings else "openai/gpt-4o-mini",
        "has_key": bool(settings and settings.openrouter_api_key),
    }


@router.patch("/settings")
async def patch_ai_settings(
    body: dict,
    caller: CallerContext = require_scope("Admin"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    allowed = {"ai_enabled", "openrouter_api_key", "openrouter_model"}
    fields = {k: v for k, v in body.items() if k in allowed}
    repo = AppSettingsRepository(session)
    await repo.update(fields)
    settings = await repo.get()
    return {
        "ai_enabled": bool(settings and settings.ai_enabled),
        "model": settings.openrouter_model if settings else None,
        "has_key": bool(settings and settings.openrouter_api_key),
    }


@router.get("/sla-risk")
async def get_sla_risk(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> list:
    repo = IncidentRepository(session)
    await repo.mark_overdue_sla_breached()
    incidents = await repo.get_sla_risk_incidents()
    now = utcnow()
    result = []
    for inc in incidents:
        if inc.sla_breached:
            risk = 1.0
        elif inc.sla_resolution_due:
            total = (inc.sla_resolution_due - inc.created_at).total_seconds()
            elapsed = (now - inc.created_at).total_seconds()
            risk = min(elapsed / total, 1.0) if total > 0 else 0.0
        else:
            risk = 0.0
        if risk < 0.4 and not inc.sla_breached:
            continue
        result.append({
            "id": inc.id,
            "number": inc.number,
            "title": inc.title,
            "priority": inc.priority,
            "state": inc.state,
            "sla_due": inc.sla_resolution_due.isoformat() if inc.sla_resolution_due else None,
            "sla_breached": inc.sla_breached,
            "risk_score": round(risk, 3),
        })
    result.sort(key=lambda x: x["risk_score"], reverse=True)
    return result[:20]


@router.get("/anomalies")
async def get_anomalies(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> list:
    repo = IncidentRepository(session)
    incidents = await repo.get_recent_incidents_for_analytics(hours=168)
    now = utcnow()
    two_hours_ago = now - timedelta(hours=2)

    recent: dict[str, int] = defaultdict(int)
    historical: dict[str, int] = defaultdict(int)
    for inc in incidents:
        historical[inc.category] += 1
        if inc.created_at >= two_hours_ago:
            recent[inc.category] += 1

    anomalies = []
    for category, count in recent.items():
        expected = max(historical[category] / 84.0, 0.5)
        ratio = count / expected
        if ratio >= 2.5:
            anomalies.append({
                "category": category,
                "recent_count": count,
                "expected_count": round(expected, 1),
                "ratio": round(ratio, 1),
                "severity": "critical" if ratio >= 5 else "high" if ratio >= 3.5 else "medium",
            })
    anomalies.sort(key=lambda x: x["ratio"], reverse=True)
    return anomalies


@router.get("/forecast")
async def get_forecast(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    repo = IncidentRepository(session)
    incidents = await repo.get_recent_incidents_for_analytics(hours=24 * 21)
    now = utcnow()

    dates, counts = [], []
    for i in range(13, -1, -1):
        day_end = now - timedelta(days=i)
        day_start = now - timedelta(days=i + 1)
        dates.append((now - timedelta(days=i)).strftime("%Y-%m-%d"))
        counts.append(sum(1 for inc in incidents if day_start <= inc.created_at < day_end))

    n = len(counts)
    x_mean = (n - 1) / 2
    y_mean = sum(counts) / n
    num = sum((i - x_mean) * (c - y_mean) for i, c in enumerate(counts))
    den = sum((i - x_mean) ** 2 for i in range(n))
    slope = num / den if den else 0
    intercept = y_mean - slope * x_mean

    forecast_dates, forecast_counts = [], []
    for i in range(1, 8):
        forecast_dates.append((now + timedelta(days=i)).strftime("%Y-%m-%d"))
        forecast_counts.append(max(0, round(intercept + slope * (n + i - 1))))

    return {
        "historical_dates": dates,
        "historical_counts": counts,
        "forecast_dates": forecast_dates,
        "forecast_counts": forecast_counts,
        "trend": "up" if slope > 0.1 else "down" if slope < -0.1 else "stable",
        "slope": round(slope, 3),
    }


@router.get("/agent-workload")
async def get_agent_workload(
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
) -> list:
    inc_repo = IncidentRepository(session)
    user_repo = UserRepository(session)

    resolved_rows = await inc_repo.get_resolved_for_agent_stats(days=30)
    open_rows = await inc_repo.get_agent_open_counts()
    agents = await user_repo.list_by_role("agent")

    open_map: dict[str, int] = {str(r.assignee_id): r.count for r in open_rows}
    agent_cat_times: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in resolved_rows:
        if row.resolved_at and row.created_at:
            h = (row.resolved_at - row.created_at).total_seconds() / 3600
            agent_cat_times[str(row.assignee_id)][row.category].append(h)

    result = []
    for agent in agents:
        aid = str(agent.id)
        cat_avgs = {
            cat: round(sum(times) / len(times), 1)
            for cat, times in agent_cat_times.get(aid, {}).items()
        }
        total_res = sum(len(t) for t in agent_cat_times.get(aid, {}).values())
        all_hours = [h for t in agent_cat_times.get(aid, {}).values() for h in t]
        result.append({
            "id": aid,
            "name": agent.name,
            "email": agent.email,
            "open_count": open_map.get(aid, 0),
            "resolved_last_30d": total_res,
            "avg_hours_by_category": cat_avgs,
            "overall_avg_hours": round(sum(all_hours) / len(all_hours), 1) if all_hours else 0,
        })
    result.sort(key=lambda x: x["open_count"])
    return result


@router.post("/test-connection")
async def test_connection(
    caller: CallerContext = require_scope("Admin"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    import time
    settings = await AppSettingsRepository(session).get()
    if not settings or not settings.openrouter_api_key:
        raise HTTPException(status_code=400, detail="No API key configured")
    svc = AIService(
        api_key=settings.openrouter_api_key,
        model=settings.openrouter_model or "openai/gpt-4o-mini",
    )
    start = time.monotonic()
    try:
        result = await svc._chat(
            system="You are a test assistant. Reply with valid JSON only.",
            user='Reply with exactly: {"ok": true}',
        )
        latency_ms = round((time.monotonic() - start) * 1000)
        return {"ok": True, "model": svc.model, "latency_ms": latency_ms, "response": result[:80]}
    except Exception as exc:
        latency_ms = round((time.monotonic() - start) * 1000)
        return {"ok": False, "model": svc.model, "latency_ms": latency_ms, "error": str(exc)[:200]}


@router.post("/classify")
async def classify_incident(
    body: dict,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")
    title = str(body.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    try:
        return await svc.classify_incident(
            title=title,
            description=str(body.get("description", "")),
            categories=app_config.categories,
            priority_names=[p.name for p in app_config.priorities],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@router.get("/incidents/{incident_id}/similar")
async def get_similar_incidents(
    incident_id: str,
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> list:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")

    res = await session.execute(select(Incident).where(Incident.id == incident_id))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc_repo = IncidentRepository(session)
    resolved = await inc_repo.get_recent_resolved_with_notes(limit=30)
    resolved_dicts = [
        {"id": r.id, "number": r.number, "title": r.title, "resolution_notes": r.resolution_notes}
        for r in resolved if r.id != incident_id
    ]
    try:
        return await svc.find_similar_incidents(
            description=incident.description or incident.title,
            resolved_incidents=resolved_dicts,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@router.post("/suggest-assignee")
async def suggest_assignee(
    body: dict,
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")

    category = str(body.get("category", ""))
    priority = int(body.get("priority", 2))
    priority_name = app_config.priorities[priority].name if 0 <= priority < len(app_config.priorities) else "Unknown"

    inc_repo = IncidentRepository(session)
    user_repo = UserRepository(session)
    resolved_rows = await inc_repo.get_resolved_for_agent_stats(days=30)
    open_rows = await inc_repo.get_agent_open_counts()
    agents = await user_repo.list_by_role("agent")

    open_map = {str(r.assignee_id): r.count for r in open_rows}
    agent_cat_times: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in resolved_rows:
        if row.resolved_at and row.created_at:
            h = (row.resolved_at - row.created_at).total_seconds() / 3600
            agent_cat_times[str(row.assignee_id)][row.category].append(h)

    agent_stats = []
    for agent in agents:
        aid = str(agent.id)
        cat_avgs = {
            cat: round(sum(t) / len(t), 1)
            for cat, t in agent_cat_times.get(aid, {}).items()
        }
        all_hours = [h for t in agent_cat_times.get(aid, {}).values() for h in t]
        agent_stats.append({
            "id": aid,
            "name": agent.name,
            "open_count": open_map.get(aid, 0),
            "resolved_last_30d": sum(len(t) for t in agent_cat_times.get(aid, {}).values()),
            "avg_hours_by_category": cat_avgs,
            "overall_avg_hours": round(sum(all_hours) / len(all_hours), 1) if all_hours else 0,
        })

    try:
        return await svc.suggest_assignee(
            category=category,
            priority_name=priority_name,
            agent_stats=agent_stats,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


async def _load_content_events(incident_id: str, session: AsyncSession) -> list[dict]:
    res = await session.execute(
        select(IncidentEventModel)
        .where(IncidentEventModel.incident_id == incident_id)
        .where(IncidentEventModel.event_type.in_(["comment", "work_note"]))
        .order_by(IncidentEventModel.created_at)
    )
    return [
        {"type": e.event_type, "body": e.body or ""}
        for e in res.scalars()
        if e.body
    ]


@router.post("/incidents/{incident_id}/summarize")
async def summarize_incident(
    incident_id: str,
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")
    res = await session.execute(select(Incident).where(Incident.id == incident_id))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    events = await _load_content_events(incident_id, session)
    try:
        return await svc.summarize_thread(title=incident.title, events=events)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@router.post("/incidents/{incident_id}/draft-reply")
async def draft_reply(
    incident_id: str,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")
    res = await session.execute(select(Incident).where(Incident.id == incident_id))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    events = await _load_content_events(incident_id, session)
    try:
        return await svc.draft_reply(title=incident.title, state=incident.state, events=events)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@router.post("/incidents/{incident_id}/draft-resolution")
async def draft_resolution(
    incident_id: str,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")
    res = await session.execute(select(Incident).where(Incident.id == incident_id))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    events = await _load_content_events(incident_id, session)
    try:
        return await svc.draft_resolution(
            title=incident.title,
            description=incident.description or "",
            events=events,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@router.post("/handoff-report")
async def handoff_report(
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    settings = await AppSettingsRepository(session).get()
    svc = _build_ai_service(settings)
    if not svc:
        raise HTTPException(status_code=503, detail="AI features are disabled or not configured")
    open_states = ["new", "assigned", "in_progress", "on_hold"]
    res = await session.execute(
        select(Incident)
        .where(Incident.state.in_(open_states))
        .options(selectinload(Incident.assignee))
        .order_by(Incident.priority.asc(), Incident.sla_breached.desc(), Incident.created_at.asc())
        .limit(50)
    )
    incidents = res.scalars().all()
    priority_names = [p.name for p in app_config.priorities]
    open_incidents = [
        {
            "number": inc.number,
            "title": inc.title,
            "state": inc.state,
            "priority_name": priority_names[inc.priority] if 0 <= inc.priority < len(priority_names) else f"P{inc.priority}",
            "assignee": inc.assignee.name if inc.assignee else None,
            "sla_status": "Breached" if inc.sla_breached else "OK",
        }
        for inc in incidents
    ]
    try:
        return await svc.generate_handoff_report(open_incidents=open_incidents)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")
