#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a local Kokoro WAV file.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--voices", required=True)
    parser.add_argument("--voice")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--language", default="en-gb")
    parser.add_argument("--text-file")
    parser.add_argument("--output")
    parser.add_argument("--list-voices", action="store_true")
    return parser.parse_args()


def _macos_espeak_config():
    """Return an explicit Kokoro EspeakConfig for macOS.

    The espeakng-loader wheel can contain a libespeak-ng binary whose compiled-in
    data path points at the CI builder. Use the system Homebrew installation so
    the shared library and espeak-ng-data directory come from the same prefix.
    """
    from kokoro_onnx import EspeakConfig

    configured_lib = os.getenv("KOKORO_ESPEAK_LIB", "").strip()
    configured_data = os.getenv("KOKORO_ESPEAK_DATA", "").strip()
    if configured_lib or configured_data:
        if not configured_lib or not configured_data:
            raise SystemExit(
                "Set both KOKORO_ESPEAK_LIB and KOKORO_ESPEAK_DATA when overriding eSpeak NG paths."
            )
        lib_path = Path(configured_lib).expanduser()
        data_path = Path(configured_data).expanduser()
    else:
        brew = shutil.which("brew")
        if not brew:
            raise SystemExit(
                "Kokoro on macOS requires a system eSpeak NG installation.\n"
                "Install it with: brew install espeak-ng\n"
                "Then rerun npm run video:voiceover:setup."
            )
        try:
            prefix = Path(
                subprocess.check_output(
                    [brew, "--prefix", "espeak-ng"],
                    text=True,
                    stderr=subprocess.STDOUT,
                ).strip()
            )
        except subprocess.CalledProcessError as exc:
            detail = exc.output.strip()
            raise SystemExit(
                "Kokoro on macOS requires eSpeak NG.\n"
                "Install it with: brew install espeak-ng\n"
                f"Homebrew response: {detail}"
            ) from exc

        data_path = prefix / "share" / "espeak-ng-data"
        preferred = prefix / "lib" / "libespeak-ng.dylib"
        if preferred.exists():
            lib_path = preferred
        else:
            candidates = sorted((prefix / "lib").glob("libespeak-ng*.dylib"))
            lib_path = candidates[0] if candidates else preferred

    if not lib_path.is_file():
        raise SystemExit(
            f"eSpeak NG shared library was not found at {lib_path}.\n"
            "Run: brew reinstall espeak-ng"
        )
    if not (data_path / "phontab").is_file():
        raise SystemExit(
            f"eSpeak NG data is incomplete at {data_path} (missing phontab).\n"
            "Run: brew reinstall espeak-ng"
        )

    return EspeakConfig(lib_path=str(lib_path), data_path=str(data_path))


def _espeak_config():
    if sys.platform == "darwin":
        return _macos_espeak_config()
    return None


def main() -> int:
    args = parse_args()
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(args.model, args.voices, espeak_config=_espeak_config())
    try:
        voices = sorted(kokoro.get_voices())
        if args.list_voices:
            print("\n".join(voices))
            return 0

        if not args.voice:
            raise SystemExit("--voice is required unless --list-voices is used")
        if args.voice not in voices:
            raise SystemExit(
                f"Voice '{args.voice}' is not available. Available voices: {', '.join(voices)}"
            )
        if not args.text_file or not args.output:
            raise SystemExit("--text-file and --output are required for synthesis")
        if not (0.5 <= args.speed <= 2.0):
            raise SystemExit("--speed must be between 0.5 and 2.0")

        text = Path(args.text_file).read_text(encoding="utf-8").strip()
        if not text:
            raise SystemExit("Narration text is empty")

        import soundfile as sf

        samples, sample_rate = kokoro.create(
            text,
            voice=args.voice,
            speed=args.speed,
            lang=args.language,
        )
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output, samples, sample_rate, subtype="PCM_16")
        return 0
    finally:
        close = getattr(getattr(kokoro, "voices", None), "close", None)
        if callable(close):
            close()


if __name__ == "__main__":
    raise SystemExit(main())
