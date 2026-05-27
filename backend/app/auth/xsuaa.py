from __future__ import annotations
import logging
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..repositories.user_repository import UserRepository
from ..schemas.user import UserCreate
from ..config import env_settings
from .context import CallerContext

logger = logging.getLogger(__name__)

try:
    from sap.xssec.security_context import SecurityContext as _SecurityContext
    _xssec = _SecurityContext
except ImportError:
    logger.warning(
        "sap-xssec not installed — AUTH_MODE=real is unavailable. "
        "Set AUTH_MODE=fake for local development."
    )
    _xssec = None

_SCOPE_LEVELS: dict[str, list[str]] = {
    "Viewer": ["TicketRead"],
    "Support": ["TicketRead", "TicketWrite"],
    "Agent": ["TicketRead", "TicketWrite", "Agent"],
    "Admin": ["TicketRead", "TicketWrite", "Agent", "Admin"],
}


def _scopes_from_token(token_info: dict) -> list[str]:
    xsappname = env_settings.xsuaa_xsappname
    result: list[str] = []
    for raw_scope in token_info.get("scope", []):
        suffix = raw_scope.split(".")[-1]
        if raw_scope.startswith(xsappname) and suffix in _SCOPE_LEVELS:
            result = _SCOPE_LEVELS[suffix]
    return result


async def get_caller_xsuaa(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> CallerContext:
    if _xssec is None:
        raise HTTPException(
            status_code=503,
            detail="XSUAA auth unavailable — sap-xssec not installed",
        )
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = auth_header[len("Bearer "):]
    try:
        sc = _xssec(
            token,
            {
                "url": env_settings.xsuaa_url,
                "clientid": env_settings.xsuaa_client_id,
                "clientsecret": env_settings.xsuaa_client_secret,
                "xsappname": env_settings.xsuaa_xsappname,
            },
        )
    except Exception as exc:
        logger.warning("auth.xsuaa: token validation failed — %s", exc)
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    email: str = (sc.get_email() or sc.get_logon_name() or "").lower()
    name: str = sc.get_given_name() or email

    repo = UserRepository(session)
    user = await repo.get_by_email(email)
    if user is None:
        logger.info("auth.xsuaa: auto-provisioning new user email=%r", email)
        user = await repo.create(UserCreate(email=email, name=name, role="requester"))

    token_info = getattr(sc, "token_info", {}) or {}
    scopes = _scopes_from_token(token_info)
    logger.debug("auth.xsuaa: authenticated email=%r scopes=%s", user.email, scopes)
    return CallerContext(user_id=user.id, email=user.email, name=user.name, scopes=scopes)
