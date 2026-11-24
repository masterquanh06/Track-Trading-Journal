-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "postTradeReview" TEXT,
ADD COLUMN     "preTradePlan" TEXT,
ADD COLUMN     "screenshotUrl" TEXT;

-- AlterTable
ALTER TABLE "TradingAccount" ADD COLUMN     "currentBalance" DECIMAL(18,2),
ADD COLUMN     "currentEquity" DECIMAL(18,2);
