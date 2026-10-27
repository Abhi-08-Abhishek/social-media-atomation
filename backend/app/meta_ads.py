import asyncio
import hashlib
import json
import math
from contextlib import suppress
from datetime import timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.agents.meta_ads import generate_campaign_proposal, sync_campaign
from app.auth import current_user
from app.config import get_settings
from app.credentials import encrypt_credential
from app.db import now, table, transaction
from app.integrations import meta
from app.integrations.research import ResearchProviders
from app.schemas.meta_ads import (MetaActivation, MetaCampaignDraft, MetaGuidedCampaignRequest,
    MetaGuidedCampaignProposal, MetaManualCredentials, MetaRecommendationDecision)

router = APIRouter(prefix="/api/meta")


def writes_allowed(*, activation=False):
    settings = get_settings()
    if not settings.meta_ads_writes_enabled:
        raise HTTPException(409, "Meta Ads writes are disabled. Enable them after validating a test ad account.")
    if activation and not settings.meta_ads_activation_enabled:
        raise HTTPException(409, "Meta Ads activation is disabled. Paused drafts can still be created safely.")


async def owned_campaign(db, campaign_id, user_id, lock=False):
    c = table("MetaCampaign")
    query = select(c).where(c.c.id == campaign_id, c.c.userId == user_id)
    if lock:
        query = query.with_for_update()
    campaign = await db.one(query)
    if not campaign:
        raise HTTPException(404, "Meta campaign not found.")
    return campaign


async def connection_row(db, user_id):
    c = table("MetaConnection")
    return await db.one(select(c).where(c.c.userId == user_id))


async def source_campaign(db, campaign_id, user_id):
    if not campaign_id:
        return None
    c = table("Campaign")
    campaign = await db.one(select(c).where(c.c.id == campaign_id, c.c.userId == user_id))
    if not campaign:
        raise HTTPException(404, "Source campaign not found.")
    return campaign


async def upsert_account(db, user_id, connection_id, item):
    a = table("MetaAdAccount")
    values = {"id": str(uuid4()), "userId": user_id, "connectionId": connection_id, "remoteId": item["id"],
        "name": item["name"], "currency": item["currency"], "timezoneName": item["timezoneName"],
        "status": item["status"], "lastSyncedAt": now(), "createdAt": now(), "updatedAt": now()}
    return await db.one(insert(a).values(**values).on_conflict_do_update(
        index_elements=[a.c.userId, a.c.remoteId], set_={key: values[key] for key in
            ("connectionId", "name", "currency", "timezoneName", "status", "lastSyncedAt", "updatedAt")}).returning(a))


def remote_name(name, local_id):
    return f"{name} [SX-{local_id.replace('-', '')}]"


def utc_naive(value):
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value else None


