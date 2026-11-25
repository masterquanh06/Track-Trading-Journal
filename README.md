# TrackDailyTrade — Multi-Platform Trading Journal & Analytics

**TrackDailyTrade** is an advanced multi-platform Trading Journal & Performance Analytics platform inspired by **TradeZella Pro**, built on a modular **Auto-Sync Adapter Architecture** with exact `Decimal` financial arithmetic, a sleek **Dark / Light Fintech UI**, and real-time **MetaTrader 5** synchronization.

---

## Key Features

### 1. Multi-Platform Synchronization (Auto-Sync Adapter Architecture)
- **MT5 Realtime Webhook EA (`TrackDailyTrade.ex5` / `.mq5`)**:
  - Automatically pushes closed positions in real time with built-in **anti-miss Backfill** on startup or on demand via the on-chart **`Sync Now (7d)`** button.
  - **Accurate Partial-Close Aggregation**: Groups all `DEAL_ENTRY_IN` / `DEAL_ENTRY_OUT` executions by `positionId` into a single trade with volume-weighted open/close prices, total Gross PnL, Commission, Fee, and Swap.
  - **Automatic `Initial Stop Loss` & `1R` Lock**: Captures initial SL upon order entry or first SL placement on chart and locks it permanently (preserved across break-even moves and trailing stops).
  - **Live `Balance` & `Equity` Sync**: Streams real-time MT5 account Balance & Equity directly while automatically filtering out non-trading balance operations (`DEAL_TYPE_BALANCE`, `CREDIT`, `BONUS`).
- **MT5 Statement Importer (`.html` / `.htm` / `.csv`)**:
  - Automatically detects both MT5 default **UTF-16LE** and **UTF-8** encodings, parses closed `Positions`, converts broker server timezones (`Europe/Athens` DST GMT+2/GMT+3) to UTC, and provides a safe **Dry Run Preview** with deduplication.

### 2. Pro Performance Analytics
- **Core Trading KPIs**: Net PnL, Win Rate, Profit Factor, Expectancy (`$` & `R-Multiple`), Avg Win / Avg Loss, Max Drawdown (`$` & `%`), and Average Holding Time.
- **Equity Curve & Drawdown Underwater**: Interactive **TradingView Lightweight Charts** equity curve paired with cumulative Net PnL and underwater drawdown visualization below `$0`.
- **Zella Score · Consistency Radar**: Composite `0–100` performance & discipline score visualized on a 5-axis Radar chart (*Win Rate*, *Profit Factor*, *Avg W/L*, *SL Discipline*, and *Consistency*).
- **Performance by Session**: Automatic performance breakdown across **Asian (`Tokyo`)**, **European (`London`)**, and **US (`New York`)** trading sessions based on UTC entry time.
- **Calendar PnL & Multi-Dimensional Breakdowns**: Daily and weekly PnL heatmap calendar, plus performance breakdowns by hour of day, day of week, holding duration, symbol, and custom **Strategy Tags** (`BB Tier 3`, `SMC MTF`, `Tier SSS`, etc.).

### 3. Trade Journal & Result Sharing
- **Trade Detail Sheet**: Attach **TradingView Chart Snapshots** (paste URL or `Ctrl+V` / `Cmd+V` clipboard image directly), log **Pre-trade Plans** & **Post-trade Reviews**, assign Strategy Tags, and manually refine `Initial SL` / `1R` with instant `R-Multiple` preview.
- **Share Trade Card (PNG)**: Export high-resolution (`1200×675`) trade summary cards with built-in **Privacy Mode** to hide `$` amounts and lot sizes while sharing `R-Multiple` / `% gain`.
- **Personalized Fintech Experience**: Smooth **Dark / Light Theme** switching across all surfaces and charts, collapsible sidebar workspace, and instant **English (`EN`) / Vietnamese (`VI`)** language toggle.
