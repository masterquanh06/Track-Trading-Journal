//+------------------------------------------------------------------+
//|                                              TrackDailyTrade.mq5 |
//|                         TrackDailyTrade — MT5 Webhook Journal EA |
//|     Live Balance/Equity + Partial-Close + Initial SL + Backfill  |
//+------------------------------------------------------------------+
#property copyright "TrackDailyTrade"
#property version   "1.10"
#property strict

//--- Input parameters
input string InpWebhookBatchUrl = "http://127.0.0.1:3005/api/webhooks/mt5/batch"; // Backend Batch Webhook URL
input int    InpBackfillDays    = 7;                                             // Backfill closed history days
input bool   InpSyncOnInit      = true;                                          // Auto-sync history on EA startup
input string InpBrokerTimezone  = "";                                            // Optional broker TZ override (empty = use Web App setting)
input bool   InpShowSyncButton  = true;                                          // Show "Sync Now" button on chart
input int    InpHttpTimeoutMs   = 5000;                                          // HTTP WebRequest timeout (ms)

//--- Chart object constants
#define BTN_SYNC_NAME    "TDT_BTN_SYNC_NOW"
#define LBL_STATUS_NAME  "TDT_LBL_SYNC_STATUS"
#define BATCH_CHUNK_SIZE 100

//--- Persisted initial risk cache per positionId
struct RiskRecord
{
   long   positionId;
   double initialStopLoss;
   double initialRiskAmount;
};

RiskRecord g_riskRecords[];
string     g_riskFileName = "";

//--- Forward declarations for strict MQL5 compilation
void UpdateStatusLabel(const string text, const color textColor);

//+------------------------------------------------------------------+
//| JSON string escaping helper                                      |
//+------------------------------------------------------------------+
string EscapeJsonString(const string inputStr)
{
   string out = inputStr;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\r", "\\r");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\t", "\\t");
   return out;
}

//+------------------------------------------------------------------+
//| Load persisted initial SL / Risk cache from MQL5/Files           |
//+------------------------------------------------------------------+
void LoadRiskCache()
{
   ArrayResize(g_riskRecords, 0);
   int handle = FileOpen(g_riskFileName, FILE_READ | FILE_CSV | FILE_ANSI, ',');
   if(handle == INVALID_HANDLE)
      return;

   while(!FileIsEnding(handle))
   {
      string posStr  = FileReadString(handle);
      string slStr   = FileReadString(handle);
      string riskStr = FileReadString(handle);

      if(posStr == "")
         continue;

      long posId = StringToInteger(posStr);
      if(posId <= 0)
         continue;

      int idx = ArraySize(g_riskRecords);
      ArrayResize(g_riskRecords, idx + 1);
      g_riskRecords[idx].positionId        = posId;
      g_riskRecords[idx].initialStopLoss   = StringToDouble(slStr);
      g_riskRecords[idx].initialRiskAmount = StringToDouble(riskStr);
   }
   FileClose(handle);
}

//+------------------------------------------------------------------+
//| Persist initial SL / Risk cache to MQL5/Files                    |
//+------------------------------------------------------------------+
void SaveRiskCache()
{
   int handle = FileOpen(g_riskFileName, FILE_WRITE | FILE_CSV | FILE_ANSI, ',');
   if(handle == INVALID_HANDLE)
   {
      Print("[TrackDailyTrade] Warning: Failed to open risk cache file: ", g_riskFileName);
      return;
   }

   int total = ArraySize(g_riskRecords);
   int startIdx = (total > 2000) ? (total - 2000) : 0;
   for(int i = startIdx; i < total; i++)
   {
      FileWrite(
         handle,
         IntegerToString(g_riskRecords[i].positionId),
         DoubleToString(g_riskRecords[i].initialStopLoss, 8),
         DoubleToString(g_riskRecords[i].initialRiskAmount, 2)
      );
   }
   FileClose(handle);
}