def iso_utc(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def planned_spend(campaign, ad_sets, current_time=None):
    """Return the planned maximum in account minor units when the schedule is bounded."""
    if campaign.get("lifetimeBudget") is not None:
        return campaign["lifetimeBudget"]
    current_time = current_time or now()

    def days(ad_set):
        if not ad_set.get("endTime"):
            return None
        start = ad_set.get("startTime") or current_time
        if ad_set["endTime"] <= start:
            return 0
        return max(1, math.ceil((ad_set["endTime"] - start).total_seconds() / 86400))

    durations = [days(ad_set) for ad_set in ad_sets]
    if any(duration is None for duration in durations):
        return None
    if campaign.get("dailyBudget") is not None:
        return campaign["dailyBudget"] * max(durations, default=0)
    return sum((ad_set.get("lifetimeBudget") or
                (ad_set.get("dailyBudget") or 0) * duration)
               for ad_set, duration in zip(ad_sets, durations))


def validate_campaign_plan(campaign, ad_sets, creatives, ads, current_time=None):
    blocking, warnings = [], []
    current_time = current_time or now()
    if not ad_sets or not creatives or not ads:
        blocking.append("Campaign needs at least one Ad Set, creative and ad.")
    if any(ad_set.get("endTime") and ad_set["endTime"] <= current_time for ad_set in ad_sets):
        blocking.append("Campaign end time must be in the future.")
    if campaign.get("objective") in {"OUTCOME_LEADS", "OUTCOME_SALES"} and any(
            not (ad_set.get("promotedObject") or {}).get("pixel_id") for ad_set in ad_sets):
        blocking.append("Lead and sales campaigns require a Meta Pixel in every Ad Set.")
    maximum = planned_spend(campaign, ad_sets, current_time)
    limit = campaign.get("maxTotalSpend")
    if limit is not None and maximum is not None and maximum > limit:
        blocking.append("Planned spend exceeds the campaign spending limit.")
    if maximum is None:
        warnings.append("This daily-budget campaign has no end date, so its maximum planned spend is unbounded.")
    if limit is None:
        warnings.append("No campaign spending limit is configured.")
    return {"ready": not blocking, "blockingIssues": blocking, "warnings": warnings,
            "maximumPlannedSpend": maximum, "maxTotalSpend": limit}


async def campaign_data(db, campaign):
    s, cr, ad, i, r = [table(name) for name in ("MetaAdSet", "MetaCreative", "MetaAd", "MetaInsight", "MetaRecommendation")]
    ad_sets = await db.rows(select(s).where(s.c.campaignId == campaign["id"]).order_by(s.c.createdAt))
    creatives = await db.rows(select(cr).where(cr.c.campaignId == campaign["id"]).order_by(cr.c.createdAt))
    ads = await db.rows(select(ad).where(ad.c.campaignId == campaign["id"]).order_by(ad.c.createdAt))
    insights = await db.rows(select(i).where(i.c.campaignId == campaign["id"]).order_by(i.c.dateStop.desc(), i.c.observedAt.desc()))
    latest = {}
    for row in insights:
        latest.setdefault((row["entityType"], row["entityId"]), row)
    recommendations = await db.rows(select(r).where(r.c.campaignId == campaign["id"]).order_by(r.c.createdAt.desc()).limit(50))
    return campaign | {"adSets": ad_sets, "creatives": creatives, "ads": ads,
        "insights": list(latest.values()), "recommendations": recommendations,
        "validation": validate_campaign_plan(campaign, ad_sets, creatives, ads)}


@router.get("/connection")
async def connection(user=Depends(current_user)):
    async with transaction() as db:
        row = await connection_row(db, user["id"])
    valid = row and (not row["tokenExpiresAt"] or row["tokenExpiresAt"] > now())
    connected = bool(valid and row["status"] == "CONNECTED" and row["adAccountRemoteId"] and row["encryptedToken"])
    return {"configured": connected, "connected": connected,
        "adAccountId": row["adAccountRemoteId"] if row else None, "scopes": row["scopes"] if row else [],
        "expiresAt": row["tokenExpiresAt"] if row else None}


@router.put("/connection")
async def save_credentials(body: MetaManualCredentials, request: Request, user=Depends(current_user)):
    token = body.accessToken.get_secret_value()
    account = await meta.ad_account(request.app.state.http, meta.MetaAuth(token), body.adAccountId)
    encrypted = encrypt_credential(token, user["id"], get_settings().credential_encryption_key.get_secret_value())
    values = {"id": str(uuid4()), "userId": user["id"], "appId": None, "encryptedAppSecret": None,
        "adAccountRemoteId": account["id"], "remoteUserId": None, "encryptedToken": encrypted, "scopes": [],
        "tokenExpiresAt": None, "status": "CONNECTED", "createdAt": now(), "updatedAt": now()}
    async with transaction() as db:
        c = table("MetaConnection")
        connection = await db.one(insert(c).values(**values).on_conflict_do_update(index_elements=[c.c.userId], set_={
            key: values[key] for key in ("appId", "encryptedAppSecret", "adAccountRemoteId", "remoteUserId",
                "encryptedToken", "scopes", "tokenExpiresAt", "status", "updatedAt")}).returning(c))
        saved = await upsert_account(db, user["id"], connection["id"], account)
    return {"configured": True, "connected": True, "adAccountId": account["id"],
        "account": account | {"localId": saved["id"]}}


@router.delete("/connection")
async def disconnect(user=Depends(current_user)):
    async with transaction() as db:
        row = await connection_row(db, user["id"])
        if row:
            await db.update("MetaConnection", table("MetaConnection").c.id == row["id"], {"status": "DISCONNECTED",
                "remoteUserId": None, "encryptedToken": None, "scopes": [], "tokenExpiresAt": None})
    return {"configured": False, "connected": False}


@router.get("/ad-accounts")
async def accounts(request: Request, user=Depends(current_user)):
    auth = await meta.user_auth(user["id"])
    async with transaction() as db:
        connection = await connection_row(db, user["id"])
    item = await meta.ad_account(request.app.state.http, auth, connection["adAccountRemoteId"])
    async with transaction() as db:
        row = await upsert_account(db, user["id"], connection["id"], item)
    return {"accounts": [item | {"localId": row["id"]}]}


@router.get("/assets")
async def account_assets(adAccountId: str, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        a = table("MetaAdAccount")
        account = await db.one(select(a).where(a.c.userId == user["id"], a.c.remoteId == adAccountId))
    if not account:
        raise HTTPException(404, "Meta ad account not found. Refresh your accounts first.")
    return await meta.assets(request.app.state.http, await meta.user_auth(user["id"]), adAccountId)


@router.get("/targeting-search")
async def search_targeting(q: str, request: Request, user=Depends(current_user)):
    if len(q.strip()) < 2 or len(q) > 100:
        raise HTTPException(400, "Enter at least two characters.")
    return {"interests": await meta.targeting_search(request.app.state.http, await meta.user_auth(user["id"]), q.strip())}


@router.get("/custom-audiences")
async def list_custom_audiences(adAccountId: str, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        a = table("MetaAdAccount")
        account = await db.one(select(a).where(a.c.userId == user["id"], a.c.remoteId == adAccountId))
    if not account:
        raise HTTPException(404, "Meta ad account not found. Refresh your accounts first.")
    return {"audiences": await meta.custom_audiences(
        request.app.state.http, await meta.user_auth(user["id"]), adAccountId)}


def guided_questions(proposal: MetaGuidedCampaignProposal, *, has_page: bool, has_pixel: bool,
                     has_custom_audience: bool, intent: str):
    questions = []
    if proposal.budget is None:
        questions.append("What daily or lifetime budget should this campaign use?")
    if not proposal.countries:
        questions.append("Which countries should this campaign target?")
    if not proposal.destinationUrl:
        questions.append("What website URL should the ad open?")
    if not proposal.mediaUrl:
        questions.append("What public image URL should the ad use?")
    if not has_page:
        questions.append("Choose a Facebook Page that will own this ad.")
    if proposal.objective in {"OUTCOME_LEADS", "OUTCOME_SALES"} and not has_pixel:
        questions.append("Choose a Meta Pixel for this lead or sales campaign.")
    if intent == "RETARGET_CUSTOMERS" and not has_custom_audience:
        questions.append("Choose a Meta Custom Audience for retargeting.")
    return questions[:3]


async def resolve_interests(http, auth, proposal):
    if proposal.specialAdCategory or not proposal.interestTerms:
        return []
    terms = proposal.interestTerms[:5]
    matches = await asyncio.gather(*(meta.targeting_search(http, auth, term) for term in terms))
    resolved = []
    for term, rows in zip(terms, matches):
        if not rows:
            continue
        chosen = next((row for row in rows if row["name"].casefold() == term.casefold()), rows[0])
        if chosen["id"] not in {item["id"] for item in resolved}:
            resolved.append(chosen)
    return resolved


@router.post("/campaigns/generate")
async def generate_guided_campaign(body: MetaGuidedCampaignRequest, request: Request, user=Depends(current_user)):
    requested_account_id = body.adAccountId.removeprefix("act_")
    async with transaction() as db:
        connection = await connection_row(db, user["id"])
        account = await db.one(select(table("MetaAdAccount")).where(
            table("MetaAdAccount").c.userId == user["id"], table("MetaAdAccount").c.remoteId == requested_account_id))
        brand = await source_campaign(db, body.sourceCampaignId, user["id"])
    if not connection or not account or connection["adAccountRemoteId"] != requested_account_id:
        raise HTTPException(400, "Use the ad account connected in Settings.")
    auth = await meta.user_auth(user["id"])
    live, assets = await asyncio.gather(
        meta.ad_account(request.app.state.http, auth, requested_account_id),
        meta.assets(request.app.state.http, auth, requested_account_id))
    if live["status"] != "1":
        raise HTTPException(409, "The selected Meta ad account is not active.")
    page_ids = {item["id"] for item in assets["pages"]}
    pixel_ids = {item["id"] for item in assets["pixels"]}
    if body.pageId and body.pageId not in page_ids:
        raise HTTPException(400, "The selected Facebook Page is unavailable.")
    if body.pixelId and body.pixelId not in pixel_ids:
        raise HTTPException(400, "The selected Meta Pixel is unavailable for this ad account.")
    if body.customAudienceId:
        custom_audience_ids = {item["id"] for item in await meta.custom_audiences(
            request.app.state.http, auth, requested_account_id)}
        if body.customAudienceId not in custom_audience_ids:
            raise HTTPException(400, "The selected Meta Custom Audience is unavailable.")
    proposal = await generate_campaign_proposal(
        ResearchProviders(get_settings(), request.app.state.http), body.prompt, body.intent, live,
        {key: brand[key] for key in ("name", "brandDescription", "targetAudience", "tone", "brandProfile")}
        if brand else None)
    if body.intent == "RETARGET_CUSTOMERS":
        proposal.interestTerms = []
    interests = await resolve_interests(request.app.state.http, auth, proposal)
    questions = guided_questions(proposal, has_page=bool(body.pageId), has_pixel=bool(body.pixelId),
        has_custom_audience=bool(body.customAudienceId), intent=body.intent)
    return {"ready": not questions, "questions": questions,
        "proposal": proposal.model_dump(mode="json"), "interests": interests}


@router.post("/campaigns", status_code=201)
async def create_local_campaign(body: MetaCampaignDraft, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        connection = await connection_row(db, user["id"])
        await source_campaign(db, body.sourceCampaignId, user["id"])
    requested_account_id = body.adAccountRemoteId.removeprefix("act_")
    if not connection or requested_account_id != connection["adAccountRemoteId"]:
        raise HTTPException(400, "Use the ad account connected in Settings.")
    auth = await meta.user_auth(user["id"])
    live = await meta.ad_account(request.app.state.http, auth, requested_account_id)
    if live["status"] != "1":
        raise HTTPException(409, "The selected Meta ad account is not active.")
    assets = await meta.assets(request.app.state.http, auth, live["id"])
    pages = {page["id"]: page for page in assets["pages"]}
    pixels = {pixel["id"] for pixel in assets["pixels"]}
    requested_audience_ids = {audience.id for ad_set in body.adSets for audience in ad_set.targeting.customAudiences}
    available_audience_ids = set()
    if requested_audience_ids:
        available_audience_ids = {audience["id"] for audience in await meta.custom_audiences(
            request.app.state.http, auth, live["id"])}
        if not requested_audience_ids.issubset(available_audience_ids):
            raise HTTPException(400, "A selected Meta Custom Audience is unavailable for this ad account.")
    for ad_set in body.adSets:
        if ad_set.pixelId and ad_set.pixelId not in pixels:
            raise HTTPException(400, "The selected Meta Pixel is unavailable for this ad account.")
        for ad in ad_set.ads:
            page = pages.get(ad.creative.pageId)
            if not page:
                raise HTTPException(400, "The selected Facebook Page is unavailable.")
            instagram = page.get("instagram") or {}
            if ad.creative.instagramActorId and ad.creative.instagramActorId != instagram.get("id"):
                raise HTTPException(400, "The selected Instagram account is not connected to that Facebook Page.")
    async with transaction() as db:
        connection = await connection_row(db, user["id"])
        account = await upsert_account(db, user["id"], connection["id"], live)
        campaign = await db.insert("MetaCampaign", {"userId": user["id"], "adAccountId": account["id"],
            "sourceCampaignId": body.sourceCampaignId, "name": body.name,
            "objective": body.objective, "specialAdCategories": body.specialAdCategories, "budgetMode": body.budgetMode,
            "dailyBudget": body.dailyBudget, "lifetimeBudget": body.lifetimeBudget,
            "maxTotalSpend": body.maxTotalSpend, "automationMode": body.automationMode,
            "status": "DRAFT", "requestId": str(uuid4())})
        for ad_set_input in body.adSets:
            ad_set = await db.insert("MetaAdSet", {"campaignId": campaign["id"], "name": ad_set_input.name,
                "targeting": ad_set_input.targeting.model_dump(mode="json"), "placements": ad_set_input.placements.model_dump(mode="json"),
                "optimizationGoal": ad_set_input.optimizationGoal, "billingEvent": ad_set_input.billingEvent,
                "bidStrategy": ad_set_input.bidStrategy, "promotedObject": {"pixel_id": ad_set_input.pixelId,
                    "custom_event_type": ad_set_input.conversionEvent or "PURCHASE"} if ad_set_input.pixelId else None,
                "dailyBudget": ad_set_input.dailyBudget, "lifetimeBudget": ad_set_input.lifetimeBudget,
                "startTime": utc_naive(ad_set_input.startTime), "endTime": utc_naive(ad_set_input.endTime), "status": "DRAFT"})
            for ad_input in ad_set_input.ads:
                creative_input = ad_input.creative
                creative = await db.insert("MetaCreative", {"campaignId": campaign["id"], "name": creative_input.name,
                    "pageId": creative_input.pageId, "instagramActorId": creative_input.instagramActorId,
                    "format": creative_input.format, "mediaUrl": str(creative_input.mediaUrl),
                    "primaryText": creative_input.primaryText, "headline": creative_input.headline,
                    "description": creative_input.description, "destinationUrl": str(creative_input.destinationUrl),
                    "callToAction": creative_input.callToAction, "status": "DRAFT"})
                await db.insert("MetaAd", {"campaignId": campaign["id"], "adSetId": ad_set["id"],
                    "creativeId": creative["id"], "name": ad_input.name, "status": "DRAFT"})
        full = await campaign_data(db, campaign)
    return {"campaign": full}


@router.get("/campaigns")
async def list_campaigns(user=Depends(current_user)):
    async with transaction() as db:
        c, a, source = table("MetaCampaign"), table("MetaAdAccount"), table("Campaign")
        rows = await db.rows(select(c, a.c.name.label("accountName"), a.c.currency,
            source.c.name.label("sourceCampaignName")).join(a, c.c.adAccountId == a.c.id)
            .outerjoin(source, c.c.sourceCampaignId == source.c.id)
            .where(c.c.userId == user["id"]).order_by(c.c.createdAt.desc()))
    return {"campaigns": rows}


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user=Depends(current_user)):
    async with transaction() as db:
        return {"campaign": await campaign_data(db, await owned_campaign(db, campaign_id, user["id"]))}


@router.post("/campaigns/{campaign_id}/validate")
async def validate_campaign(campaign_id: str, user=Depends(current_user)):
    async with transaction() as db:
        full = await campaign_data(db, await owned_campaign(db, campaign_id, user["id"]))
    return full["validation"]


@router.delete("/campaigns/{campaign_id}")
async def delete_draft(campaign_id: str, user=Depends(current_user)):
    async with transaction() as db:
        campaign = await owned_campaign(db, campaign_id, user["id"], True)
        if campaign["remoteId"]:
            raise HTTPException(409, "Pause remote campaigns instead of deleting their audit history.")
        await db.connection.execute(table("MetaCampaign").delete().where(table("MetaCampaign").c.id == campaign_id))
    return {"success": True}


def campaign_payload(campaign):
    payload = {"name": remote_name(campaign["name"], campaign["id"]), "objective": campaign["objective"],
        "buying_type": "AUCTION", "special_ad_categories": json.dumps(campaign["specialAdCategories"]), "status": "PAUSED"}
    if campaign["dailyBudget"] is not None:
        payload["daily_budget"] = str(campaign["dailyBudget"])
    if campaign["lifetimeBudget"] is not None:
        payload["lifetime_budget"] = str(campaign["lifetimeBudget"])
    return payload


def ad_set_payload(ad_set, remote_campaign_id):
    targeting = {"geo_locations": {"countries": ad_set["targeting"]["countries"]},
        "age_min": ad_set["targeting"]["ageMin"], "age_max": ad_set["targeting"]["ageMax"]}
    if ad_set["targeting"].get("genders"):
        targeting["genders"] = ad_set["targeting"]["genders"]
    if ad_set["targeting"].get("interests"):
        targeting["interests"] = ad_set["targeting"]["interests"]
    if ad_set["targeting"].get("customAudiences"):
        targeting["custom_audiences"] = [{"id": item["id"]} for item in ad_set["targeting"]["customAudiences"]]
    if not ad_set["placements"].get("automatic"):
        targeting["publisher_platforms"] = ad_set["placements"]["publisherPlatforms"]
    payload = {"name": remote_name(ad_set["name"], ad_set["id"]), "campaign_id": remote_campaign_id,
        "optimization_goal": ad_set["optimizationGoal"], "billing_event": ad_set["billingEvent"],
        "bid_strategy": ad_set["bidStrategy"], "targeting": json.dumps(targeting), "status": "PAUSED"}
    for source, target in (("dailyBudget", "daily_budget"), ("lifetimeBudget", "lifetime_budget")):
        if ad_set[source] is not None:
            payload[target] = str(ad_set[source])
    if ad_set["promotedObject"]:
        payload["promoted_object"] = json.dumps(ad_set["promotedObject"])
    if ad_set["startTime"]:
        payload["start_time"] = iso_utc(ad_set["startTime"])
    if ad_set["endTime"]:
        payload["end_time"] = iso_utc(ad_set["endTime"])
    return payload


def creative_payload(creative):
    link_data = {"link": creative["destinationUrl"], "picture": creative["mediaUrl"], "message": creative["primaryText"],
        "name": creative["headline"], "description": creative["description"],
        "call_to_action": {"type": creative["callToAction"], "value": {"link": creative["destinationUrl"]}}}
    story = {"page_id": creative["pageId"], "link_data": link_data}
    if creative["instagramActorId"]:
        story["instagram_actor_id"] = creative["instagramActorId"]
    return {"name": remote_name(creative["name"], creative["id"]), "object_story_spec": json.dumps(story)}


@router.post("/campaigns/{campaign_id}/publish")
async def publish_campaign(campaign_id: str, request: Request, user=Depends(current_user)):
    writes_allowed()
    async with transaction() as db:
        await db.connection.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(campaign_id, 0))))
        campaign = await owned_campaign(db, campaign_id, user["id"], True)
        if campaign["status"] == "NEEDS_RECONCILIATION":
            raise HTTPException(409, "Reconcile this campaign before retrying Meta creation.")
        if campaign["status"] not in {"DRAFT", "FAILED"}:
            raise HTTPException(409, "Only draft or failed campaigns can be created in Meta.")
        full = await campaign_data(db, campaign)
        if not full["validation"]["ready"]:
            raise HTTPException(409, " ".join(full["validation"]["blockingIssues"]))
        account = await db.one(select(table("MetaAdAccount")).where(table("MetaAdAccount").c.id == campaign["adAccountId"]))
        fingerprint = hashlib.sha256(json.dumps({"campaign": campaign_payload(campaign), "adSets": full["adSets"],
            "creatives": full["creatives"], "ads": full["ads"]}, default=str, sort_keys=True).encode()).hexdigest()
        await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id,
            {"status": "PUBLISHING", "attemptedAt": now(), "requestFingerprint": fingerprint, "errorMessage": None})
    auth = await meta.user_auth(user["id"])
    try:
        if not campaign["remoteId"]:
            result = await meta.create_campaign(request.app.state.http, auth, account["remoteId"], campaign_payload(campaign))
            if not result.get("id"):
                raise meta.MetaError("Meta did not return a campaign ID.")
            campaign["remoteId"] = result["id"]
            async with transaction() as db:
                await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id, {"remoteId": result["id"]})
        for ad_set in full["adSets"]:
            if not ad_set["remoteId"]:
                result = await meta.create_ad_set(request.app.state.http, auth, account["remoteId"], ad_set_payload(ad_set, campaign["remoteId"]))
                if not result.get("id"):
                    raise meta.MetaError("Meta did not return an Ad Set ID.")
                ad_set["remoteId"] = result["id"]
                async with transaction() as db:
                    await db.update("MetaAdSet", table("MetaAdSet").c.id == ad_set["id"], {"remoteId": result["id"], "status": "PAUSED"})
        for creative in full["creatives"]:
            if not creative["remoteId"]:
                result = await meta.create_creative(request.app.state.http, auth, account["remoteId"], creative_payload(creative))
                if not result.get("id"):
                    raise meta.MetaError("Meta did not return a creative ID.")
                creative["remoteId"] = result["id"]
                async with transaction() as db:
                    await db.update("MetaCreative", table("MetaCreative").c.id == creative["id"], {"remoteId": result["id"], "status": "READY"})
        ad_sets = {row["id"]: row for row in full["adSets"]}
        creatives = {row["id"]: row for row in full["creatives"]}
        for ad in full["ads"]:
            if not ad["remoteId"]:
                result = await meta.create_ad(request.app.state.http, auth, account["remoteId"], {"name": remote_name(ad["name"], ad["id"]),
                    "adset_id": ad_sets[ad["adSetId"]]["remoteId"], "creative": json.dumps({"creative_id": creatives[ad["creativeId"]]["remoteId"]}),
                    "status": "PAUSED"})
                if not result.get("id"):
                    raise meta.MetaError("Meta did not return an ad ID.")
                async with transaction() as db:
                    await db.update("MetaAd", table("MetaAd").c.id == ad["id"], {"remoteId": result["id"], "status": "PAUSED"})
        async with transaction() as db:
            await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id, {"status": "REMOTE_PAUSED", "errorMessage": None})
            await db.insert("MetaAuditEvent", {"userId": user["id"], "campaignId": campaign_id, "action": "CREATED_PAUSED",
                "afterData": {"remoteCampaignId": campaign["remoteId"]}})
        return {"success": True, "status": "REMOTE_PAUSED", "remoteId": campaign["remoteId"]}
    except meta.MetaError as error:
        async with transaction() as db:
            await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id,
                {"status": "NEEDS_RECONCILIATION" if error.ambiguous else "FAILED", "errorMessage": str(error)})
        raise


