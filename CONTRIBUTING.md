# 參與這個專案

<!-- freedom-repository-guide:start -->
## 自由工坊：從一個成果到一個 PR

AI 開發公會可用的 Chrome 側欄多模型協作工具來源。 保留 Chrome extension、頁面 adapters 與同步對話介面。

先看[本倉 Issues](https://github.com/FreeTWAI-AI/multi-ai-chat/issues)與[現有 PR](https://github.com/FreeTWAI-AI/multi-ai-chat/pulls)。提出問題、這一輪範圍、完成條件與可投入時間，在 Issue 認領並協調重疊工作；維護者已直接派工時不必重複等待，將約定連回交接即可。使用自己的 fork／分支，PR 送到 **FreeTWAI-AI/multi-ai-chat:master**。

交給 Agent 前先讓它讀 [AGENTS.md](AGENTS.md)。PR 寫明變更用途、使用者可見結果、驗證命令、限制與原 Issue；附上可公開的合成案例或重現方式。Issue／PR 是程式協作的記錄，平台名片與公會身分不取代 repo 維護者的審查。

登入與 provider 網頁會話留在使用者瀏覽器；中央資料庫不收聊天內容、cookies 或擴充套件 profile。擴大 host permissions 與正式商店發布要在對應任務中明確處理。

### 這個模組怎麼驗證

選擇與修改範圍相符的既有入口：

```sh
npm run typecheck
npm test
npm run check:version
```

命令列在這裡不表示本輪已執行。先核對依賴與環境，再記錄實際結果；缺工具、桌面、媒體或授權時寫 `not_run` 與原因，不能補造成功。純文件修改以連結／路徑核對與 `git diff --check` 為主。

### 署名與上游

工坊 Fork：上游產品／授權來源為 [teddashh/multi-ai-chat](https://github.com/teddashh/multi-ai-chat)；本次協作的 Issue／PR 送到 **FreeTWAI-AI/multi-ai-chat**，不是自動送往上游。 保留原作者與授權檔，另列真正完成文件、測試、設計、程式或協作的人。使用 AI 時如實交代協作範圍；只有實際 GitHub PR／review／合併紀錄可以作為對應貢獻證據，不能靠自填帳號推定。

自願貢獻不保證案源、XP、收益或雇用。若產生付費合作，由當事人另定條款與 Seller 外部收款；平台不代收。秘密、客戶資料、真實交易單據與未授權素材不進公開 Issue／PR。
<!-- freedom-repository-guide:end -->
