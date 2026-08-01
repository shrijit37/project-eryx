-- DropForeignKey
ALTER TABLE "Trades" DROP CONSTRAINT "Trades_buy_order_id_fkey";

-- DropForeignKey
ALTER TABLE "Trades" DROP CONSTRAINT "Trades_sell_order_id_fkey";

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "api_key_hash" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Orders" ALTER COLUMN "limit_price" DROP NOT NULL,
ALTER COLUMN "executed_price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Trades" ADD COLUMN     "account_id" TEXT,
ALTER COLUMN "buy_order_id" DROP NOT NULL,
ALTER COLUMN "sell_order_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Agent_api_key_hash_key" ON "Agent"("api_key_hash");

-- AddForeignKey
ALTER TABLE "Trades" ADD CONSTRAINT "Trades_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trades" ADD CONSTRAINT "Trades_buy_order_id_fkey" FOREIGN KEY ("buy_order_id") REFERENCES "Orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trades" ADD CONSTRAINT "Trades_sell_order_id_fkey" FOREIGN KEY ("sell_order_id") REFERENCES "Orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
