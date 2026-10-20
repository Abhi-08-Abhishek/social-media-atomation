"""SQLAlchemy Core maps the existing PostgreSQL schema without recreating any tables."""
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import MetaData, select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.engine import make_url

from app.config import get_settings

metadata = MetaData()
engine = None
_connect_lock = asyncio.Lock()
TABLES = ["User", "Account", "Session", "Campaign", "Post", "AgentPlan", "AgentTask",
          "AgentMessage", "PostMetric", "StrategyReport", "RecommendationDecision", "SocialAccount"]


def now():
    # Prisma's PostgreSQL DateTime columns are timestamp without time zone, storing UTC.
    value = datetime.now(timezone.utc).replace(tzinfo=None)
    # Existing Prisma timestamps have millisecond precision; lease comparisons must match exactly.
    return value.replace(microsecond=(value.microsecond // 1000) * 1000)


async def connect():
    async with _connect_lock:
        await _connect()


async def _connect():
    global engine
    if engine is not None:
        return
    raw = get_settings().database_url.get_secret_value()
    if not raw:
        raise RuntimeError("DATABASE_URL is not configured in backend/.env.")
    url = make_url(raw).set(drivername="postgresql+psycopg")
    schema = url.query.get("schema", "public")
    url = url.difference_update_query(["schema", "pgbouncer", "connection_limit", "pool_timeout"])
    candidate = create_async_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    try:
        async with candidate.connect() as conn:
            await conn.run_sync(lambda sync: metadata.reflect(bind=sync, schema=schema, only=TABLES))
        engine = candidate
    except Exception:
        await candidate.dispose()
        raise


def table(name):
    return next(t for t in metadata.tables.values() if t.name == name)


class Database:
    def __init__(self, connection):
        self.connection = connection

    async def rows(self, statement):
        return [dict(row) for row in (await self.connection.execute(statement)).mappings()]

    async def one(self, statement):
        row = (await self.connection.execute(statement)).mappings().first()
        return dict(row) if row else None

    async def insert(self, name, values):
        t = table(name)
        data = dict(values)
        for key, value in {"id": str(uuid4()), "createdAt": now(), "updatedAt": now()}.items():
            if key in t.c and key not in data:
                data[key] = value
        return await self.one(t.insert().values(**data).returning(t))

    async def update(self, name, condition, values):
        t = table(name)
        if "updatedAt" in t.c:
            values = {**values, "updatedAt": now()}
        return await self.connection.execute(t.update().where(condition).values(**values))


@asynccontextmanager
async def transaction():
    if engine is None:
        await connect()
    async with engine.begin() as connection:
        yield Database(connection)


async def owned_campaign(db, campaign_id, user_id, active=False):
    from fastapi import HTTPException
    t = table("Campaign")
    query = select(t).where(t.c.id == campaign_id, t.c.userId == user_id)
    if active:
        query = query.where(t.c.status == "active")
    campaign = await db.one(query)
    if not campaign:
        raise HTTPException(404, "Campaign not found.")
    return campaign
