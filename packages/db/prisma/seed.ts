import { prisma } from "@project-eryx/db";
import type { Prisma } from "@project-eryx/db";
import { Ticker } from "yfinance-ts";

const getStockData = async (
  initTickers: string[]
): Promise<Prisma.StocksCreateManyInput[]> => {
  const data = await Promise.all(
    initTickers.map(async (symbol) => {
      const ticker = new Ticker(symbol);
      const info = await ticker.info();
      const livePrice = await ticker.getPrice();

      // Determine current price: prefer regularMarketPrice, fallback to getPrice()
      const current_price = info.regularMarketPrice ?? livePrice ?? 0;

      // Determine previous close: prefer regularMarketPreviousClose, fallback to previousClose
      const previous_close =
        info.regularMarketPreviousClose ?? info.previousClose ?? 0;

      // Determine listing date: fetch max history and use the earliest data point
      let listing_date = new Date();
      try {
        const history = await ticker.history({ period: "max", interval: "1mo" });
        if (history.data.length > 0) {
          listing_date = new Date(history.data[0].date);
        }
      } catch {
        // If history fetch fails, fall back to current date
        console.warn(`Could not fetch history for ${symbol}, using current date as listing_date`);
      }

      return {
        symbol: info.symbol ?? symbol,
        company_name: info.shortName ?? null,
        exchange: info.exchange ?? "NYSE",
        current_price,
        previous_close,
        listing_date,
        is_active: true,
        last_price_update: new Date(),
      };
    })
  );

  return data;
};

async function main() {
  console.log("Seeding database...");

  const initTickers: string[] = [
    "AAPL",
    "NVDA",
    "MSFT",
    "GOOG",
    "AMZN",
    "META",
    "TSLA",
    "AVGO",
    "JPM",
    "WMT",
    "BRK-A",
    "LLY",
    "V",
    "XOM",
    "JNJ",
    "PG",
    "MA",
    "KO",
    "HD",
    "NFLX",
  ];

  try {
    const stocksData = await getStockData(initTickers);

    const result = await prisma.stocks.createMany({
      data: stocksData,
      skipDuplicates: true,
    });

    console.log(`Seed completed successfully. Inserted ${result.count} stocks.`);
  } catch (e) {
    console.error("Failed to seed database:", e);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
