"""Campaign brief generation; workflow state stays in the orchestrator."""
import json

from app.config import get_settings
from app.integrations.research import ResearchProviders
from app.schemas.content import Brief
from app.skills import select_skill_context


async def create_brief(http, campaign, prompt, approval_mode):
    providers = ResearchProviders(get_settings(), http)
    skills = await select_skill_context(providers, json.dumps({
        "agent": "campaign planner", "prompt": prompt,
        "campaign": {k: campaign[k] for k in ("brandDescription", "targetAudience", "platforms", "tone", "postCount", "objective", "targetMetric")},
    }))
    brief = await providers.structured("master_planning", skills + "\n\nPrepare a specific English campaign brief. "
        "Keep it compact: objective under 300 characters, 1-3 content pillars, 2-4 research questions, "
        "1-3 success metrics, and creatorInstructions under 700 characters. Do not write the actual posts yet. "
        "Create exactly one deliverable per requested campaign post. Each deliverable must choose one configured "
        "platform and one exact format: Single Post, Carousel, or Reel. Preserve explicit quantities and mixed formats "
        "from the user's request. When format is unspecified, choose the best format for that deliverable's objective. "
        "Research questions must address factual subjects, announcements, dates and limitations, not generic marketing advice. "
        "Optimize for the supplied campaign objective and include its exact targetMetric in successMetrics. "
        "Preserve requested format. Available media: still images, 4–7-slide editorial carousels, 3–5-scene narrated text Reels. "
        "Never promise cinematic footage or guaranteed engagement. Copy approvalMode exactly; never infer publishing permission.",
        json.dumps({"prompt": prompt, "campaign": {k: campaign[k] for k in ("name", "brandDescription", "targetAudience", "platforms", "tone", "postCount", "objective", "targetMetric")}, "approvalMode": approval_mode}), Brief)
    if len(brief.deliverables) != campaign["postCount"]:
        raise ValueError(f"Content Lead must plan exactly {campaign['postCount']} deliverables.")
    if any(item.platform not in campaign["platforms"] for item in brief.deliverables):
        raise ValueError("Content Lead selected a platform that is not configured for this campaign.")
    brief.approvalMode = approval_mode
    return brief
