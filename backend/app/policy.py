import re
from datetime import datetime, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
from app.schemas.content import QualityReview

METRICS = ("views", "reach", "likes", "comments", "shares", "saves")


def local_datetime(value, zone):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    tz = ZoneInfo(zone)
    if parsed.tzinfo:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    aware = parsed.replace(tzinfo=tz, fold=0)
    if aware.astimezone(timezone.utc).astimezone(tz).replace(tzinfo=None) != parsed:
        raise ValueError("This local time does not exist because of daylight saving. Choose another time.")
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def validate_media(platform, format, urls):
    for url in urls:
        parsed = urlparse(str(url))
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Media must use a public HTTP URL without credentials.")
    video = lambda url: bool(re.search(r"\.(mp4|mov|webm)$", urlparse(str(url)).path, re.I))
    if not urls:
        raise ValueError("Add a media asset before scheduling.")
    if platform in {"YOUTUBE", "TIKTOK"} or format == "Reel":
        if len(urls) != 1 or not video(urls[0]):
            raise ValueError("Video publishing requires one uploaded video.")
    elif format == "Carousel":
        if len(urls) < 2 or any(video(url) for url in urls):
            raise ValueError("A carousel requires at least two images.")
    elif len(urls) != 1 or video(urls[0]):
        raise ValueError("A single image post requires exactly one image.")


def review(issues, sources=(), revisions=0):
    return {"status": "needs_review" if issues else "passed", "issues": issues[:30],
        "sourceUrls": list(sources), "checkedAt": datetime.now(timezone.utc).isoformat(), "revisions": revisions}


def can_auto_publish(value):
    try:
        parsed = QualityReview.model_validate(value)
        return parsed.status == "passed" and not parsed.issues
    except ValueError:
        return False


def similar(a, b):
    tokens = lambda text: set(re.findall(r"\w+", re.sub(r"https?://\S+|#\S+", "", text.lower())))
    left, right = tokens(a), tokens(b)
    return bool(left and right) and len(left & right) / len(left | right) >= .8


def content_issues(post, recent, allowed, avoid):
    issues = []
    sources = [str(url) for url in post.sourceUrls]
    text = "\n\n".join([post.title, post.caption, " ".join(post.hashtags)])
    if post.platform == "X" and len(text) > 280:
        issues.append("Shorten this post to fit X including links and hashtags.")
    if any(old["platforms"][0] == post.platform and similar(old["caption"], post.caption) for old in recent):
        issues.append("This repeats a recent post. Choose another angle.")
    if not sources or any(url not in allowed for url in sources):
        issues.append("Cite only evidence from the supplied research.")
    if any(url not in post.caption for url in sources):
        issues.append("Include supporting source links in the caption.")
    if any(word and word.lower() in text.lower() for word in avoid):
        issues.append("Remove wording on the campaign avoid list.")
    return issues


def summarize_metrics(metrics):
    def total(key):
        values = [m[key] for m in metrics if m.get(key) is not None]
        return sum(values) if values else None
    comparable = [m for m in metrics if all(m.get(k) is not None for k in ("reach", "likes", "comments", "shares", "saves"))]
    reach = sum(m["reach"] for m in comparable)
    engagements = sum(sum(m[k] for k in ("likes", "comments", "shares", "saves")) for m in comparable)
    return {"totalViews": total("views"), "totalReach": total("reach"),
            "engagementRate": engagements / reach * 100 if reach > 0 else None}