//+------------------------------------------------------------------+
//| Find cached risk record index by positionId                      |
//+------------------------------------------------------------------+
int FindRiskRecord(const long posId)
{
   int total = ArraySize(g_riskRecords);
   for(int i = total - 1; i >= 0; i--)
   {
      if(g_riskRecords[i].positionId == posId)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
//| Lock initial SL and compute 1R risk amount ONLY ONCE per posId   |
//+------------------------------------------------------------------+
void LockInitialRiskIfMissing(
   const long posId,
   const string symbol,
   const ENUM_POSITION_TYPE posType,
   const double volume,
   const double openPrice,
   const double sl
)
{
   if(posId <= 0 || sl <= 0.0 || volume <= 0.0 || openPrice <= 0.0)
      return;

   if(FindRiskRecord(posId) >= 0)
      return;

   ENUM_ORDER_TYPE orderType = (posType == POSITION_TYPE_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double calcProfit = 0.0;
   double riskAmount = 0.0;

   if(OrderCalcProfit(orderType, symbol, volume, openPrice, sl, calcProfit))
   {
      if(calcProfit < 0.0)
         riskAmount = MathAbs(calcProfit);
   }

   int idx = ArraySize(g_riskRecords);
   ArrayResize(g_riskRecords, idx + 1);
   g_riskRecords[idx].positionId        = posId;
   g_riskRecords[idx].initialStopLoss   = sl;
   g_riskRecords[idx].initialRiskAmount = riskAmount;

   SaveRiskCache();
   PrintFormat(
      "[TrackDailyTrade] Locked initial SL for position #%I64d (%s): SL=%s, Risk1R=%s",
      posId,
      symbol,
      DoubleToString(sl, (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS)),
      DoubleToString(riskAmount, 2)
   );
}

//+------------------------------------------------------------------+
//| Check if positionId still has remaining open volume > 0          |
//+------------------------------------------------------------------+
bool IsPositionStillOpen(const long posId)
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      long openPosId = PositionGetInteger(POSITION_IDENTIFIER);
      if(openPosId == posId && PositionGetDouble(POSITION_VOLUME) > 0.0)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Select open position by POSITION_IDENTIFIER and capture SL       |
//+------------------------------------------------------------------+
void CaptureOpenPositionRisk(const long posId)
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(PositionGetInteger(POSITION_IDENTIFIER) == posId)
      {
         string symbol = PositionGetString(POSITION_SYMBOL);
         ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         double volume    = PositionGetDouble(POSITION_VOLUME);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl        = PositionGetDouble(POSITION_SL);

         LockInitialRiskIfMissing(posId, symbol, posType, volume, openPrice, sl);
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| Scan all currently open positions to lock initial SL             |
//+------------------------------------------------------------------+
void CaptureAllOpenPositionsRisk()
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      long   posId     = PositionGetInteger(POSITION_IDENTIFIER);
      string symbol    = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double volume    = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl        = PositionGetDouble(POSITION_SL);

      LockInitialRiskIfMissing(posId, symbol, posType, volume, openPrice, sl);
   }
}

//+------------------------------------------------------------------+
//| Aggregate ALL deals for a fully-closed positionId into JSON      |
//+------------------------------------------------------------------+
bool BuildClosedPositionJson(const long posId, string &outJson)
{
   if(IsPositionStillOpen(posId))
      return false;

   if(!HistorySelectByPosition(posId))
      return false;

   int dealsTotal = HistoryDealsTotal();
   if(dealsTotal <= 0)
      return false;

   string   symbol           = "";
   string   direction        = "";
   double   inVolume         = 0.0;
   double   outVolume        = 0.0;
   double   inWeightedPrice  = 0.0;
   double   outWeightedPrice = 0.0;
   datetime openTime         = 0;
   datetime closeTime        = 0;
   double   finalSl          = 0.0;
   double   finalTp          = 0.0;
   double   firstDealSl      = 0.0;
   double   totalProfit      = 0.0;
   double   totalCommission  = 0.0;
   double   totalSwap        = 0.0;
   int      validDealsCount  = 0;

   for(int i = 0; i < dealsTotal; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0)
         continue;

      // Strictly ignore DEAL_TYPE_BALANCE, DEAL_TYPE_CREDIT, DEAL_TYPE_BONUS, etc.
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
         continue;

      ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      double   vol        = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double   price      = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      datetime dealTime   = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      double   dealProfit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double   dealComm   = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double   dealFee    = HistoryDealGetDouble(dealTicket, DEAL_FEE);
      double   dealSwap   = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      double   dealSl     = HistoryDealGetDouble(dealTicket, DEAL_SL);
      double   dealTp     = HistoryDealGetDouble(dealTicket, DEAL_TP);

      if(symbol == "")
         symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);

      totalProfit     += dealProfit;
      totalCommission += (dealComm + dealFee);
      totalSwap       += dealSwap;
      validDealsCount++;

      if(dealEntry == DEAL_ENTRY_IN)
      {
         inVolume        += vol;
         inWeightedPrice += (vol * price);

         if(openTime == 0 || dealTime < openTime)
            openTime = dealTime;

         if(direction == "")
            direction = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";

         if(firstDealSl <= 0.0 && dealSl > 0.0)
            firstDealSl = dealSl;
      }
      else if(dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY || dealEntry == DEAL_ENTRY_INOUT)
      {
         outVolume        += vol;
         outWeightedPrice += (vol * price);

         if(closeTime == 0 || dealTime >= closeTime)
         {
            closeTime = dealTime;
            finalSl   = dealSl;
            finalTp   = dealTp;
         }
      }
   }

   if(symbol == "" || direction == "" || inVolume <= 0.0 || outVolume <= 0.0 || openTime == 0 || closeTime == 0)
      return false;

   double avgOpenPrice  = inWeightedPrice / inVolume;
   double avgClosePrice = outWeightedPrice / outVolume;
   double netPnl        = totalProfit + totalCommission + totalSwap;

   int priceDigits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   if(priceDigits <= 0 || priceDigits > 8)
      priceDigits = 5;

   string openTimeServer  = TimeToString(openTime, TIME_DATE | TIME_SECONDS);
   string closeTimeServer = TimeToString(closeTime, TIME_DATE | TIME_SECONDS);

   double initSl   = 0.0;
   double initRisk = 0.0;
   int riskIdx = FindRiskRecord(posId);
   if(riskIdx >= 0)
   {
      initSl   = g_riskRecords[riskIdx].initialStopLoss;
      initRisk = g_riskRecords[riskIdx].initialRiskAmount;
   }
   else if(firstDealSl > 0.0)
   {
      initSl = firstDealSl;
   }

   string slField       = (finalSl > 0.0)  ? ("\"" + DoubleToString(finalSl, priceDigits) + "\"")  : "null";
   string tpField       = (finalTp > 0.0)  ? ("\"" + DoubleToString(finalTp, priceDigits) + "\"")  : "null";
   string initSlField   = (initSl > 0.0)   ? ("\"" + DoubleToString(initSl, priceDigits) + "\"")   : "null";
   string initRiskField = (initRisk > 0.0) ? ("\"" + DoubleToString(initRisk, 2) + "\"")           : "null";

   outJson = "{"
      + "\"positionId\":\"" + IntegerToString(posId) + "\","
      + "\"symbol\":\"" + EscapeJsonString(symbol) + "\","
      + "\"direction\":\"" + direction + "\","
      + "\"volume\":\"" + DoubleToString(inVolume, 4) + "\","
      + "\"openTimeServer\":\"" + openTimeServer + "\","
      + "\"closeTimeServer\":\"" + closeTimeServer + "\","
      + "\"openPrice\":\"" + DoubleToString(avgOpenPrice, priceDigits) + "\","
      + "\"closePrice\":\"" + DoubleToString(avgClosePrice, priceDigits) + "\","
      + "\"stopLoss\":" + slField + ","
      + "\"takeProfit\":" + tpField + ","
      + "\"initialStopLoss\":" + initSlField + ","
      + "\"initialRiskAmount\":" + initRiskField + ","
      + "\"grossPnl\":\"" + DoubleToString(totalProfit, 2) + "\","
      + "\"commission\":\"" + DoubleToString(totalCommission, 2) + "\","
      + "\"swap\":\"" + DoubleToString(totalSwap, 2) + "\","
      + "\"netPnl\":\"" + DoubleToString(netPnl, 2) + "\","
      + "\"rawDealsCount\":" + IntegerToString(validDealsCount)
      + "}";

   return true;
}

