#!/usr/bin/env python3
"""用 OpenAI 的語音合成產生測驗需要的 89 個錄音檔，存到 site/assets/audio/。

用法（在專案資料夾裡執行）：
  python3 workflow/make_audio.py                     產生還沒有的檔案（已經有的不動）
  python3 workflow/make_audio.py --redo workflow/redo-list.csv
                                                     只重做檢查頁匯出的重做清單裡的錄音
  python3 workflow/make_audio.py --only w_bed w_bad  只重做指定的檔案（不用加 .mp3）
  python3 workflow/make_audio.py --force             全部重做
  python3 workflow/make_audio.py --voice cedar       換一個聲音（預設 marin）
  python3 workflow/make_audio.py --list              只列出會產生哪些檔案，不呼叫 API

API 金鑰：先找環境變數 OPENAI_API_KEY；沒有的話會請你貼上。金鑰不會寫進任何檔案。
只用 Python 內建的功能，不需要另外安裝套件。
"""
import argparse, concurrent.futures, csv, getpass, json, os, socket, ssl, sys, threading, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "workflow", "audio-manifest.csv")
OUT = os.path.join(ROOT, "site", "assets", "audio")
ENDPOINT = os.environ.get("TTS_ENDPOINT", "https://api.openai.com/v1/audio/speech")
MODEL = "gpt-4o-mini-tts"
TIMEOUT = float(os.environ.get("TTS_TIMEOUT", "30"))   # 每次請求最多等幾秒
PRINT = threading.Lock()


def say(msg):
    with PRINT:
        print(msg, flush=True)


# 有些網路的 IPv6 連不出去，Python 會先試 IPv6、等到逾時才改用 IPv4，每個檔案因此多等一兩分鐘。
# 這裡讓 IPv4 優先；加上 --ipv6 可以關掉這個調整。
_getaddrinfo = socket.getaddrinfo
def _ipv4_first(*args, **kwargs):
    return sorted(_getaddrinfo(*args, **kwargs), key=lambda r: 0 if r[0] == socket.AF_INET else 1)

# 給語音模型的朗讀指示。調整語氣時改這裡。
STYLE = {
    "word": ("You are recording audio for a listening test for young children who are learning English. "
             "Say only the single word you are given, once, in clear and natural General American English, "
             "at a calm, slightly slow pace with ordinary falling intonation. Pronounce every sound, including the final consonant, "
             "but do not exaggerate, stretch, or add any sound or syllable. Do not say anything else."),
    "sentence": ("You are recording audio for a listening test for young children who are learning English. "
                 "Read the sentence you are given once, clearly and naturally in General American English, "
                 "at a calm, slightly slow pace, the way a kind teacher reads to a five-year-old. Do not add or change any words."),
    "zh": ("用台灣常見的國語口音，溫和、親切、語速稍慢地，對學齡前的小朋友說出你收到的這句話。"
           "只說這句話，不要增加或改動任何字。"),
}
STYLE_OF = {"單詞": "word", "單詞第二次錄音": "word", "句子": "sentence", "中文說明": "zh"}


