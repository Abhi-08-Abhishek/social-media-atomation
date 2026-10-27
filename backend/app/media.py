import asyncio
import base64
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse, quote

from PIL import Image, ImageColor, ImageDraw, ImageFont, ImageOps
from app.config import get_settings

render_lock = asyncio.Semaphore(1)
image_generation_limit = asyncio.Semaphore(2)
MAX_IMAGE_BYTES = 20 * 1024 * 1024


def validate_image(data):
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Generated image is empty or exceeds 20 MB.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height, kind = image.width, image.height, image.format
            image.verify()
    except Exception:
        raise ValueError("Image provider returned an invalid image.") from None
    extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}.get(kind)
    if not extension or min(width, height) < 1024:
        raise ValueError("Generated image must be PNG, JPEG or WebP with a shortest side of at least 1024px.")
    return extension


async def generate_image(http, prompt, aspect_ratio):
    settings = get_settings()
    account_id = settings.cloudflare_account_id
    token = settings.cloudflare_api_token.get_secret_value()
    model = settings.cloudflare_image_model
    if (len(account_id) != 32 or any(char not in "0123456789abcdefABCDEF" for char in account_id)
            or not token or not model.startswith("@cf/") or any(char in model for char in "?#")):
        raise ValueError("Cloudflare image generation is not configured correctly in backend/.env.")
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    payload = {"prompt": prompt, "steps": 4}
    timeout = settings.media_generation_timeout_seconds
    async with image_generation_limit:
        for attempt in range(3):
            response = await http.post(endpoint, headers={"Authorization": "Bearer " + token},
                                       json=payload, timeout=timeout)
            if response.status_code in {429, 502, 503, 504} and attempt < 2:
                await asyncio.sleep(2 ** attempt)
                continue
            if not response.is_success:
                raise ValueError(f"Cloudflare image generation failed with status {response.status_code}.")
            try:
                data = base64.b64decode(response.json()["result"]["image"], validate=True)
            except (KeyError, IndexError, TypeError, ValueError):
                raise ValueError("Cloudflare returned no usable image.") from None
            return data, validate_image(data)
    raise AssertionError("Unreachable")


def visual_prompt(slide, campaign, source, index, total, aspect_ratio, creative_brief=None):
    profile = campaign.get("brandProfile") or {}
    brief = creative_brief or {}
    return "\n".join([
        f"Create a high-resolution {aspect_ratio} text-free editorial background illustration.",
        f"Brand: {campaign['name']}. Brand description: {campaign.get('brandDescription', '')}.",
        f"Visual style: {profile.get('visualStyle', 'clean premium editorial infographic')}. Primary accent: {profile.get('accentColor', '#2563eb')}.",
        f"Audience: {brief.get('audience', campaign.get('targetAudience', ''))}. Angle: {brief.get('angle', '')}.",
        f"Creative direction: {brief.get('visualDirection', '')}. Intended takeaway: {brief.get('takeaway', '')}.",
        f"Visually communicate this concept without words: {slide['headline']}. {slide['body']}",
        "Keep the same art direction, palette and subject treatment across the series." if total > 1 else "",
        "Use a polished professional illustration with a calm composition and generous negative space.",
        "Do not render any text, letters, numbers, symbols, captions, labels, logos, watermarks, interfaces, or signage.",
    ])