//+------------------------------------------------------------------+
//| POST batch JSON array + live accountBalance & accountEquity      |
//+------------------------------------------------------------------+
bool PostTradesBatch(const string &tradeJsonItems[], const int count)
{
   string accountNumber  = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string broker         = EscapeJsonString(AccountInfoString(ACCOUNT_COMPANY));
   string currency       = EscapeJsonString(AccountInfoString(ACCOUNT_CURRENCY));
   string accountBalance = DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2);
   string accountEquity  = DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2);

   string tzPart = "";
   if(StringLen(InpBrokerTimezone) > 0)
      tzPart = "\"brokerTimezone\":\"" + EscapeJsonString(InpBrokerTimezone) + "\",";

   bool allOk = true;
   int totalChunks = (count <= 0) ? 1 : ((count + BATCH_CHUNK_SIZE - 1) / BATCH_CHUNK_SIZE);

   for(int chunk = 0; chunk < totalChunks; chunk++)
   {
      int offset = chunk * BATCH_CHUNK_SIZE;
      int endIdx = (count <= 0) ? 0 : MathMin(offset + BATCH_CHUNK_SIZE, count);

      string tradesArray = "[";
      for(int i = offset; i < endIdx; i++)
      {
         if(i > offset)
            tradesArray += ",";
         tradesArray += tradeJsonItems[i];
      }
      tradesArray += "]";

      string payload = "{"
         + "\"accountNumber\":\"" + accountNumber + "\","
         + "\"broker\":\"" + broker + "\","
         + "\"currency\":\"" + currency + "\","
         + "\"accountBalance\":\"" + accountBalance + "\","
         + "\"accountEquity\":\"" + accountEquity + "\","
         + tzPart
         + "\"trades\":" + tradesArray
         + "}";

      uchar postData[];
      int encodedLen = StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
      if(encodedLen > 0)
         ArrayResize(postData, encodedLen - 1);

      uchar  result[];
      string resultHeaders = "";
      string headers = "Content-Type: application/json\r\n";

      ResetLastError();
      int statusCode = WebRequest(
         "POST",
         InpWebhookBatchUrl,
         headers,
         InpHttpTimeoutMs,
         postData,
         result,
         resultHeaders
      );

      if(statusCode == -1)
      {
         int err = GetLastError();
         PrintFormat(
            "[TrackDailyTrade] WebRequest failed (error %d). Allow URL in Tools -> Options -> Expert Advisors: %s",
            err,
            InpWebhookBatchUrl
         );
         UpdateStatusLabel("Sync Error (code " + IntegerToString(err) + ")", clrOrangeRed);
         allOk = false;
      }
      else if(statusCode >= 200 && statusCode < 300)
      {
         string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
         PrintFormat("[TrackDailyTrade] Synced %d trade(s) + Balance %s -> HTTP %d: %s", (endIdx - offset), accountBalance, statusCode, body);
      }
      else
      {
         string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
         PrintFormat("[TrackDailyTrade] API returned HTTP %d: %s", statusCode, body);
         UpdateStatusLabel("API Error HTTP " + IntegerToString(statusCode), clrOrangeRed);
         allOk = false;
      }
   }

   return allOk;
}

