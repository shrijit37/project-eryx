import { prisma } from "@project-eryx/db";
import type { Prisma } from "@project-eryx/db";

/**
 * Static reference watchlist. Live quotes are served at runtime by the
 * market-data worker; this only provisions the instrument rows so a fresh
 * database is usable immediately without depending on an upstream quote API
 * during the initial seed.
 */
const WATCHLIST: Array<{ symbol: string; name: string; exchange: string; basePrice: number }> = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", basePrice: 224.5 },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", basePrice: 118.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", basePrice: 428.9 },
  { symbol: "GOOG", name: "Alphabet Inc.", exchange: "NASDAQ", basePrice: 175.4 },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", basePrice: 182.4 },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", basePrice: 475.6 },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", basePrice: 219.8 },
  { symbol: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ", basePrice: 162.5 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", basePrice: 208.4 },
  { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE", basePrice: 68.2 },
  { symbol: "BRK-A", name: "Berkshire Hathaway Inc.", exchange: "NYSE", basePrice: 678400.0 },
  { symbol: "LLY", name: "Eli Lilly and Co.", exchange: "NYSE", basePrice: 942.5 },
  { symbol: "V", name: "Visa Inc.", exchange: "NYSE", basePrice: 268.4 },
  { symbol: "XOM", name: "Exxon Mobil Corp.", exchange: "NYSE", basePrice: 118.7 },
  { symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", basePrice: 154.2 },
  { symbol: "PG", name: "Procter & Gamble Co.", exchange: "NYSE", basePrice: 168.9 },
  { symbol: "MA", name: "Mastercard Inc.", exchange: "NYSE", basePrice: 452.3 },
  { symbol: "KO", name: "The Coca-Cola Co.", exchange: "NYSE", basePrice: 64.8 },
  { symbol: "HD", name: "The Home Depot Inc.", exchange: "NYSE", basePrice: 365.1 },
  { symbol: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ", basePrice: 642.1 },
];

function toStockRows(): Prisma.StocksCreateManyInput[] {
  return WATCHLIST.map(({ symbol, name, exchange, basePrice }) => ({
    symbol,
    company_name: name,
    exchange,
    current_price: basePrice,
    previous_close: Number((basePrice * 0.992).toFixed(2)),
    listing_date: new Date("2024-01-02"),
    is_active: true,
    last_price_update: new Date(),
  }));
}

async function main() {
  console.log("Seeding database...");

  const result = await prisma.stocks.createMany({
    data: toStockRows(),
    skipDuplicates: true,
  });

  console.log(`Seed completed successfully. Inserted ${result.count} stocks (+ skipped existing).`);
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