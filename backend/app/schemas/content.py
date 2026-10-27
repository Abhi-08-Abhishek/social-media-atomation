from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import Field, HttpUrl, field_validator, model_validator
from app.schemas.research import Contract

Platform = Literal["INSTAGRAM", "FACEBOOK", "LINKEDIN", "X", "TIKTOK", "YOUTUBE"]
Format = Literal["Single Post", "Carousel", "Reel"]
CampaignObjective = Literal["REACH", "ENGAGEMENT", "VIDEO_VIEWS"]
TargetMetric = Literal["reach", "engagementRate", "views"]

OBJECTIVE_METRICS: dict[CampaignObjective, TargetMetric] = {
    "REACH": "reach",
    "ENGAGEMENT": "engagementRate",
    "VIDEO_VIEWS": "views",
}


def objective_metric(objective: CampaignObjective) -> TargetMetric:
    return OBJECTIVE_METRICS[objective]


class BrandProfile(Contract):
    language: str = Field(default="English", max_length=80)
    voice: str = Field(default="Clear, specific and conversational", max_length=1200)
    offer: str = Field(default="", max_length=2000)
    approvedExamples: list[str] = Field(default_factory=list, max_length=3)
    avoid: list[str] = Field(default_factory=list, max_length=30)
    visualStyle: str = Field(default="Clean editorial layout", max_length=600)
    accentColor: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")
    template: Literal["news", "takeaway", "comparison", "tip"] = "takeaway"


class CampaignCreate(Contract):
    name: str = Field(min_length=1, max_length=100)
    logo: Literal["rocket", "sparkles", "megaphone", "leaf", "fire", "star", "heart", "camera", "globe"]
    officeTheme: Literal["modern", "wooden"]
    brandDescription: str = Field(max_length=4000)
    targetAudience: str = Field(max_length=2000)
    socialAccountIds: list[str] = Field(min_length=1, max_length=10)
    timezone: str = Field(min_length=1, max_length=100)
    postCount: int = Field(ge=1, le=20, strict=True)
    approvalMode: Literal["REVIEW", "AUTO"] = "REVIEW"
    objective: CampaignObjective = "REACH"
    optimizationEnabled: bool = True

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except Exception:
            raise ValueError("Choose a valid IANA timezone.") from None
        return value


class CampaignUpdate(Contract):
    officeTheme: Literal["modern", "wooden"] | None = None
    status: Literal["active", "ended"] | None = None
    approvalMode: Literal["REVIEW", "AUTO"] | None = None
    objective: CampaignObjective | None = None
    optimizationEnabled: bool | None = None
    brandDescription: str | None = Field(default=None, max_length=4000)
    targetAudience: str | None = Field(default=None, max_length=2000)
    tone: str | None = Field(default=None, max_length=500)
    brandProfile: BrandProfile | None = None

    @model_validator(mode="after")
    def nonempty(self):
        if not self.model_fields_set or any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("At least one non-null update is required.")
        return self


class QualityReview(Contract):
    status: Literal["passed", "needs_review"]
    issues: list[str] = Field(max_length=30)
    sourceUrls: list[HttpUrl] = Field(max_length=10)
    checkedAt: str
    revisions: int = Field(ge=0, le=1)


class Draft(Contract):
    campaignId: str = Field(min_length=1)
    postId: str | None = None
    title: str = Field(min_length=1, max_length=120)
    caption: str = Field(min_length=1, max_length=2200)
    hashtags: list[str] = Field(max_length=30)
    platform: Platform
    format: Format
    mediaUrls: list[HttpUrl] = Field(max_length=10)
    isAiGenerated: bool
    qualityReview: QualityReview | None = None


class Schedule(Draft):
    localPostId: str | None = None
    requestId: UUID | None = None
    scheduledAt: str
    timezone: str

    @model_validator(mode="after")
    def identity(self):
        if not self.localPostId and not self.requestId:
            raise ValueError("A saved post or request ID is required.")
        return self


class ScheduleUpdate(Contract):
    postId: str = Field(min_length=1)
    title: str | None = Field(default=None, min_length=1, max_length=120)
    caption: str | None = Field(default=None, min_length=1, max_length=2200)
    hashtags: list[str] | None = Field(default=None, max_length=30)
    scheduledFor: str | None = None
    timezone: str | None = None


class Recommendation(Contract):
    reportId: str = Field(min_length=1)
    briefIndex: int = Field(ge=0, strict=True)