//+------------------------------------------------------------------+
//| Helper: Check if posId already collected in array                |
//+------------------------------------------------------------------+
bool ContainsPositionId(const long &arr[], const long posId)
{
   int n = ArraySize(arr);
   for(int i = 0; i < n; i++)
   {
      if(arr[i] == posId)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Backfill sync of closed positions over the last N days           |
//+------------------------------------------------------------------+
void SyncRecentHistory(const int days)
{
   int safeDays = (days <= 0) ? 7 : days;
   datetime nowServer  = TimeCurrent();
   datetime fromServer = nowServer - (datetime)((long)safeDays * 86400);

   if(!HistorySelect(fromServer, nowServer + 86400))
   {
      Print("[TrackDailyTrade] HistorySelect failed for backfill.");
      UpdateStatusLabel("HistorySelect failed", clrOrangeRed);
      return;
   }

   // Pass 1: Collect unique positionIds ONLY from actual BUY/SELL trade deals
   long posIds[];
   ArrayResize(posIds, 0);

   int totalDeals = HistoryDealsTotal();
   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0)
         continue;

      // Ignore deposits/withdrawals/credits/bonuses (DEAL_TYPE_BALANCE, etc.)
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
         continue;

      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT)
         continue;

      long posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      if(posId <= 0 || ContainsPositionId(posIds, posId))
         continue;

      int n = ArraySize(posIds);
      ArrayResize(posIds, n + 1);
      posIds[n] = posId;
   }

   // Pass 2: Aggregate each fully-closed position via HistorySelectByPosition
   string tradeItems[];
   ArrayResize(tradeItems, 0);

   int uniqueCount = ArraySize(posIds);
   for(int i = 0; i < uniqueCount; i++)
   {
      string itemJson = "";
      if(BuildClosedPositionJson(posIds[i], itemJson))
      {
         int k = ArraySize(tradeItems);
         ArrayResize(tradeItems, k + 1);
         tradeItems[k] = itemJson;
      }
   }

   int readyCount = ArraySize(tradeItems);
   // Even if readyCount == 0, still POST empty trades[] so live accountBalance & accountEquity sync!
   if(PostTradesBatch(tradeItems, readyCount))
   {
      string ts = TimeToString(TimeLocal(), TIME_MINUTES);
      UpdateStatusLabel("Synced " + IntegerToString(readyCount) + " trades @ " + ts, clrLimeGreen);
   }
}

//+------------------------------------------------------------------+
//| Send a single closed position immediately (real-time webhook)    |
//+------------------------------------------------------------------+
void SendSingleClosedPosition(const long posId)
{
   string itemJson = "";
   if(!BuildClosedPositionJson(posId, itemJson))
      return;

   string arr[1];
   arr[0] = itemJson;

   if(PostTradesBatch(arr, 1))
   {
      string ts = TimeToString(TimeLocal(), TIME_MINUTES);
      UpdateStatusLabel("Last trade #" + IntegerToString(posId) + " @ " + ts, clrLimeGreen);
   }
}

