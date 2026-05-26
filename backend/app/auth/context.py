from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class CallerContext:
    user_id: str
    email: str
    name: str
    scopes: list[str] = field(default_factory=list)
