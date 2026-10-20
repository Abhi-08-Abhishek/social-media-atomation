"""Existing Socialix schema; never upgrade an already populated database to this baseline."""
from pathlib import Path
from alembic import op
from sqlalchemy import inspect

revision = "001_baseline"
down_revision = None


def upgrade():
    if "User" in inspect(op.get_bind()).get_table_names(schema="public"):
        raise RuntimeError("Existing Socialix tables detected. Verify a backup and run 'alembic stamp 001_baseline' instead.")
    sql = (Path(__file__).resolve().parents[1] / "baseline.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade():
    raise RuntimeError("Automatic destructive baseline rollback is disabled. Restore a verified database backup explicitly.")
