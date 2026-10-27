from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import Field, HttpUrl, SecretStr, field_validator, model_validator

from app.schemas.research import Contract

MetaObjective = Literal["OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_LEADS", "OUTCOME_SALES"]
SpecialAdCategory = Literal["CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS"]
MetaGuidedIntent = Literal["FIND_NEW_CUSTOMERS", "RETARGET_CUSTOMERS", "CREATE_PROMOTION", "GET_STARTED"]
MetaAutomationMode = Literal["ASSIST", "GUARDED"]


class MetaManualCredentials(Contract):
    adAccountId: str = Field(min_length=5, max_length=30, pattern=r"^\d+$")
    accessToken: SecretStr = Field(min_length=20, max_length=4096)

    @field_validator("adAccountId", mode="before")
    @classmethod
    def normalize_account_id(cls, value):
        if isinstance(value, str):
            value = value.strip()
            for prefix in ("act_", "act="):
                if value.startswith(prefix):
                    return value[len(prefix):]
        return value


class MetaInterest(Contract):
    id: str = Field(pattern=r"^\d+$", max_length=30)
    name: str = Field(default="", max_length=200)


class MetaCustomAudience(Contract):
    id: str = Field(pattern=r"^\d+$", max_length=30)
    name: str = Field(default="", max_length=200)


class MetaTargeting(Contract):
    countries: list[str] = Field(min_length=1, max_length=25)
    ageMin: int = Field(default=18, ge=18, le=65, strict=True)
    ageMax: int = Field(default=65, ge=18, le=65, strict=True)
    genders: list[Literal[1, 2]] = Field(default_factory=list, max_length=2)
    interests: list[MetaInterest] = Field(default_factory=list, max_length=50)
    customAudiences: list[MetaCustomAudience] = Field(default_factory=list, max_length=20)

    @field_validator("countries")
    @classmethod
    def country_codes(cls, values):
        normalized = [value.upper() for value in values]
        if any(len(value) != 2 or not value.isalpha() for value in normalized):
            raise ValueError("Use two-letter country codes.")
        return list(dict.fromkeys(normalized))

    @model_validator(mode="after")
    def age_range(self):
        if self.ageMax < self.ageMin:
            raise ValueError("Maximum age must be greater than or equal to minimum age.")
        return self


class MetaPlacements(Contract):
    automatic: bool = True
    publisherPlatforms: list[Literal["facebook", "instagram", "messenger", "audience_network"]] = Field(
        default_factory=list, max_length=4)

    @model_validator(mode="after")
    def manual_placements(self):
        if not self.automatic and not self.publisherPlatforms:
            raise ValueError("Choose at least one platform or use automatic placements.")
        return self


