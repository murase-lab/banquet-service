#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
画像最適化スクリプト（WebP変換＋リサイズ）

images/ 内の PNG / JPG / JPEG を、長辺を上限までリサイズしつつ WebP に変換する。
AVIF / WebP など既に軽い形式は対象外（触らない）。

- ローカル: `python scripts/optimize-images.py`
- GitHub Actions: 同じスクリプトを CI 上で実行（--delete-source 付き）

主なオプション:
  --max 1600        長辺の上限px（縮小のみ・拡大しない）。既定 1600
  --quality 80      WebP品質。既定 80
  --delete-source   変換後に元PNG/JPGを削除（CI/本番向け・軽量化）
  --force           既存 .webp が新しくても作り直す
"""
import argparse
import os
import re
import sys
import glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'images')
SRC_EXTS = ('.png', '.jpg', '.jpeg')


def human(n):
    return f'{n/1024:.0f}KB' if n < 1024 * 1024 else f'{n/1024/1024:.1f}MB'


def convert_one(src, max_side, quality, force, delete_source):
    base, _ = os.path.splitext(src)
    dst = base + '.webp'

    if (not force) and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return None  # 既に最新のwebpがある

    with Image.open(src) as im:
        im = im.convert('RGBA') if im.mode in ('P', 'LA') else im.convert('RGB') if im.mode != 'RGBA' else im
        w, h = im.size
        scale = min(1.0, max_side / float(max(w, h)))
        if scale < 1.0:
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        # RGBA のまま webp 保存も可能だが、写真はRGBで十分。透過が無ければRGB化。
        if im.mode == 'RGBA' and not _has_alpha(im):
            im = im.convert('RGB')
        im.save(dst, 'WEBP', quality=quality, method=6)

    src_size = os.path.getsize(src)
    dst_size = os.path.getsize(dst)
    if delete_source:
        os.remove(src)
    return (src, dst, src_size, dst_size)


def _has_alpha(im):
    try:
        alpha = im.getchannel('A')
        return alpha.getextrema()[0] < 255
    except Exception:
        return False


def fix_html_refs():
    """*.html 内の images/xxx.(png|jpg|jpeg) 参照を .webp に置換する。
    元画像は WebP 化済みなので、参照を安全に張り替えられる。"""
    pat = re.compile(r'(images/[^"\'\)\s]+?)\.(?:png|jpe?g)', re.IGNORECASE)
    total = 0
    for f in glob.glob(os.path.join(ROOT, '*.html')):
        s = open(f, encoding='utf-8').read()
        s2, n = pat.subn(lambda m: m.group(1) + '.webp', s)
        if n:
            open(f, 'w', encoding='utf-8').write(s2)
            total += n
            print(f'  参照修正 {os.path.basename(f)}: {n}箇所')
    if total:
        print(f'  HTML参照を {total}箇所 .webp に更新')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--max', type=int, default=1600)
    ap.add_argument('--quality', type=int, default=80)
    ap.add_argument('--delete-source', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--fix-html', action='store_true',
                    help='変換後、*.html の images/*.png|jpg 参照を .webp に張り替える')
    args = ap.parse_args()

    sources = [f for f in glob.glob(os.path.join(IMAGES_DIR, '*'))
               if f.lower().endswith(SRC_EXTS)]
    if not sources:
        print('変換対象なし（images/ に PNG/JPG がありません）')

    total_src = total_dst = 0
    converted = 0
    for src in sorted(sources):
        try:
            res = convert_one(src, args.max, args.quality, args.force, args.delete_source)
        except Exception as e:
            print(f'  失敗: {os.path.basename(src)} -> {e}')
            continue
        if res is None:
            print(f'  スキップ（最新）: {os.path.basename(src)}')
            continue
        _, dst, s, d = res
        total_src += s
        total_dst += d
        converted += 1
        print(f'  {os.path.basename(src)}: {human(s)} -> {os.path.basename(dst)} {human(d)} '
              f'(-{100 - d * 100 // s}%)')

    if converted:
        print(f'\n完了: {converted}枚変換  {human(total_src)} -> {human(total_dst)} '
              f'(-{100 - total_dst * 100 // total_src}%)')
    else:
        print('新規変換なし')

    if args.fix_html:
        fix_html_refs()


if __name__ == '__main__':
    # Windowsコンソールの文字化け対策（変換自体はUnicodeファイル名でも問題なし）
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    main()