@router.post("/campaigns/{campaign_id}/reconcile")
async def reconcile_campaign(campaign_id: str, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        campaign = await owned_campaign(db, campaign_id, user["id"], True)
        full = await campaign_data(db, campaign)
        account = await db.one(select(table("MetaAdAccount")).where(table("MetaAdAccount").c.id == campaign["adAccountId"]))
    auth = await meta.user_auth(user["id"])
    groups = [(campaign, "campaigns", "MetaCampaign"),
              *[(row, "adsets", "MetaAdSet") for row in full["adSets"]],
              *[(row, "adcreatives", "MetaCreative") for row in full["creatives"]],
              *[(row, "ads", "MetaAd") for row in full["ads"]]]
    cache = {}
    for row, edge, table_name in groups:
        if row["remoteId"]:
            continue
        if edge not in cache:
            cache[edge] = await meta.list_named(request.app.state.http, auth, account["remoteId"], edge)
        matches = [item for item in cache[edge] if item.get("name") == remote_name(row["name"], row["id"])]
        if len(matches) > 1:
            raise HTTPException(409, f"Multiple matching Meta {edge} objects require manual review.")
        if matches:
            row["remoteId"] = matches[0]["id"]
            async with transaction() as db:
                await db.update(table_name, table(table_name).c.id == row["id"], {"remoteId": matches[0]["id"]})
    unresolved = [row["id"] for row, _, _ in groups if not row["remoteId"]]
    async with transaction() as db:
        await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id,
            {"status": "FAILED" if unresolved else "REMOTE_PAUSED", "errorMessage": "Retry creation to complete missing objects." if unresolved else None})
    return {"success": not unresolved, "unresolved": unresolved}


