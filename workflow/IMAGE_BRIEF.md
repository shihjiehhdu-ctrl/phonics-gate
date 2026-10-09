# 圖片素材工作說明

這份文件是給負責產生圖片的代理（GPT Work）讀的。請完整讀完再開始。

## 任務

為「Phonics 入門門檻測驗」產生 187 張插圖，存到指定位置。

測驗對象是還不識字的台灣孩子（約 4–8 歲）。孩子聽到一個英文單字或句子，從四張圖裡點出正確的一張。圖片是唯一的作答依據，所以圖的清楚程度和一致性直接決定測驗準不準。

完整清單在 `workflow/asset-manifest.csv`，每一列是一張圖：

| 欄位 | 意義 |
|---|---|
| file | 檔名，必須一字不差 |
| type | 單詞圖 或 情境圖 |
| batch | 批次：0、1、2 |
| key | 單詞圖是英文單字；情境圖是題號 |
| used_in | 這張圖用在哪些題目、扮演什麼角色 |
| description | 要畫什麼 |
| variation | 情境圖專用：這張圖和同題基準圖差在哪裡 |
| status | todo 或 done（由檢查腳本更新） |
| notes | 你可以在這裡留下說明 |

## 指定位置與格式

| 項目 | 規定 |
|---|---|
| 網頁用圖 | `site/assets/images/<file>` |
| 原始檔 | `workflow/source/<同名>.png` |
| 格式 | JPEG，768×768 像素，單檔 200 KB 以內 |
| 檔名 | 與清單的 file 欄完全相同：全小寫、底線、副檔名 `.jpg` |

在 macOS 上從原始檔轉檔：

```
sips -s format jpeg -s formatOptions 80 -z 768 768 workflow/source/w_cat.png --out site/assets/images/w_cat.jpg
```

圖片存進 `site/assets/images/` 後，測驗頁和素材檢查頁會自動顯示，不需要改任何程式。

### 可以寫入的地方

- `site/assets/images/`
- `workflow/source/`
- `workflow/asset-manifest.csv` 的 status 和 notes 兩欄

### 不可以改的地方

`site/index.html`、`site/config.js`、`site/data/`、`Code.gs`、`netlify.toml`、`workflow/review.html`，以及清單的其他欄位。`site/assets/audio/` 是錄音檔的位置，也不要動。發現清單有問題時，寫在 notes 欄並回報，不要自行改題目。

## 共同風格

- 扁平、簡潔的兒童插畫，輪廓線粗細一致，用色飽和但不刺眼。
- 純白背景，沒有邊框，沒有陰影以外的裝飾。
- 圖中不可以出現任何文字、字母、數字。
- 正方形構圖，主體置中。
- 187 張要像同一位畫家畫的。第 0 批核可後，後續每一張都以第 0 批作為風格參考圖。
- 人物造型中性、友善，不要有特定品牌或卡通角色的樣子。

## 單詞圖的規則

1. 一張圖只表達一個概念，主體佔畫面七到八成，不要加其他物件。
2. 動作和形容詞照 description 欄畫，不要自行換成別的場景。
3. 下列幾組圖會在同一題並排出現，而且英文發音很像，必須一眼就分得出來：
   cat／cut、pig／pin、hat／hot、bat／bag、bed／shed、pin／pan、leg／log、man／mat、sun／run、king／ring、egg／leg、sit／sing、glass／grass、hand／band、swing／swim、frog／log、nest／neck、string／strong、shell／well、sock／sick、lock／clock、brush／branch、track／crack、chin／thin。
4. 也有幾組意思相近的圖會並排，要畫得出差別：glass（無把手玻璃杯）／cup（有把手）、rope（粗繩）／string（細線）、man／king／boy、milk（紙盒）／glass。
5. 同一題的四張圖精緻度要相當，不能有一張特別顯眼。

## 情境圖的規則（最重要）

每一題有四張圖，檔名結尾分別是：

| 結尾 | 角色 |
|---|---|
| `_t` | 基準圖，符合句子 |
| `_s` | 只換主詞 |
| `_v` | 只換動作、屬性或位置關係 |
| `_o` | 只換地點或受詞 |

同一題的四張圖必須構圖、視角、背景、比例、色調都相同，只有 variation 欄指明的那一個成分不同。原因：如果四張圖在無關的地方有差異，孩子不用聽懂句子，靠畫面線索就能猜對。

做法：

1. 先畫 `_t`。
2. 以 `_t` 作為參考圖，用圖片編輯的方式產生另外三張，每次只改一個成分。
3. 四張並排檢查一次，確認沒有多餘的差異。

其他要求：

- 重複出現的角色在所有情境圖裡外觀要相同：man、king、dog、cat、pig、duck、frog。造型要和對應的單詞圖（`w_man.jpg`、`w_king.jpg` 等）一致。
- 屬性要畫得誇張、清楚：大／小、濕／乾、難過／開心、強壯／瘦弱、紅／黑。
- 位置關係要明確：在裡面、在上面、在旁邊，不能模稜兩可。

## 批次與停點

| 批次 | 內容 | 張數 | 做完之後 |
|---|---|---|---|
| 0 | 風格定錨：`w_cat`、`w_man`、`w_king`、`w_cut` 和第一題的四張情境圖 | 8 | 停下來，等使用者核可 |
| 1 | 其餘單詞圖 | 107 | 回報後繼續 |
| 2 | 其餘情境圖，按題號一題四張一起做 | 72 | 回報 |

第 0 批沒有核可之前，不要開始第 1 批。

每一批做完後執行：

```
python3 workflow/check_assets.py --update
```

腳本會檢查檔名、尺寸、檔案大小，並更新清單的 status 欄。腳本也會列出錄音檔的狀態，那不是你的工作範圍，可以忽略。有不合格的項目就修正到全部合格，再回報。

回報內容：這一批完成幾張、檢查結果、哪些圖你自己覺得沒把握（寫出檔名和原因）。

## 重做

使用者會在 `workflow/review.html` 標記要重做的圖，並把 `redo-list.csv` 放進 `workflow/`。

如果 `workflow/redo-list.csv` 存在：

1. 只重做清單內的 `.jpg` 檔案，依 reason 欄修正，其他圖不要動。清單裡的 `.mp3` 是錄音，由另一個腳本處理，不是你的工作。
2. 情境圖重做時，仍要以同題的 `_t` 為參考，維持四張一致。如果重做的是 `_t`，同題另外三張也要一起重做。
3. 完成後執行檢查腳本。清單裡沒有 `.mp3` 時，把檔案改名為 `redo-list-done-<日期>.csv`；有 `.mp3` 時保留原檔名，讓使用者處理錄音。

## 發佈到網站（使用者要求時才做）

這個資料夾如果是 GitHub repo 的本機複本，使用者可能會請你把圖片推上去，Netlify 會自動重新發佈。只提交圖片和清單，不要提交其他變更：

```
git add site/assets/images workflow/asset-manifest.csv
git commit -m "Add test images"
git push
```

`workflow/source/` 的原始檔很大，不要提交。使用者沒有要求時，不要執行 git 指令。

## 完成的定義

- 檢查腳本回報 187 張全部合格，沒有清單外的檔案。
- 沒有未處理的 `redo-list.csv`。
