-- AlterTable
ALTER TABLE "market_candles" ADD COLUMN     "received_at" TIMESTAMP(3),
ADD COLUMN     "source_timestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "market_quotes" ADD COLUMN     "received_at" TIMESTAMP(3),
ADD COLUMN     "source_timestamp" TIMESTAMP(3);