class MetaCreativeDraft(Contract):
    name: str = Field(min_length=1, max_length=150)
    pageId: str = Field(min_length=1, max_length=80)
    instagramActorId: str | None = Field(default=None, min_length=1, max_length=80)
    format: Literal["SINGLE_IMAGE"] = "SINGLE_IMAGE"
    mediaUrl: HttpUrl
    primaryText: str = Field(min_length=1, max_length=2200)
    headline: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=255)
    destinationUrl: HttpUrl
    callToAction: Literal["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "CONTACT_US", "GET_OFFER"] = "LEARN_MORE"


class MetaAdDraft(Contract):
    name: str = Field(min_length=1, max_length=150)
    creative: MetaCreativeDraft


class MetaAdSetDraft(Contract):
    name: str = Field(min_length=1, max_length=150)
    targeting: MetaTargeting
    placements: MetaPlacements = Field(default_factory=MetaPlacements)
    optimizationGoal: Literal["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS", "OFFSITE_CONVERSIONS"]
    billingEvent: Literal["IMPRESSIONS", "LINK_CLICKS"] = "IMPRESSIONS"
    bidStrategy: Literal["LOWEST_COST_WITHOUT_CAP"] = "LOWEST_COST_WITHOUT_CAP"
    pixelId: str | None = Field(default=None, max_length=80)
    conversionEvent: str | None = Field(default=None, max_length=80)
    dailyBudget: int | None = Field(default=None, ge=1, strict=True)
    lifetimeBudget: int | None = Field(default=None, ge=1, strict=True)
    startTime: datetime | None = None
    endTime: datetime | None = None
    ads: list[MetaAdDraft] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def schedule_and_conversion(self):
        if (self.startTime and self.startTime.tzinfo is None) or (self.endTime and self.endTime.tzinfo is None):
            raise ValueError("Ad Set dates must include a timezone offset.")
        if self.startTime and self.endTime and self.endTime <= self.startTime:
            raise ValueError("Ad Set end time must be after its start time.")
        if self.lifetimeBudget is not None and not self.endTime:
            raise ValueError("An Ad Set lifetime budget requires an end time.")
        if self.optimizationGoal == "OFFSITE_CONVERSIONS" and not self.pixelId:
            raise ValueError("Choose a Meta Pixel for conversion optimization.")
        return self


class MetaCampaignDraft(Contract):
    adAccountRemoteId: str = Field(min_length=1, max_length=80)
    sourceCampaignId: str | None = Field(default=None, min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)
    objective: MetaObjective
    specialAdCategories: list[SpecialAdCategory] = Field(default_factory=list, max_length=4)
    budgetMode: Literal["CAMPAIGN", "AD_SET"]
    dailyBudget: int | None = Field(default=None, ge=1, strict=True)
    lifetimeBudget: int | None = Field(default=None, ge=1, strict=True)
    maxTotalSpend: int | None = Field(default=None, ge=1, strict=True)
    automationMode: MetaAutomationMode = "ASSIST"
    adSets: list[MetaAdSetDraft] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def budgets_and_objective(self):
        campaign_budget = sum(value is not None for value in (self.dailyBudget, self.lifetimeBudget))
        for ad_set in self.adSets:
            ad_set_budget = sum(value is not None for value in (ad_set.dailyBudget, ad_set.lifetimeBudget))
            if self.budgetMode == "CAMPAIGN" and (campaign_budget != 1 or ad_set_budget):
                raise ValueError("Use exactly one campaign budget and no Ad Set budgets.")
            if self.budgetMode == "AD_SET" and (campaign_budget or ad_set_budget != 1):
                raise ValueError("Use exactly one budget on every Ad Set and no campaign budget.")
            if self.lifetimeBudget is not None and not ad_set.endTime:
                raise ValueError("A campaign lifetime budget requires an end time on every Ad Set.")
            if self.objective in {"OUTCOME_LEADS", "OUTCOME_SALES"} and not ad_set.pixelId:
                raise ValueError("Lead and sales campaigns require a Meta Pixel in every Ad Set.")
        return self


class MetaActivation(Contract):
    confirmed: Literal[True]


class MetaGuidedCampaignRequest(Contract):
    adAccountId: str = Field(min_length=1, max_length=80)
    sourceCampaignId: str | None = Field(default=None, min_length=1, max_length=100)
    prompt: str = Field(min_length=10, max_length=5000)
    intent: MetaGuidedIntent = "GET_STARTED"
    pageId: str | None = Field(default=None, min_length=1, max_length=80)
    pixelId: str | None = Field(default=None, min_length=1, max_length=80)
    customAudienceId: str | None = Field(default=None, min_length=1, max_length=80)


class MetaGuidedCampaignProposal(Contract):
    name: str = Field(min_length=1, max_length=150)
    objective: MetaObjective
    specialAdCategory: SpecialAdCategory | None = None
    budgetMode: Literal["CAMPAIGN", "AD_SET"] = "AD_SET"
    budgetType: Literal["DAILY", "LIFETIME"] = "DAILY"
    budget: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    countries: list[str] = Field(default_factory=list, max_length=10)
    ageMin: int = Field(default=18, ge=18, le=65, strict=True)
    ageMax: int = Field(default=65, ge=18, le=65, strict=True)
    gender: Literal["ALL", "MALE", "FEMALE"] = "ALL"
    automaticPlacements: bool = True
    durationDays: int | None = Field(default=None, ge=1, le=365, strict=True)
    interestTerms: list[str] = Field(default_factory=list, max_length=8)
    primaryText: str = Field(min_length=1, max_length=2200)
    headline: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=255)
    destinationUrl: HttpUrl | None = None
    mediaUrl: HttpUrl | None = None
    callToAction: Literal["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "CONTACT_US", "GET_OFFER"] = "LEARN_MORE"
    assumptions: list[str] = Field(default_factory=list, max_length=8)
    rationale: str = Field(default="", max_length=1000)

    @field_validator("countries")
    @classmethod
    def guided_country_codes(cls, values):
        normalized = [value.upper() for value in values]
        if any(len(value) != 2 or not value.isalpha() for value in normalized):
            raise ValueError("Use two-letter country codes.")
        return list(dict.fromkeys(normalized))

    @field_validator("interestTerms")
    @classmethod
    def clean_interest_terms(cls, values):
        return list(dict.fromkeys(value for value in values if value))

    @model_validator(mode="after")
    def guided_range(self):
        if self.ageMax < self.ageMin:
            raise ValueError("Maximum age must be greater than or equal to minimum age.")
        if self.specialAdCategory:
            self.ageMin, self.ageMax, self.gender, self.interestTerms = 18, 65, "ALL", []
        return self


class MetaRecommendationDecision(Contract):
    decision: Literal["APPROVED", "DISMISSED"]