def _font(size, bold=False):
    windows = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    names = [windows / ("seguisb.ttf" if bold else "segoeui.ttf"),
             "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(str(name), size)
        except OSError:
            continue
    raise ValueError("No supported TrueType font is installed for media rendering.")


def _lines(draw, text, font, width, limit):
    words = " ".join(str(text).split()).split()
    lines = []
    for word in words:
        candidate = word if not lines else lines[-1] + " " + word
        if draw.textlength(candidate, font=font) <= width:
            if lines:
                lines[-1] = candidate
            else:
                lines.append(candidate)
        else:
            if draw.textlength(word, font=font) > width:
                raise ValueError("Approved image text contains a word that is too wide for the template.")
            lines.append(word)
        if len(lines) > limit:
            raise ValueError("Approved image text does not fit the template; shorten it before approval.")
    return "\n".join(lines)


def render_slide(data, slide, campaign, source, index, total, aspect_ratio):
    size = (1080, 1920) if aspect_ratio == "9:16" else (1080, 1350)
    with Image.open(io.BytesIO(data)) as generated:
        fitted = ImageOps.fit(generated.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    # Copy onto a fresh RGB canvas so provider transparency/color metadata cannot affect our text.
    canvas = Image.new("RGB", size)
    canvas.paste(fitted)
    profile = campaign.get("brandProfile") or {}
    try:
        accent = ImageColor.getrgb(profile.get("accentColor", "#2563eb"))
    except ValueError:
        accent = (37, 99, 235)
    draw = ImageDraw.Draw(canvas)
    margin = 54
    points = slide.get("points") or []
    panel_bottom = size[1] - margin if points else (920 if aspect_ratio == "9:16" else 760)
    draw.rounded_rectangle((margin + 8, margin + 12, size[0] - margin + 8, panel_bottom + 12),
                           radius=38, fill=(148, 163, 184))
    draw.rounded_rectangle((margin, margin, size[0] - margin, panel_bottom),
                           radius=38, fill=(255, 255, 255))
    if not points:
        draw.rounded_rectangle((margin + 8, size[1] - 134 + 8, size[0] - margin + 8, size[1] - margin + 8),
                               radius=24, fill=(148, 163, 184))
        draw.rounded_rectangle((margin, size[1] - 134, size[0] - margin, size[1] - margin),
                               radius=24, fill=(255, 255, 255))
    left, right = 94, size[0] - 94
    width = right - left
    brand_font, eyebrow_font = _font(24, True), _font(24, True)
    headline_font = _font(66 if aspect_ratio != "9:16" else 72, True)
    body_font = _font(29 if aspect_ratio != "9:16" else 32)
    point_title_font = _font(27 if aspect_ratio != "9:16" else 30, True)
    point_body_font = _font(22 if aspect_ratio != "9:16" else 26)
    footer_font = _font(18)

    brand = str(campaign.get("name") or "").strip()
    accent_soft = tuple(round(channel * .14 + 255 * .86) for channel in accent)
    chip_width = min(width, int(draw.textlength(brand, font=brand_font)) + 44)
    draw.rounded_rectangle((left, 92, left + chip_width, 142), radius=25, fill=accent_soft)
    draw.ellipse((left + 14, 108, left + 28, 122), fill=accent)
    draw.text((left + 36, 102), brand, font=brand_font, fill=(30, 41, 59))
    eyebrow = str(slide.get("eyebrow") or "A useful takeaway").upper()
    draw.text((left, 182), eyebrow, font=eyebrow_font, fill=accent)

    headline = _lines(draw, slide["headline"], headline_font, width, 3)
    draw.multiline_text((left, 228), headline, font=headline_font, fill=(15, 23, 42), spacing=8)
    headline_box = draw.multiline_textbbox((left, 228), headline, font=headline_font, spacing=8)
    y = headline_box[3] + 30
    body = _lines(draw, slide.get("body", ""), body_font, width, 4)
    draw.multiline_text((left, y), body, font=body_font, fill=(71, 85, 105), spacing=8)
    body_box = draw.multiline_textbbox((left, y), body, font=body_font, spacing=8)
    y = body_box[3] + 34

    if points:
        available = size[1] - 150 - y
        gap = 14
        card_height = (available - gap * (len(points) - 1)) // len(points)
        if card_height < 126:
            raise ValueError("Approved infographic points do not fit the template; shorten them before approval.")
        for point_index, point in enumerate(points):
            top = y + point_index * (card_height + gap)
            bottom = top + card_height
            draw.rounded_rectangle((left, top, right, bottom), radius=22, fill=(248, 250, 252),
                                   outline=accent, width=2)
            circle_top = top + 22
            draw.ellipse((left + 20, circle_top, left + 70, circle_top + 50), fill=accent)
            number = str(point_index + 1)
            number_box = draw.textbbox((0, 0), number, font=point_title_font)
            draw.text((left + 45 - (number_box[2] - number_box[0]) / 2,
                       circle_top + 25 - (number_box[3] - number_box[1]) / 2 - number_box[1]),
                      number, font=point_title_font, fill="white")
            text_left = left + 92
            point_width = right - text_left - 22
            title = _lines(draw, point["title"], point_title_font, point_width, 1)
            detail = _lines(draw, point["body"], point_body_font, point_width, 2)
            draw.text((text_left, top + 18), title, font=point_title_font, fill=(15, 23, 42))
            draw.multiline_text((text_left, top + 57), detail, font=point_body_font,
                                fill=(71, 85, 105), spacing=5)
    elif y > panel_bottom - 30:
        raise ValueError("Approved image text does not fit the template; shorten it before approval.")

    draw.line((left, size[1] - 112, right, size[1] - 112), fill=accent, width=4)
    draw.text((left, size[1] - 91), source, font=footer_font, fill=(100, 116, 139))
    counter = f"{index + 1:02}/{total:02}"
    draw.text((right, size[1] - 91), counter, font=footer_font, fill=(30, 41, 59), anchor="ra")
    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    rendered = output.getvalue()
    validate_image(rendered)
    return rendered, "png"


async def upload(http, data, extension):
    key = get_settings().imagekit_private_key.get_secret_value()
    if not key:
        raise ValueError("Image storage is not configured in backend/.env.")
    name = hashlib.sha256(data).hexdigest() + "." + extension
    response = await http.post("https://upload.imagekit.io/api/v1/files/upload", auth=(key, ""),
        files={"file": (name, data, {"mp4": "video/mp4", "jpg": "image/jpeg", "webp": "image/webp"}.get(extension, "image/png"))},
        data={"fileName": name, "folder": "/socialix/generated", "useUniqueFileName": "true"}, timeout=120)
    if not response.is_success:
        raise ValueError("Media storage upload failed.")
    url = response.json().get("url", "")
    if not url.startswith("https://"):
        raise ValueError("Media storage did not return a secure URL.")
    return url


def render_reel(frames, scenes):
    if sys.platform != "win32":
        raise ValueError("Local narration currently requires a Windows render host.")
    settings = get_settings()
    with tempfile.TemporaryDirectory(prefix="socialix-reel-") as directory:
        root = Path(directory)
        clips = []
        for i, (frame_data, scene) in enumerate(zip(frames, scenes)):
            frame, speech, audio, clip = [root / f"scene-{i}.{extension}" for extension in ("png", "json", "wav", "mp4")]
            frame.write_bytes(frame_data)
            speech.write_text(json.dumps({"text": scene["narration"]}), encoding="utf-8")
            subprocess.run([sys.executable, "-m", "app.narrate", str(speech), str(audio)], check=True,
                           timeout=60, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            duration = float(subprocess.check_output([settings.ffprobe_path, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(audio)], timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)) + .5
            if not 1 <= duration <= 45:
                raise ValueError("Narration duration is outside the supported range.")
            subprocess.run([settings.ffmpeg_path, "-y", "-loop", "1", "-i", str(frame), "-i", str(audio),
                "-t", str(duration), "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fade=t=in:st=0:d=0.25",
                "-af", "apad,loudnorm", "-c:a", "aac", "-ar", "48000", str(clip)],
                check=True, timeout=180, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            clips.append(clip)
        manifest = root / "clips.txt"
        manifest.write_text("\n".join(f"file '{clip.name}'" for clip in clips), encoding="utf-8")
        output = root / "reel.mp4"
        subprocess.run([settings.ffmpeg_path, "-y", "-f", "concat", "-safe", "1", "-i", str(manifest), "-c", "copy",
            "-movflags", "+faststart", str(output)], check=True, timeout=60, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        metadata = json.loads(subprocess.check_output([settings.ffprobe_path, "-v", "error", "-show_streams", "-of", "json", str(output)], timeout=20, creationflags=subprocess.CREATE_NO_WINDOW))
        video = next((s for s in metadata["streams"] if s["codec_type"] == "video"), {})
        if video.get("width") != 1080 or video.get("height") != 1920 or not any(s["codec_type"] == "audio" for s in metadata["streams"]):
            raise ValueError("The generated Reel failed media validation.")
        if output.stat().st_size > 90 * 1024 * 1024:
            raise ValueError("The generated Reel exceeds the upload limit.")
        return output.read_bytes()


async def generate_media(http, post, campaign):
    sources = post.get("sourceUrls", [])
    source = "Source: " + urlparse(str(sources[0])).hostname if sources else ""
    if post["format"] == "Carousel":
        slides, aspect = post["slides"], "4:5"
    elif post["format"] == "Reel":
        slides, aspect = post["scenes"], "9:16"
    else:
        slides, aspect = [{"eyebrow": "A useful takeaway", "headline": post["imageHeadline"],
                           "body": post["imageSummary"], "points": post.get("imagePoints", [])}], "4:5"
    generated = await asyncio.gather(*(generate_image(http,
        visual_prompt(slide, campaign, source, index, len(slides), aspect, post.get("creativeBrief")), aspect)
        for index, slide in enumerate(slides)))
    generated = [render_slide(data, slide, campaign, source, index, len(slides), aspect)
                 for index, ((data, _), slide) in enumerate(zip(generated, slides))]
    if post["format"] == "Reel":
        async with render_lock:
            try:
                data = await asyncio.to_thread(render_reel, [data for data, _ in generated], post["scenes"])
            except (subprocess.SubprocessError, OSError):
                raise ValueError("Local Reel rendering failed. Check FFmpeg and the installed English voice.") from None
            return [await upload(http, data, "mp4")]
    return list(await asyncio.gather(*(upload(http, data, extension) for data, extension in generated)))


def transform_image(src, operation, prompt="", background=""):
    endpoint = get_settings().imagekit_url_endpoint.rstrip("/")
    if not endpoint.startswith("https://"):
        raise ValueError("Configure a secure ImageKit URL endpoint.")
    parsed = urlparse(src)
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
        raise ValueError("Provide a public HTTP image URL without credentials.")
    encode = lambda value: base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")
    transforms = {"remove_bg": "e-bgremove", "cutout_shadow": "e-bgremove:e-dropshadow", "upscale": "e-upscale:q-95",
        "retouch": "e-retouch", "variation": "e-genvar", "prompt_edit": "e-edit-prompte-" + encode(prompt) if prompt else "",
        "change_bg": "e-changebg-prompte-" + encode(background) if background else ""}
    transform = transforms.get(operation)
    if not transform:
        raise ValueError("Unsupported operation or missing edit prompt.")
    if parsed.hostname == "ik.imagekit.io":
        params = dict(parse_qsl(parsed.query))
        params["tr"] = (params["tr"] + ":" if params.get("tr") else "") + transform
        return urlunparse(parsed._replace(query=urlencode(params)))
    return endpoint + "/" + quote(src, safe="") + "?" + urlencode({"tr": transform})