@router.post("/campaigns/{campaign_id}/activate")
async def activate_campaign(campaign_id: str, body: MetaActivation, request: Request, user=Depends(current_user)):
    writes_allowed(activation=True)
    async with transaction() as db:
        campaign = await owned_campaign(db, campaign_id, user["id"], True)
        full = await campaign_data(db, campaign)
    if not campaign["remoteId"] or any(not row["remoteId"] for row in [*full["adSets"], *full["ads"]]):
        raise HTTPException(409, "Create and reconcile the complete paused campaign before activation.")
    auth = await meta.user_auth(user["id"])
    try:
        for ad in full["ads"]:
            await meta.set_status(request.app.state.http, auth, ad["remoteId"], "ACTIVE")
        for ad_set in full["adSets"]:
            await meta.set_status(request.app.state.http, auth, ad_set["remoteId"], "ACTIVE")
        await meta.set_status(request.app.state.http, auth, campaign["remoteId"], "ACTIVE")
    except meta.MetaError:
        with suppress(meta.MetaError):
            await meta.set_status(request.app.state.http, auth, campaign["remoteId"], "PAUSED")
        raise
    async with transaction() as db:
        await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id, {"status": "ACTIVE", "errorMessage": None})
        for ad_set in full["adSets"]:
            await db.update("MetaAdSet", table("MetaAdSet").c.id == ad_set["id"], {"status": "ACTIVE"})
        for ad in full["ads"]:
            await db.update("MetaAd", table("MetaAd").c.id == ad["id"], {"status": "ACTIVE"})
        await db.insert("MetaAuditEvent", {"userId": user["id"], "campaignId": campaign_id, "action": "ACTIVATED",
            "beforeData": {"status": campaign["status"]}, "afterData": {"status": "ACTIVE"}})
    return {"success": True, "status": "ACTIVE"}


