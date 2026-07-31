/*
  Warnings:

  - A unique constraint covering the columns `[id]` on the table `Stocks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Stocks_id_key" ON "Stocks"("id");
