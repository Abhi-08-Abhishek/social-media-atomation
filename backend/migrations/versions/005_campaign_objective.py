"""Add a measurable objective to social campaigns."""
from alembic import op

revision = "005_campaign_objective"
down_revision = "004_meta_manual_token"


def upgrade():
    op.execute(r'''
ALTER TABLE public."Campaign"
    ADD COLUMN IF NOT EXISTS objective TEXT DEFAULT 'REACH' NOT NULL,
    ADD COLUMN IF NOT EXISTS "targetMetric" TEXT DEFAULT 'reach' NOT NULL;

ALTER TABLE public."Campaign"
    DROP CONSTRAINT IF EXISTS "Campaign_objective_check",
    DROP CONSTRAINT IF EXISTS "Campaign_targetMetric_check";

ALTER TABLE public."Campaign"
    ADD CONSTRAINT "Campaign_objective_check" CHECK (objective IN ('REACH', 'ENGAGEMENT', 'VIDEO_VIEWS')),
    ADD CONSTRAINT "Campaign_targetMetric_check" CHECK ("targetMetric" IN ('reach', 'engagementRate', 'views'));
''')


def downgrade():
    raise RuntimeError("Automatic removal of campaign objective data is disabled.")
