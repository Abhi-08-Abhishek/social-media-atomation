import json
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import Field, HttpUrl

from app.auth import current_user
from app.config import get_settings
from app.db import transaction, owned_campaign
from app.agents.research import run_research
from app.agents.creator import create_content, context, EDITORIAL_RULES
from app.integrations.research import ResearchProviders
from app.schemas.research import Contract, ResearchRequest
from app.schemas.content import Generate, CaptionEdit, Caption
from app.media import generate_media, transform_image

router = APIRouter(prefix="/api")


@router.post("/ai/generate")
async def generate(body: Generate, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user["id"], True)
    if body.platform not in campaign["platforms"]:
        raise HTTPException(400, "Choose a campaign platform.")
    research = await run_research(ResearchRequest(query=body.prompt), ResearchProviders(get_settings(), request.app.state.http))
    posts = await create_content(request.app.state.http, campaign, body.prompt, research.model_dump(mode="json"), 1, [body.platform], body.format)
    post = posts[0]
    return post | {"visualHeadline": post["imageHeadline"], "visualSummary": post["imageSummary"]}


@router.post("/ai/recreate-caption")
async def recreate(body: CaptionEdit, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user["id"])
    if body.platform not in campaign["platforms"]:
        raise HTTPException(400, "Choose a campaign platform.")
    result = await ResearchProviders(get_settings(), request.app.state.http).structured("caption_editing",
        EDITORIAL_RULES + " Preserve meaning, URLs, dates and qualifications. Do not add new factual claims. A rewrite is not a fact check.",
        json.dumps({"input": body.model_dump(), "context": await context(campaign)}, default=str), Caption)
    return result.model_dump() | {"modelUsed": "SenseNova (" + get_settings().sensenova_model + ")"}


class ImageRequest(Contract):
    campaignId: str
    title: str = Field(min_length=1, max_length=80)
    caption: str = Field(default="", max_length=160)


@router.post("/ai/generate-image")
async def image(body: ImageRequest, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user["id"])
    urls = await generate_media(request.app.state.http, {"format": "Single Post", "imageHeadline": body.title,
        "imageSummary": body.caption, "sourceUrls": []}, campaign)
    return {"imageUrl": urls[0]}


class ImageTransform(Contract):
    srcUrl: HttpUrl
    transformation: str
    prompt: str = Field(default="", max_length=2000)
    bgPrompt: str = Field(default="", max_length=2000)


@router.post("/imagekit/transform")
async def transform(body: ImageTransform, user=Depends(current_user)):
    url = transform_image(str(body.srcUrl), body.transformation, body.prompt, body.bgPrompt)
    return {"success": True, "originalUrl": str(body.srcUrl), "transformedUrl": url, "transformation": body.transformation}


class Prompt(Contract):
    prompt: str = Field(min_length=1, max_length=10000)


@router.post("/agents/research")
async def research(body: Prompt, request: Request, user=Depends(current_user)):
    result = await run_research(ResearchRequest(query=body.prompt), ResearchProviders(get_settings(), request.app.state.http))
    return {"success": True, "research": result}