def load_manifest():
    with open(MANIFEST, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def read_redo(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return {r["file"].strip() for r in csv.DictReader(f) if r.get("file", "").strip().endswith(".mp3")}


def get_key():
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        try:
            key = getpass.getpass("請貼上 OpenAI API 金鑰（畫面上不會顯示），然後按 Enter：").strip()
        except (EOFError, KeyboardInterrupt):
            key = ""
    if not key:
        sys.exit("沒有金鑰，停止。")
    return key


def synth(key, text, style, voice, name=""):
    body = json.dumps({"model": MODEL, "voice": voice, "input": text, "instructions": STYLE[style], "response_format": "mp3"}).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    def wait(attempt, why):
        sec = 2 ** attempt * 2
        say("    %s：%s，%d 秒後重試（第 %d 次）" % (name, why, sec, attempt + 1))
        time.sleep(sec)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = r.read()
                if len(data) < 500:
                    raise RuntimeError("回傳的音檔太小（%d bytes）" % len(data))
                return data
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            if e.code in (401, 403):
                sys.exit("金鑰無效或沒有權限（HTTP %d）。請確認金鑰正確、帳戶有額度。\n%s" % (e.code, detail))
            if e.code == 400:
                raise RuntimeError("API 不接受這個請求（HTTP 400）：%s" % detail)
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                wait(attempt, "伺服器要求放慢（HTTP 429）" if e.code == 429 else "伺服器暫時錯誤（HTTP %d）" % e.code)
                continue
            raise RuntimeError("HTTP %d：%s" % (e.code, detail))
        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLError) or "CERTIFICATE_VERIFY_FAILED" in str(e.reason):
                sys.exit("無法建立安全連線（憑證問題）。如果你的 Python 是從 python.org 安裝的，"
                         "請到「應用程式 → Python 3.x」資料夾執行一次「Install Certificates.command」再試。")
            if attempt < 4:
                wait(attempt, "連線失敗（%s）" % e.reason)
                continue
            raise RuntimeError("連不上 OpenAI：%s" % e.reason)
        except (TimeoutError, socket.timeout):
            if attempt < 4:
                wait(attempt, "等了 %d 秒沒有回應" % TIMEOUT)
                continue
            raise RuntimeError("OpenAI 一直沒有回應")
    raise RuntimeError("重試多次仍失敗")


def main():
    ap = argparse.ArgumentParser(description="用 OpenAI 語音合成產生測驗錄音")
    ap.add_argument("--voice", default="marin", help="聲音名稱，預設 marin；也可以試 cedar、coral、sage 等")
    ap.add_argument("--force", action="store_true", help="已經有的檔案也重做")
    ap.add_argument("--only", nargs="+", metavar="檔名", help="只做這些檔案，例如 w_bed w_bad")
    ap.add_argument("--redo", metavar="CSV", help="檢查頁匯出的 redo-list.csv，只重做其中的 .mp3")
    ap.add_argument("--list", action="store_true", help="只列出要產生的檔案，不呼叫 API")
    ap.add_argument("--workers", type=int, default=3, help="同時產生幾個檔案，預設 3；遇到很多 HTTP 429 時改成 1")
    ap.add_argument("--ipv6", action="store_true", help="不要讓 IPv4 優先（一般不需要）")
    a = ap.parse_args()
    if not a.ipv6:
        socket.getaddrinfo = _ipv4_first
    if os.path.isdir(OUT):                       # 上次中斷留下的暫存檔
        for f in os.listdir(OUT):
            if f.endswith(".part"):
                os.remove(os.path.join(OUT, f))

    rows = load_manifest()
    known = {r["file"] for r in rows}
    if a.redo:
        wanted = read_redo(a.redo)
        if not wanted:
            sys.exit("重做清單裡沒有任何 .mp3 檔。")
    elif a.only:
        wanted = {x if x.endswith(".mp3") else x + ".mp3" for x in a.only}
    else:
        wanted = None
    if wanted:
        unknown = sorted(wanted - known)
        if unknown:
            sys.exit("錄音清單裡沒有這些檔案：" + "、".join(unknown))
    redoing = wanted is not None
    todo = [r for r in rows if (r["file"] in wanted if redoing else (a.force or not os.path.exists(os.path.join(OUT, r["file"]))))]

    print("聲音：%s　要產生 %d 個檔案（清單共 %d 個）" % (a.voice, len(todo), len(rows)))
    if a.list or not todo:
        for r in todo:
            print("  %s　%s" % (r["file"], r["text"]))
        if not todo:
            print("沒有需要產生的檔案。要全部重做請加 --force。")
        return
    key = get_key()
    os.makedirs(OUT, exist_ok=True)
    done, failed, count = [], [], [0]
    started = time.time()

    def one(r):
        path, t0 = os.path.join(OUT, r["file"]), time.time()
        try:
            style = STYLE_OF.get(r["type"], "word")
            text = r["text"].rstrip(".") + "." if style == "word" else r["text"]   # 單詞加句點：短字比較不會被念成沒有聲音或語調奇怪
            data = synth(key, text, style, a.voice, r["file"])
            tmp = path + ".part"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
            done.append(r["file"]); ok = "%.1f 秒" % (time.time() - t0)
        except RuntimeError as e:
            failed.append(r["file"]); ok = "失敗：%s" % e
        with PRINT:
            count[0] += 1
            print("  [%d/%d] %s　%s　%s" % (count[0], len(todo), r["file"], r["text"], ok), flush=True)

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, a.workers)) as ex:
            list(ex.map(one, todo))
    except KeyboardInterrupt:
        print("\n已中斷。已完成的檔案都保留著，再執行一次同樣的指令會從缺的開始做。")
        os._exit(130)
    done = len(done)
    print("（共花 %.0f 秒）" % (time.time() - started))
    print("\n完成 %d 個%s。" % (done, "，失敗 %d 個：%s" % (len(failed), "、".join(failed)) if failed else ""))
    if failed:
        print("再執行一次同樣的指令會補做缺的檔案。")
        sys.exit(1)
    print("下一步：用瀏覽器打開 workflow/review.html，到「錄音」分頁試聽。")


if __name__ == "__main__":
    main()
