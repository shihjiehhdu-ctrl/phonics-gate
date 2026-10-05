/* 網站設定。改完存檔、上傳到 GitHub 就會生效。 */
window.GATE_CONFIG = {
  /* 部署好的 Apps Script 網址（結尾是 /exec），保留前後的引號。 */
  SHEET_API: "PASTE_YOUR_APPS_SCRIPT_URL_HERE",

  /* 是否開放報名。false 時首頁不顯示報名表單，只顯示「即將開放」。
     圖片和錄音都放齊、準備好對外公開時，再改成 true。
     還沒開放時，你自己可以用「網址後面加 ?preview=1」看到報名表單來測試。 */
  REGISTRATION_OPEN: false,

  /* 結果頁「預約諮詢」按鈕要連到的網址。留空就不顯示按鈕。 */
  BOOKING_URL: "",

  /* 顯示在頁面上的聯絡信箱，家長遇到問題或想刪除資料時使用。留空就不顯示。 */
  CONTACT_EMAIL: "",

  /* 圖片或錄音還沒齊全時，是否仍允許作答。
     false（預設）：素材不齊就不能作答。
     true：可以作答，缺的圖用文字、缺的錄音用瀏覽器語音，成績會標記為「素材未齊全」。只建議在測試時暫時打開。 */
  ALLOW_INCOMPLETE_ASSETS: false
};
