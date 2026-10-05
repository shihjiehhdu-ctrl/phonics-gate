#!/usr/bin/env python3
"""檢查 site/assets/images/ 的圖片和 site/assets/audio/ 的錄音是否符合兩份清單。
用法：
  python3 workflow/check_assets.py            只檢查並列出結果
  python3 workflow/check_assets.py --update   同時把合格檔案的 status 改成 done、缺圖或不合格的改回 todo
只用 Python 標準函式庫。"""
import csv, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "workflow", "asset-manifest.csv")
IMAGES = os.path.join(ROOT, "site", "assets", "images")
AUDIO_MANIFEST = os.path.join(ROOT, "workflow", "audio-manifest.csv")
AUDIO = os.path.join(ROOT, "site", "assets", "audio")
SIZE = 768            # 規定的長寬（像素）
MAX_BYTES = 200_000   # 單檔上限

def jpeg_size(path):
    with open(path, "rb") as f:
        if f.read(2) != b"\xff\xd8":
            return None
        while True:
            b = f.read(1)
            if not b:
                return None
            if b != b"\xff":
                continue
            m = f.read(1)
            while m == b"\xff":
                m = f.read(1)
            if not m:
                return None
            code = m[0]
            if code in (0xD8, 0x01) or 0xD0 <= code <= 0xD7:
                continue
            seg = f.read(2)
            if len(seg) < 2:
                return None
            n = struct.unpack(">H", seg)[0]
            if code in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                d = f.read(5)
                h, w = struct.unpack(">HH", d[1:5])
                return w, h
            f.seek(n - 2, 1)

def check_audio(update):
    if not os.path.exists(AUDIO_MANIFEST):
        return False
    with open(AUDIO_MANIFEST, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())
    ok, missing, bad = 0, [], []
    for r in rows:
        p = os.path.join(AUDIO, r["file"])
        if not os.path.exists(p):
            missing.append(r["file"]); r["_ok"] = False
        elif os.path.getsize(p) < 1000:
            bad.append(r["file"]); r["_ok"] = False
        else:
            ok += 1; r["_ok"] = True
    known = {r["file"] for r in rows}
    extra = sorted(f for f in os.listdir(AUDIO) if not f.startswith(".") and f not in known) if os.path.isdir(AUDIO) else []
    print(f"錄音清單共 {len(rows)} 個：合格 {ok}、缺檔 {len(missing)}、檔案過小 {len(bad)}")
    if bad:
        print("  檔案過小（可能是空檔）：" + "、".join(bad))
    if extra:
        print("  不在清單內的錄音檔（檔名可能打錯）：" + "、".join(extra))
    if missing and len(missing) <= 20:
        print("  缺檔：" + "、".join(missing))
    if update:
        for r in rows:
            r["status"] = "done" if r["_ok"] else "todo"
        with open(AUDIO_MANIFEST, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
            for r in rows:
                w.writerow({k: r[k] for k in fields})
    return bool(bad or extra)

def main():
    update = "--update" in sys.argv
    with open(MANIFEST, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())
    ok, missing, bad = [], [], []
    for r in rows:
        p = os.path.join(IMAGES, r["file"])
        if not os.path.exists(p):
            missing.append(r["file"]); r["_ok"] = False; continue
        problems = []
        dim = jpeg_size(p)
        if dim is None:
            problems.append("不是有效的 JPEG")
        elif dim != (SIZE, SIZE):
            problems.append(f"尺寸 {dim[0]}x{dim[1]}，應為 {SIZE}x{SIZE}")
        if os.path.getsize(p) > MAX_BYTES:
            problems.append(f"檔案 {os.path.getsize(p)//1000} KB，超過 {MAX_BYTES//1000} KB")
        if problems:
            bad.append((r["file"], "；".join(problems))); r["_ok"] = False
        else:
            ok.append(r["file"]); r["_ok"] = True
    known = {r["file"] for r in rows}
    extra = sorted(f for f in os.listdir(IMAGES) if not f.startswith(".") and f not in known) if os.path.isdir(IMAGES) else []
    print(f"清單共 {len(rows)} 張：合格 {len(ok)}、缺圖 {len(missing)}、不合格 {len(bad)}")
    for b in ("0", "1", "2"):
        rs = [r for r in rows if r["batch"] == b]
        print(f"  第 {b} 批：{sum(r['_ok'] for r in rs)} / {len(rs)}")
    for f, why in bad:
        print(f"  不合格 {f}：{why}")
    if extra:
        print("  不在清單內的檔案（檔名可能打錯）：" + "、".join(extra))
    if missing and len(missing) <= 20:
        print("  缺圖：" + "、".join(missing))
    if update:
        for r in rows:
            r["status"] = "done" if r["_ok"] else "todo"
        with open(MANIFEST, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
            for r in rows:
                w.writerow({k: r[k] for k in fields})
        print("已更新 asset-manifest.csv 的 status 欄。")
    a_bad = check_audio(update)
    return 1 if (bad or extra or a_bad) else 0

if __name__ == "__main__":
    sys.exit(main())