//+------------------------------------------------------------------+
//| Render Sync Now button and status label on chart                 |
//+------------------------------------------------------------------+
void CreateChartControls()
{
   if(!InpShowSyncButton)
      return;

   ObjectDelete(0, BTN_SYNC_NAME);
   ObjectDelete(0, LBL_STATUS_NAME);

   ObjectCreate(0, BTN_SYNC_NAME, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_XDISTANCE, 16);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_YDISTANCE, 32);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_XSIZE, 145);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_YSIZE, 28);
   ObjectSetString(0, BTN_SYNC_NAME, OBJPROP_TEXT, "Sync Now (" + IntegerToString(InpBackfillDays) + "d)");
   ObjectSetString(0, BTN_SYNC_NAME, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_BGCOLOR, C'79,70,229');
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_BORDER_COLOR, C'99,102,241');
   ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_SELECTABLE, false);

   ObjectCreate(0, LBL_STATUS_NAME, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_XDISTANCE, 16);
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_YDISTANCE, 66);
   ObjectSetString(0, LBL_STATUS_NAME, OBJPROP_TEXT, "TrackDailyTrade Ready");
   ObjectSetString(0, LBL_STATUS_NAME, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_SELECTABLE, false);

   ChartRedraw(0);
}

void UpdateStatusLabel(const string text, const color textColor)
{
   if(!InpShowSyncButton || ObjectFind(0, LBL_STATUS_NAME) < 0)
      return;

   ObjectSetString(0, LBL_STATUS_NAME, OBJPROP_TEXT, text);
   ObjectSetInteger(0, LBL_STATUS_NAME, OBJPROP_COLOR, textColor);
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_riskFileName = "TrackDailyTrade_risk_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
   LoadRiskCache();
   CaptureAllOpenPositionsRisk();
   CreateChartControls();

   PrintFormat(
      "[TrackDailyTrade] Initialized v1.10 for MT5 #%I64d -> %s",
      AccountInfoInteger(ACCOUNT_LOGIN),
      InpWebhookBatchUrl
   );

   if(InpSyncOnInit)
      SyncRecentHistory(InpBackfillDays);

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ObjectDelete(0, BTN_SYNC_NAME);
   ObjectDelete(0, LBL_STATUS_NAME);
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Trade transaction listener (Real-time SL capture + Close sync)   |
//+------------------------------------------------------------------+
void OnTradeTransaction(
   const MqlTradeTransaction &trans,
   const MqlTradeRequest     &request,
   const MqlTradeResult      &result
)
{
   if(trans.type == TRADE_TRANSACTION_POSITION)
   {
      long posId = (long)trans.position;
      if(posId > 0)
         CaptureOpenPositionRisk(posId);
      return;
   }

   if(trans.type == TRADE_TRANSACTION_DEAL_ADD && trans.deal > 0)
   {
      if(!HistoryDealSelect(trans.deal))
         return;

      // Strictly ignore balance/credit/bonus deals; sync live balance if deposit/withdrawal occurs!
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(trans.deal, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
      {
         if(dealType == DEAL_TYPE_BALANCE || dealType == DEAL_TYPE_CREDIT || dealType == DEAL_TYPE_BONUS)
         {
            string emptyTrades[];
            ArrayResize(emptyTrades, 0);
            PostTradesBatch(emptyTrades, 0); // Refresh live accountBalance/accountEquity without creating a trade!
         }
         return;
      }

      ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
      long posId = HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
      if(posId <= 0)
         return;

      if(dealEntry == DEAL_ENTRY_IN || dealEntry == DEAL_ENTRY_INOUT)
      {
         CaptureOpenPositionRisk(posId);
      }

      if(dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY || dealEntry == DEAL_ENTRY_INOUT)
      {
         SendSingleClosedPosition(posId);
      }
   }
}

//+------------------------------------------------------------------+
//| Chart event handler for "Sync Now" button                        |
//+------------------------------------------------------------------+
void OnChartEvent(
   const int     id,
   const long   &lparam,
   const double &dparam,
   const string &sparam
)
{
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == BTN_SYNC_NAME)
   {
      ObjectSetInteger(0, BTN_SYNC_NAME, OBJPROP_STATE, false);
      UpdateStatusLabel("Syncing " + IntegerToString(InpBackfillDays) + "d history...", clrGold);
      SyncRecentHistory(InpBackfillDays);
   }
}
//+------------------------------------------------------------------+
