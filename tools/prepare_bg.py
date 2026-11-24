#!/usr/bin/env python3
"""land-rpg v4.1.0 — 전투 배경 에셋 준비 (image-generation 원본 → 배포용 WebP)

원본: assets/bg/<theme>_raw.png   (1536×1024 생성 이미지)
출력: assets/bg/<theme>.webp      (960×640, 품질 78, 80~150KB 목표)

가공 이유
  1) 캐릭터·몬스터·데미지 숫자가 배경에 묻히지 않도록 하단에 옅은 어둠 그라데이션을 깐다.
  2) 모바일 캐시 부담을 줄이려 가로 960px 로 줄이고 WebP 로 압축한다.
  3) 하단 지면(캐릭터 발이 닿는 구간)은 채도를 살짝 낮춰 스프라이트가 도드라지게 한다.

사용: python3 tools/prepare_bg.py
"""
import os

from PIL import Image, ImageEnhance, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, "assets", "bg")
THEMES = ["meadow", "forest", "ruins", "desert", "cave", "volcano", "ice", "abyss"]
OUT_W, OUT_H = 960, 640
QUALITY = 86


def shade(im):
    """하단 어둠 그라데이션 + 하단 채도 감소 (캐릭터 가독성)."""
    w, h = im.size
    # 1) 전체 채도를 살짝 낮춘다 (이미 차분한 톤이지만 한 번 더 눌러 준다)
    im = ImageEnhance.Color(im).enhance(0.94)
    # 2) 하단 45% → 바닥으로 갈수록 짙어지는 검정 그라데이션
    veil = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(veil)
    start = int(h * 0.55)
    for y in range(start, h):
        t = (y - start) / max(1, h - start)
        a = int(90 * (t ** 1.6))
        d.line([(0, y), (w, y)], fill=(4, 7, 12, a))
    # 3) 상단도 살짝 눌러 HUD(스테이지 칩·보스 버튼)가 읽히게
    for y in range(0, int(h * 0.16)):
        t = 1 - y / max(1, int(h * 0.16))
        a = int(42 * (t ** 1.4))
        d.line([(0, y), (w, y)], fill=(4, 7, 12, a))
    return Image.alpha_composite(im.convert("RGBA"), veil).convert("RGB")


def main():
    total = 0
    for name in THEMES:
        src = os.path.join(BG, f"{name}_raw.png")
        dst = os.path.join(BG, f"{name}.webp")
        if not os.path.exists(src):
            print(f"  ! 원본 없음: {src}")
            continue
        im = Image.open(src).convert("RGB")
        im = im.resize((OUT_W, OUT_H), Image.LANCZOS)
        im = shade(im)
        im.save(dst, "WEBP", quality=QUALITY, method=6)
        kb = os.path.getsize(dst) / 1024
        total += kb
        print(f"  ✓ {name}.webp  {im.size[0]}×{im.size[1]}  {kb:.0f}KB")
    print(f"  합계 {total:.0f}KB / 8장 (평균 {total / len(THEMES):.0f}KB)")


if __name__ == "__main__":
    main()
