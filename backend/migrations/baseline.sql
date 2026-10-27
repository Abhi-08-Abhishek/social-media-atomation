-- Baseline for EMPTY PostgreSQL databases only. Existing databases must be stamped, not recreated.

CREATE TABLE public."User" (
	id TEXT NOT NULL, 
	name TEXT, 
	email TEXT, 
	"emailVerified" TIMESTAMP(3) WITHOUT TIME ZONE, 
	image TEXT, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	"updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	"zernioCredential" TEXT, 
	CONSTRAINT "User_pkey" PRIMARY KEY (id)
)

;
CREATE UNIQUE INDEX "User_email_key" ON public."User" (email);

CREATE TABLE public."Account" (
	id TEXT NOT NULL, 
	"userId" TEXT NOT NULL, 
	type TEXT NOT NULL, 
	provider TEXT NOT NULL, 
	"providerAccountId" TEXT NOT NULL, 
	refresh_token TEXT, 
	access_token TEXT, 
	expires_at INTEGER, 
	token_type TEXT, 
	scope TEXT, 
	id_token TEXT, 
	session_state TEXT, 
	CONSTRAINT "Account_pkey" PRIMARY KEY (id), 
	CONSTRAINT "Account_userId_fkey" FOREIGN KEY("userId") REFERENCES public."User" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON public."Account" (provider, "providerAccountId");

CREATE TABLE public."Campaign" (
	id TEXT NOT NULL, 
	"userId" TEXT NOT NULL, 
	name TEXT NOT NULL, 
	logo TEXT NOT NULL, 
	"officeTheme" TEXT NOT NULL, 
	status TEXT DEFAULT 'active'::text NOT NULL, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	"updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	"approvalMode" TEXT NOT NULL, 
	"brandDescription" TEXT NOT NULL, 
	objective TEXT DEFAULT 'REACH'::text NOT NULL,
	"targetMetric" TEXT DEFAULT 'reach'::text NOT NULL,
	"optimizationEnabled" BOOLEAN NOT NULL, 
	platforms TEXT[], 
	"postCount" INTEGER NOT NULL, 
	"postingCadence" TEXT NOT NULL, 
	"socialAccountIds" TEXT[], 
	"targetAudience" TEXT NOT NULL, 
	timezone TEXT NOT NULL, 
	tone TEXT NOT NULL, 
	"brandProfile" JSONB, 
	CONSTRAINT "Campaign_objective_check" CHECK (objective IN ('REACH', 'ENGAGEMENT', 'VIDEO_VIEWS')),
	CONSTRAINT "Campaign_targetMetric_check" CHECK ("targetMetric" IN ('reach', 'engagementRate', 'views')),
	CONSTRAINT "Campaign_pkey" PRIMARY KEY (id), 
	CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY("userId") REFERENCES public."User" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE INDEX "Campaign_userId_status_idx" ON public."Campaign" ("userId", status);

CREATE TABLE public."Session" (
	id TEXT NOT NULL, 
	"sessionToken" TEXT NOT NULL, 
	"userId" TEXT NOT NULL, 
	expires TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	CONSTRAINT "Session_pkey" PRIMARY KEY (id), 
	CONSTRAINT "Session_userId_fkey" FOREIGN KEY("userId") REFERENCES public."User" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE UNIQUE INDEX "Session_sessionToken_key" ON public."Session" ("sessionToken");

CREATE TABLE public."SocialAccount" (
	id TEXT NOT NULL, 
	"userId" TEXT NOT NULL, 
	platform TEXT NOT NULL, 
	handle TEXT NOT NULL, 
	"accountId" TEXT NOT NULL, 
	"isConnected" BOOLEAN DEFAULT true NOT NULL, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	"updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	CONSTRAINT "SocialAccount_pkey" PRIMARY KEY (id), 
	CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY("userId") REFERENCES public."User" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE UNIQUE INDEX "SocialAccount_userId_accountId_key" ON public."SocialAccount" ("userId", "accountId");

CREATE TABLE public."AgentMessage" (
	id TEXT NOT NULL, 
	"campaignId" TEXT NOT NULL, 
	sender TEXT NOT NULL, 
	content TEXT NOT NULL, 
	metadata JSONB, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT "AgentMessage_pkey" PRIMARY KEY (id), 
	CONSTRAINT "AgentMessage_campaignId_fkey" FOREIGN KEY("campaignId") REFERENCES public."Campaign" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;

CREATE TABLE public."AgentPlan" (
	id TEXT NOT NULL, 
	"campaignId" TEXT NOT NULL, 
	title TEXT NOT NULL, 
	"userPrompt" TEXT NOT NULL, 
	status TEXT DEFAULT 'in_progress'::text NOT NULL, 
	summary TEXT, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	"updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	brief JSONB NOT NULL, 
	"currentStep" TEXT NOT NULL, 
	"errorMessage" TEXT, 
	"idempotencyKey" TEXT NOT NULL, 
	"approvalMode" TEXT DEFAULT 'REVIEW'::text NOT NULL, 
	"leaseUntil" TIMESTAMP(3) WITHOUT TIME ZONE, 
	"sourceRecommendation" TEXT, 
	CONSTRAINT "AgentPlan_pkey" PRIMARY KEY (id), 
	CONSTRAINT "AgentPlan_campaignId_fkey" FOREIGN KEY("campaignId") REFERENCES public."Campaign" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE INDEX "AgentPlan_campaignId_createdAt_idx" ON public."AgentPlan" ("campaignId", "createdAt");
CREATE UNIQUE INDEX "AgentPlan_idempotencyKey_key" ON public."AgentPlan" ("idempotencyKey");
CREATE UNIQUE INDEX "AgentPlan_sourceRecommendation_key" ON public."AgentPlan" ("sourceRecommendation");

CREATE TABLE public."StrategyReport" (
	id TEXT NOT NULL, 
	"campaignId" TEXT NOT NULL, 
	"metricsFingerprint" TEXT NOT NULL, 
	summary TEXT NOT NULL, 
	recommendations JSONB NOT NULL, 
	confidence DOUBLE PRECISION NOT NULL, 
	"insufficientData" BOOLEAN NOT NULL, 
	"sourcePostIds" TEXT[], 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT "StrategyReport_pkey" PRIMARY KEY (id), 
	CONSTRAINT "StrategyReport_campaignId_fkey" FOREIGN KEY("campaignId") REFERENCES public."Campaign" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE INDEX "StrategyReport_campaignId_createdAt_idx" ON public."StrategyReport" ("campaignId", "createdAt");
CREATE UNIQUE INDEX "StrategyReport_campaignId_metricsFingerprint_key" ON public."StrategyReport" ("campaignId", "metricsFingerprint");

CREATE TABLE public."AgentTask" (
	id TEXT NOT NULL, 
	"planId" TEXT NOT NULL, 
	"agentType" TEXT NOT NULL, 
	title TEXT NOT NULL, 
	status TEXT DEFAULT 'pending'::text NOT NULL, 
	"orderIndex" INTEGER DEFAULT 0 NOT NULL, 
	"dependsOn" TEXT, 
	"outputData" JSONB, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	"updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	CONSTRAINT "AgentTask_pkey" PRIMARY KEY (id), 
	CONSTRAINT "AgentTask_planId_fkey" FOREIGN KEY("planId") REFERENCES public."AgentPlan" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;

CREATE TABLE public."Post" (
	id TEXT NOT NULL, 
	"campaignId" TEXT NOT NULL, 
	title TEXT NOT NULL, 
	caption TEXT NOT NULL, 
	hashtags TEXT[], 
	platforms TEXT[], 
	status TEXT DEFAULT 'DRAFT'::text NOT NULL, 
	"mediaUrls" TEXT[], 
	"scheduledAt" TIMESTAMP(3) WITHOUT TIME ZONE, 
	"publishedAt" TIMESTAMP(3) WITHOUT TIME ZONE, 
	"blotatoPostId" TEXT, 
	"liveUrl" TEXT, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	"updatedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	format TEXT NOT NULL, 
	"isAiGenerated" BOOLEAN NOT NULL, 
	"planId" TEXT, 
	"suggestedTimeSlot" TEXT, 
	"zernioPostId" TEXT, 
	"publishRequestId" TEXT NOT NULL, 
	"publishAttemptAt" TIMESTAMP(3) WITHOUT TIME ZONE, 
	"publishFingerprint" TEXT, 
	"qualityReview" JSONB, 
	"editorialFeedback" JSONB, 
	CONSTRAINT "Post_pkey" PRIMARY KEY (id), 
	CONSTRAINT "Post_campaignId_fkey" FOREIGN KEY("campaignId") REFERENCES public."Campaign" (id) ON DELETE CASCADE ON UPDATE CASCADE, 
	CONSTRAINT "Post_planId_fkey" FOREIGN KEY("planId") REFERENCES public."AgentPlan" (id) ON DELETE SET NULL ON UPDATE CASCADE
)

;
CREATE INDEX "Post_campaignId_status_idx" ON public."Post" ("campaignId", status);
CREATE INDEX "Post_planId_idx" ON public."Post" ("planId");
CREATE UNIQUE INDEX "Post_zernioPostId_key" ON public."Post" ("zernioPostId");

CREATE TABLE public."RecommendationDecision" (
	id TEXT NOT NULL, 
	"reportId" TEXT NOT NULL, 
	"briefIndex" INTEGER NOT NULL, 
	status TEXT NOT NULL, 
	"editedBrief" TEXT, 
	"createdAt" TIMESTAMP(3) WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT "RecommendationDecision_pkey" PRIMARY KEY (id), 
	CONSTRAINT "RecommendationDecision_reportId_fkey" FOREIGN KEY("reportId") REFERENCES public."StrategyReport" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE UNIQUE INDEX "RecommendationDecision_reportId_briefIndex_key" ON public."RecommendationDecision" ("reportId", "briefIndex");

CREATE TABLE public."PostMetric" (
	id TEXT NOT NULL, 
	"postId" TEXT NOT NULL, 
	views INTEGER, 
	reach INTEGER, 
	likes INTEGER, 
	comments INTEGER, 
	shares INTEGER, 
	saves INTEGER, 
	"providerStatus" TEXT NOT NULL, 
	"liveUrl" TEXT, 
	"observedAt" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL, 
	CONSTRAINT "PostMetric_pkey" PRIMARY KEY (id), 
	CONSTRAINT "PostMetric_postId_fkey" FOREIGN KEY("postId") REFERENCES public."Post" (id) ON DELETE CASCADE ON UPDATE CASCADE
)

;
CREATE UNIQUE INDEX "PostMetric_postId_key" ON public."PostMetric" ("postId");
