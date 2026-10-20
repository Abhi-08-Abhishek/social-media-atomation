"""Isolated local speech process; narration is data, never shell code."""
import json
import sys
from pathlib import Path
import pyttsx3


def main():
    text = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["text"]
    if not isinstance(text, str) or not 1 <= len(text) <= 260:
        raise ValueError("Invalid narration text")
    engine = pyttsx3.init("sapi5")
    voices = engine.getProperty("voices")
    voice = next((v for v in voices if any(name in v.name.lower() for name in ("david", "zira", "english"))), None)
    if not voice:
        raise ValueError("Install an English Windows speech voice.")
    engine.setProperty("voice", voice.id)
    engine.setProperty("rate", 165)
    engine.save_to_file(text, sys.argv[2])
    engine.runAndWait()
    engine.stop()


if __name__ == "__main__":
    main()
