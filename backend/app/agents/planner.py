"""Campaign brief generation; workflow state stays in the orchestrator."""
import json

from app.config import get_settings
from app.integrations.research import ResearchProviders
from app.schemas.content import Brief


async def create_brief(http, campaign, prompt, approval_mode):
    providers = ResearchProviders(get_settings(), http)
    brief = await providers.structured("master_planning", "Prepare a specific English campaign brief. "
        "Keep it compact: objective under 300 characters, 1-3 content pillars, 2-4 research questions, "
        "1-3 success metrics, and creatorInstructions under 700 characters. Do not write the actual posts yet. "
        "Research questions must address factual subjects, announcements, dates and limitations, not generic marketing advice. "
        "Preserve requested format. Available media: still images, 4–7-slide editorial carousels, 3–5-scene narrated text Reels. "
        "Never promise cinematic footage or guaranteed engagement. Copy approvalMode exactly; never infer publishing permission.",
        json.dumps({"prompt": prompt, "campaign": {k: campaign[k] for k in ("name", "brandDescription", "targetAudience", "platforms", "tone", "postCount")}, "approvalMode": approval_mode}), Brief)
    brief.approvalMode = approval_mode
    return brief
