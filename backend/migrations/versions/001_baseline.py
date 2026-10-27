"""Create an empty database or adopt a complete legacy Socialix schema."""
from pathlib import Path
from alembic import op
from sqlalchemy import inspect

revision = "001_baseline"
down_revision = None
BASELINE_TABLES = {"User", "Account", "Campaign", "Session", "SocialAccount", "AgentMessage",
                   "AgentPlan", "StrategyReport", "AgentTask", "Post", "RecommendationDecision", "PostMetric"}


def upgrade():
    existing = set(inspect(op.get_bind()).get_table_names(schema="public"))
    present = BASELINE_TABLES & existing
    if present:
        missing = sorted(BASELINE_TABLES - existing)
        if missing:
            raise RuntimeError("Incomplete existing Socialix schema; missing tables: " + ", ".join(missing))
        return
    sql = (Path(__file__).resolve().parents[1] / "baseline.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade():
    raise RuntimeError("Automatic destructive baseline rollback is disabled. Restore a verified database backup explicitly.")
