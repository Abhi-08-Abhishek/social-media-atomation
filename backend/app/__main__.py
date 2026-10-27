import asyncio
import sys
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

from app.worker import run as run_worker


def migrate_database():
    command.upgrade(Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head")


async def run():
    server = asyncio.create_task(uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=8005)).serve())
    worker = asyncio.create_task(run_worker())
    done, pending = await asyncio.wait({server, worker}, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    for task in done:
        task.result()


if __name__ == "__main__":
    migrate_database()
    # Psycopg async connections require the selector loop on Windows.
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop if sys.platform == "win32" else asyncio.new_event_loop) as runner:
        runner.run(run())
