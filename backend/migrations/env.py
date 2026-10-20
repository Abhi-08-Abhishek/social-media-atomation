import asyncio
import sys
from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import get_settings

url = make_url(get_settings().database_url.get_secret_value()).set(drivername="postgresql+psycopg")
url = url.difference_update_query(["schema", "pgbouncer", "connection_limit", "pool_timeout"])


def migrate(connection):
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()


async def online():
    engine = create_async_engine(url, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(migrate)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=url, target_metadata=None, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop if sys.platform == "win32" else asyncio.new_event_loop) as runner:
        runner.run(online())