class Goal(Contract):
    campaignId: str = Field(min_length=1)
    prompt: str = Field(max_length=5000)
    idempotencyKey: UUID
    recommendation: Recommendation | None = None

    @model_validator(mode="after")
    def brief(self):
        if not self.prompt and not self.recommendation:
            raise ValueError("Provide a prompt or recommendation.")
        return self


class Generate(Contract):
    campaignId: str
    prompt: str = Field(min_length=1, max_length=5000)
    platform: Platform
    format: Format | None = None


class CaptionEdit(Contract):
    campaignId: str
    title: str = Field(min_length=1, max_length=200)
    currentCaption: str = Field(default="", max_length=2200)
    platform: Platform
    instruction: str = Field(default="Make this clearer without changing factual claims.", max_length=2000)
    tone: str = Field(default="", max_length=500)


class Caption(Contract):
    caption: str = Field(min_length=1, max_length=2200)
    hashtags: list[str] = Field(max_length=5)


class Slide(Contract):
    eyebrow: str = Field(min_length=1, max_length=30)
    headline: str = Field(min_length=1, max_length=70)
    body: str = Field(min_length=1, max_length=200)


class Scene(Slide):
    narration: str = Field(min_length=15, max_length=260)


class CreativeBrief(Contract):
    audience: str = Field(min_length=5, max_length=250)
    angle: str = Field(min_length=10, max_length=400)
    takeaway: str = Field(min_length=10, max_length=400)
    visualDirection: str = Field(min_length=10, max_length=400)


class ImagePoint(Contract):
    title: str = Field(min_length=1, max_length=45)
    body: str = Field(min_length=1, max_length=120)


class CopyDraft(Caption):
    title: str = Field(min_length=1, max_length=120)
    creativeBrief: CreativeBrief
    sourceUrls: list[HttpUrl] = Field(min_length=1, max_length=10)


class SingleImagePlan(Contract):
    imageHeadline: str = Field(min_length=1, max_length=80)
    imageSummary: str = Field(max_length=160)
    imagePoints: list[ImagePoint] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def infographic(self):
        if self.imagePoints and len(self.imagePoints) < 3:
            raise ValueError("An infographic needs 3–5 points.")
        return self


class PostCopy(CopyDraft, SingleImagePlan):
    pass


class CarouselSlides(Contract):
    slides: list[Slide] = Field(min_length=4, max_length=7)

    @model_validator(mode="after")
    def distinct_slides(self):
        if len({slide.headline.lower() for slide in self.slides}) != len(self.slides):
            raise ValueError("Every carousel slide needs a distinct headline.")
        return self


class SceneScript(Contract):
    eyebrow: str = Field(min_length=1, max_length=30)
    headline: str = Field(min_length=1, max_length=70)
    narration: str = Field(min_length=15, max_length=200)


class ReelScenes(Contract):
    scenes: list[SceneScript] = Field(min_length=3, max_length=5)


class GeneratedPost(PostCopy):
    platform: Platform
    format: Format
    slides: list[Slide] = Field(default_factory=list, max_length=7)
    scenes: list[Scene] = Field(default_factory=list, max_length=5)
    suggestedTimeSlot: str = "10:00 AM"
    calendarDayOffset: int = Field(default=1, ge=1, le=365)

    @model_validator(mode="after")
    def media_plan(self):
        if self.format == "Carousel" and (len(self.slides) < 4 or self.platform not in {"INSTAGRAM", "FACEBOOK", "LINKEDIN"}
                or len({s.headline.lower() for s in self.slides}) != len(self.slides)):
            raise ValueError("Carousel needs 4–7 distinct slides on a supported platform.")
        if self.format == "Reel" and (len(self.scenes) < 3 or any(s.body != s.narration for s in self.scenes)):
            raise ValueError("Reel needs 3–5 scenes with matching visible text and narration.")
        return self


class GeneratedBatch(Contract):
    posts: list[GeneratedPost] = Field(min_length=1, max_length=20)


class Deliverable(Contract):
    platform: Platform
    format: Format
    topic: str = Field(min_length=1, max_length=300)
    objective: str = Field(min_length=1, max_length=500)


class Brief(Contract):
    title: str = Field(min_length=1, max_length=120)
    objective: str = Field(min_length=1, max_length=1000)
    contentPillars: list[str] = Field(min_length=1, max_length=6)
    researchQuestions: list[str] = Field(min_length=1, max_length=8)
    successMetrics: list[str] = Field(min_length=1, max_length=6)
    creatorInstructions: str = Field(min_length=1, max_length=2000)
    deliverables: list[Deliverable] = Field(min_length=1, max_length=20)
    approvalMode: Literal["REVIEW", "AUTO"]
