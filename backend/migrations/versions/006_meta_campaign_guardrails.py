"""Link paid campaigns to brand context and store spend guardrails."""
from alembic import op

revision = "006_meta_campaign_guardrails"
down_revision = "005_campaign_objective"


def upgrade():
    op.execute(r'''
ALTER TABLE public."MetaCampaign"
    ADD COLUMN IF NOT EXISTS "sourceCampaignId" TEXT REFERENCES public."Campaign"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS "automationMode" TEXT DEFAULT 'ASSIST' NOT NULL,
    ADD COLUMN IF NOT EXISTS "maxTotalSpend" BIGINT;

ALTER TABLE public."MetaCampaign"
    DROP CONSTRAINT IF EXISTS "MetaCampaign_automationMode_check",
    DROP CONSTRAINT IF EXISTS "MetaCampaign_maxTotalSpend_check";

ALTER TABLE public."MetaCampaign"
    ADD CONSTRAINT "MetaCampaign_automationMode_check" CHECK ("automationMode" IN ('ASSIST', 'GUARDED')),
    ADD CONSTRAINT "MetaCampaign_maxTotalSpend_check" CHECK ("maxTotalSpend" IS NULL OR "maxTotalSpend" > 0);

CREATE INDEX IF NOT EXISTS "MetaCampaign_sourceCampaignId_idx" ON public."MetaCampaign" ("sourceCampaignId");
''')


def downgrade():
    raise RuntimeError("Automatic removal of Meta campaign guardrails is disabled.")
