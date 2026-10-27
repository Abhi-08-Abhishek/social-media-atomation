"""Separate Meta paid-ad storage; does not modify Zernio or organic campaign data."""
from alembic import op

revision = "002_meta_ads"
down_revision = "001_baseline"


def upgrade():
    op.execute(r'''
CREATE TABLE public."MetaConnection" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "remoteUserId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    "tokenExpiresAt" TIMESTAMP(3) WITHOUT TIME ZONE,
    status TEXT NOT NULL DEFAULT 'CONNECTED',
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
);

CREATE TABLE public."MetaAdAccount" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "connectionId" TEXT NOT NULL REFERENCES public."MetaConnection"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "remoteId" TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    "timezoneName" TEXT NOT NULL,
    status TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) WITHOUT TIME ZONE,
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
    UNIQUE ("userId", "remoteId")
);

CREATE TABLE public."MetaCampaign" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "adAccountId" TEXT NOT NULL REFERENCES public."MetaAdAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    "remoteId" TEXT UNIQUE,
    name TEXT NOT NULL,
    objective TEXT NOT NULL,
    "specialAdCategories" TEXT[] NOT NULL DEFAULT '{}',
    "budgetMode" TEXT NOT NULL,
    "dailyBudget" BIGINT,
    "lifetimeBudget" BIGINT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveStatus" TEXT,
    "errorMessage" TEXT,
    "requestId" TEXT NOT NULL UNIQUE,
    "requestFingerprint" TEXT,
    "attemptedAt" TIMESTAMP(3) WITHOUT TIME ZONE,
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX "MetaCampaign_userId_status_idx" ON public."MetaCampaign" ("userId", status);

CREATE TABLE public."MetaAdSet" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL REFERENCES public."MetaCampaign"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "remoteId" TEXT UNIQUE,
    name TEXT NOT NULL,
    targeting JSONB NOT NULL,
    placements JSONB NOT NULL,
    "optimizationGoal" TEXT NOT NULL,
    "billingEvent" TEXT NOT NULL,
    "bidStrategy" TEXT NOT NULL,
    "promotedObject" JSONB,
    "dailyBudget" BIGINT,
    "lifetimeBudget" BIGINT,
    "startTime" TIMESTAMP(3) WITHOUT TIME ZONE,
    "endTime" TIMESTAMP(3) WITHOUT TIME ZONE,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveStatus" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX "MetaAdSet_campaignId_idx" ON public."MetaAdSet" ("campaignId");

CREATE TABLE public."MetaCreative" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL REFERENCES public."MetaCampaign"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "remoteId" TEXT UNIQUE,
    name TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "instagramActorId" TEXT,
    format TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "primaryText" TEXT NOT NULL,
    headline TEXT NOT NULL,
    description TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "callToAction" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX "MetaCreative_campaignId_idx" ON public."MetaCreative" ("campaignId");

CREATE TABLE public."MetaAd" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL REFERENCES public."MetaCampaign"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "adSetId" TEXT NOT NULL REFERENCES public."MetaAdSet"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "creativeId" TEXT NOT NULL REFERENCES public."MetaCreative"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    "remoteId" TEXT UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveStatus" TEXT,
    "reviewFeedback" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX "MetaAd_campaignId_idx" ON public."MetaAd" ("campaignId");

CREATE TABLE public."MetaInsight" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL REFERENCES public."MetaCampaign"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dateStart" DATE NOT NULL,
    "dateStop" DATE NOT NULL,
    spend NUMERIC(18, 6),
    impressions BIGINT,
    reach BIGINT,
    clicks BIGINT,
    frequency NUMERIC(18, 6),
    ctr NUMERIC(18, 6),
    cpc NUMERIC(18, 6),
    cpm NUMERIC(18, 6),
    actions JSONB NOT NULL DEFAULT '[]',
    "actionValues" JSONB NOT NULL DEFAULT '[]',
    "observedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
    UNIQUE ("entityType", "entityId", "dateStart", "dateStop")
);
CREATE INDEX "MetaInsight_campaignId_dateStop_idx" ON public."MetaInsight" ("campaignId", "dateStop");

CREATE TABLE public."MetaRecommendation" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL REFERENCES public."MetaCampaign"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    kind TEXT NOT NULL,
    rationale TEXT NOT NULL,
    evidence JSONB NOT NULL,
    "proposedAction" JSONB NOT NULL,
    "metricsFingerprint" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "decidedAt" TIMESTAMP(3) WITHOUT TIME ZONE,
    UNIQUE ("campaignId", "entityId", kind, "metricsFingerprint")
);

CREATE TABLE public."MetaAuditEvent" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "campaignId" TEXT REFERENCES public."MetaCampaign"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    action TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX "MetaAuditEvent_campaignId_createdAt_idx" ON public."MetaAuditEvent" ("campaignId", "createdAt");
''')


def downgrade():
    raise RuntimeError("Automatic Meta Ads data deletion is disabled. Back up and remove the tables explicitly.")
