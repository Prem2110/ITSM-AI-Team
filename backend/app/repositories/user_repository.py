from __future__ import annotations
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.user import User
from ..schemas.user import UserCreate


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: UserCreate) -> User:
        user = User(
            id=str(uuid.uuid4()),
            email=data.email,
            name=data.name,
            role=data.role,
        )
        self.session.add(user)
        return user

    async def get_by_id(self, user_id: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def list_active(self) -> list[User]:
        result = await self.session.execute(
            select(User).where(User.active.is_(True)).order_by(User.name)
        )
        return list(result.scalars().all())

    async def update(self, user_id: str, fields: dict) -> User | None:
        user = await self.get_by_id(user_id)
        if user is None:
            return None
        for k, v in fields.items():
            setattr(user, k, v)
        return user
