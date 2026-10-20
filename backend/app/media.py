import asyncio
import base64
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse, quote

from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException
from app.config import get_settings

render_lock = asyncio.Semaphore(1)


def font(size, bold=False):
    candidates = ([Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
                   Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")])
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    raise ValueError("Install Segoe UI or DejaVu Sans before rendering media.")


def wrap(text, face, width, max_lines):
    lines, current = [], ""
    for word in text.split():
        if face.getlength(word) > width:
            raise ValueError("The visual contains a word too long for the layout.")
        candidate = (current + " " + word).strip()
        if face.getlength(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        raise ValueError("The visual text is too long for the layout. Shorten it before rendering.")
    return lines


def render_slide(slide, brand, accent, source="", index=0, total=1, height=1350):
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        raise ValueError("Invalid brand colour.")
    dark = index == 0
    bg, ink, muted = ("#101828", "#f8fafc", "#b9c4d3") if dark else ("#f7f8fa", "#101828", "#526071")
    im = Image.new("RGB", (1080, height), bg)
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((72, 68, 112, 108), radius=12, fill=accent)
    draw.text((132, 68), brand[:40], font=font(28, True), fill=ink)
    draw.text((72, 170 if height < 1600 else 360), slide["eyebrow"].upper(), font=font(25, True), fill=accent)
    y = 235 if height < 1600 else 440
    headline = font(70 if height != 1080 else 62, True)
    for line in wrap(slide["headline"], headline, 936, 4):
        draw.text((72, y), line, font=headline, fill=ink)
        y += 88
    y += 48
    body = font(36 if height != 1080 else 32)
    for line in wrap(slide["body"], body, 920, 7 if height > 1080 else 5):
        if y > height - 240:
            raise ValueError("The visual copy overflows the safe text area.")
        draw.text((72, y), line, font=body, fill=muted)
        y += 54
    draw.line((72, height - 156, 1008, height - 156), fill=accent, width=3)
    draw.text((72, height - 116), source[:75], font=font(20), fill=muted)
    draw.text((930, height - 116), f"{index + 1:02}/{total:02}", font=font(22, True), fill=ink)
    output = io.BytesIO()
    im.save(output, "PNG")
    return output.getvalue()


async def upload(http, data, extension):
    key = get_settings().imagekit_private_key.get_secret_value()
    if not key:
        raise ValueError("Image storage is not configured in backend/.env.")
    name = hashlib.sha256(data).hexdigest() + "." + extension
    response = await http.post("https://upload.imagekit.io/api/v1/files/upload", auth=(key, ""),
        files={"file": (name, data, "video/mp4" if extension == "mp4" else "image/png")},
        data={"fileName": name, "folder": "/socialix/generated", "useUniqueFileName": "true"}, timeout=120)
    if not response.is_success:
        raise ValueError("Media storage upload failed.")
    url = response.json().get("url", "")
    if not url.startswith("https://"):
        raise ValueError("Media storage did not return a secure URL.")
    return url


def render_reel(scenes, brand, accent, source):
    if sys.platform != "win32":
        raise ValueError("Local narration currently requires a Windows render host.")
    settings = get_settings()
    with tempfile.TemporaryDirectory(prefix="socialix-reel-") as directory:
        root = Path(directory)
        clips = []
        for i, scene in enumerate(scenes):
            frame, speech, audio, clip = [root / f"scene-{i}.{extension}" for extension in ("png", "json", "wav", "mp4")]
            frame.write_bytes(render_slide(scene, brand, accent, source, i, len(scenes), 1920))
            speech.write_text(json.dumps({"text": scene["narration"]}), encoding="utf-8")
            subprocess.run([sys.executable, "-m", "app.narrate", str(speech), str(audio)], check=True,
                           timeout=60, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            duration = float(subprocess.check_output([settings.ffprobe_path, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(audio)], timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)) + .5
            if not 1 <= duration <= 45:
                raise ValueError("Narration duration is outside the supported range.")
            subprocess.run([settings.ffmpeg_path, "-y", "-loop", "1", "-i", str(frame), "-i", str(audio),
                "-t", str(duration), "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-vf", "fade=t=in:st=0:d=0.25", "-af", "apad,loudnorm", "-c:a", "aac", "-ar", "48000", str(clip)],
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
    profile = campaign.get("brandProfile") or {}
    brand, accent = campaign["name"], profile.get("accentColor", "#2563eb")
    sources = post.get("sourceUrls", [])
    source = "Source: " + urlparse(str(sources[0])).hostname if sources else ""
    async with render_lock:
        if post["format"] == "Reel":
            try:
                data = await asyncio.to_thread(render_reel, post["scenes"], brand, accent, source)
            except (subprocess.SubprocessError, OSError):
                raise ValueError("Local Reel rendering failed. Check FFmpeg and the installed English voice.") from None
            return [await upload(http, data, "mp4")]
        slides = post["slides"] if post["format"] == "Carousel" else [
            {"eyebrow": "A useful takeaway", "headline": post["imageHeadline"], "body": post["imageSummary"]}]
        frames = [await asyncio.to_thread(render_slide, s, brand, accent, source, i, len(slides), 1350 if post["format"] == "Carousel" else 1080) for i, s in enumerate(slides)]
        return [await upload(http, frame, "png") for frame in frames]


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