@router.post("/campaigns/{campaign_id}/pause")
async def pause_campaign(campaign_id: str, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        campaign = await owned_campaign(db, campaign_id, user["id"], True)
    if not campaign["remoteId"]:
        raise HTTPException(409, "This campaign has not been created in Meta.")
    await meta.set_status(request.app.state.http, await meta.user_auth(user["id"]), campaign["remoteId"], "PAUSED")
    async with transaction() as db:
        await db.update("MetaCampaign", table("MetaCampaign").c.id == campaign_id, {"status": "PAUSED", "errorMessage": None})
        await db.insert("MetaAuditEvent", {"userId": user["id"], "campaignId": campaign_id, "action": "PAUSED",
            "beforeData": {"status": campaign["status"]}, "afterData": {"status": "PAUSED"}})
    return {"success": True, "status": "PAUSED"}


@router.post("/campaigns/{campaign_id}/sync")
async def sync(campaign_id: str, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        await owned_campaign(db, campaign_id, user["id"])
    return {"success": True, **await sync_campaign(campaign_id, request.app.state.http)}


@router.post("/recommendations/{recommendation_id}")
async def decide(recommendation_id: str, body: MetaRecommendationDecision, request: Request,
                 user=Depends(current_user)):
    async with transaction() as db:
        r, c = table("MetaRecommendation"), table("MetaCampaign")
        recommendation = await db.one(select(r).select_from(r.join(c, r.c.campaignId == c.c.id)).where(
            r.c.id == recommendation_id, c.c.userId == user["id"]))
        if not recommendation:
            raise HTTPException(404, "Meta recommendation not found.")
        if recommendation["status"] != "PENDING":
            raise HTTPException(409, "This recommendation already has a decision.")
    action = recommendation["proposedAction"] or {}
    status = body.decision
    if body.decision == "APPROVED" and action.get("type") == "PAUSE_AD":
        writes_allowed()
        async with transaction() as db:
            ad = await db.one(select(table("MetaAd")).where(
                table("MetaAd").c.campaignId == recommendation["campaignId"],
                table("MetaAd").c.remoteId == action.get("remoteAdId")))
        if not ad:
            raise HTTPException(409, "The recommended Meta ad is no longer available.")
        await meta.set_status(request.app.state.http, await meta.user_auth(user["id"]), ad["remoteId"], "PAUSED")
        status = "EXECUTED"
        async with transaction() as db:
            await db.update("MetaAd", table("MetaAd").c.id == ad["id"], {"status": "PAUSED"})
            await db.insert("MetaAuditEvent", {"userId": user["id"], "campaignId": recommendation["campaignId"],
                "action": "RECOMMENDATION_EXECUTED", "beforeData": {"adStatus": ad["status"]},
                "afterData": {"adStatus": "PAUSED", "recommendationId": recommendation_id}})
    async with transaction() as db:
        await db.update("MetaRecommendation", table("MetaRecommendation").c.id == recommendation_id,
            {"status": status, "decidedAt": now()})
    return {"success": True, "status": status}
