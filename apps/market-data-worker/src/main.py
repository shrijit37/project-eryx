import asyncio
import time
import json
import asyncpg
import redis.asyncio as redis
import yfinance as yf
import schedule
import time

async def connect_redis() -> redis.Redis:
    return redis.Redis(
        host="localhost",
        port=6379,
        db=0,
        decode_responses=True,
    )


async def connect_db() -> asyncpg.Connection | None:
    try:
        return await asyncpg.connect(
            "postgres://postgres:postgres@localhost:5432/project_eryx"
        )
    except Exception as e:
        print("Failed to connect to database", e)
        return None


async def get_stocks(pg: asyncpg.Connection) -> list[dict]:
    rows = await pg.fetch(
        'SELECT * FROM "Stocks"'
    )

    return [dict(row) for row in rows]


def fetch_stock_data(symbol: str, exchange: str) -> dict:
    ticker = yf.Ticker(build_ticker(symbol, exchange))

    response = ticker._quote._fetch(
        modules=["summaryDetail", "price"]
    ) or {}

    result = response.get("quoteSummary", {}).get("result")

    if not result:
        raise RuntimeError(f"No quote data returned for {symbol}")

    quote = result[0]

    summary = quote.get("summaryDetail", {})
    price = quote.get("price", {})

    bid = summary.get("bid")
    ask = summary.get("ask")
    ltp = price.get("regularMarketPrice")
    ms = price.get("marketState")
    print("market_state", ms)

    return {
        "symbol": symbol,
        "bid": bid if bid != 0 else ltp,
        "ask": ask if ask != 0 else ltp,
        "ltp": ltp if ltp != 0 else 0,
        "market_state": ms if ms is not None else "",
        "ts": int(time.time()),
    }


async def get_stock_data(symbol: str, exchange: str) -> dict:
    return await asyncio.to_thread(fetch_stock_data, symbol, exchange)



EXCHANGE_NAME_TO_SUFFIX = {
    "NYSE":          "",     "NasdaqGS":      "",
    "NasdaqGM":      "",     "NasdaqCM":      "",
    "Toronto":       ".TO",  "TSX":           ".TO",
    "São Paulo":     ".SA",  "Brazil":        ".SA",  "B3":  ".SA",
    "Santiago":      ".SN",  "Mexico":        ".MX",
    "NSE":           ".NS",  "BSE":           ".BO",
    "LSE":           ".L",   "London":        ".L",
    "Paris":         ".PA",  "XETRA":         ".DE",
    "Frankfurt":     ".DE",  "Milan":         ".MI",
    "Madrid":        ".MC",  "MCE":           ".MC",
    "Swiss":         ".SW",  "Zurich":        ".SW",
    "Vienna":        ".VI",  "Amsterdam":     ".AS",
    "Brussels":      ".BR",  "Lisbon":        ".LS",
    "Helsinki":      ".HE",  "Stockholm":     ".ST",
    "Copenhagen":    ".CO",  "Oslo":          ".OL",
    "Warsaw":        ".WA",  "Prague":        ".PR",
    "Budapest":      ".BD",
    "Tokyo":         ".T",   "HKSE":          ".HK",
    "Hong Kong":     ".HK",  "SES":           ".SI",
    "Singapore":     ".SI",  "KSE":           ".KS",
    "KOSPI":         ".KS",  "KOSDAQ":        ".KQ",
    "Taiwan":        ".TW",  "Shanghai":      ".SS",
    "Shenzhen":      ".SZ",  "HOSE":          ".VN",
    "Vietnam":       ".VN",  "ASX":           ".AX",
    "Australia":     ".AX",  "NZSE":          ".NZ",
    "Saudi":         ".SR",  "Tadawul":       ".SR",
    "Kuwait":        ".KW",  "Qatar":         ".QA",
}

def get_suffix(name):
    return EXCHANGE_NAME_TO_SUFFIX.get(name, "")

def build_ticker(symbol, exchange):
    return symbol + get_suffix(exchange)

async def push_to_redis(
    r: redis.Redis,
    symbol: str,
    data: dict,):
    key = f"price:{symbol}"
    await r.hset(f"price:{symbol}", mapping=data)
    await r.expire(f"price:{symbol}", 60)

    await r.publish(
        "prices",
    json.dumps({
        "symbol": symbol,
        **data,
    }),
    )   

async def main():
    print("Starting market-data worker...")

    pg = None
    r = None

    try:

        for _ in range(0,100):
            try:
                pg = await connect_db()
                if pg == None:
                    raise RuntimeError("db connection failed")
                break
            except Exception:
                continue
    
        for _ in range(0,100):
            try:
                r = await connect_redis()
                break
            except Exception:
                continue
    
        
        itr = 0
        while True:
            print(f"=======================================iternation {itr}===========================================")
            itr += 1

            stocks = await get_stocks(pg)
            for stock in stocks:
                symbol = stock["symbol"]
                exchange = stock["exchange"]
                try:
                    data = await get_stock_data(symbol, exchange)
                    await push_to_redis(r, symbol, data)

                    print(
                        symbol,
                        data["bid"],
                        data["ltp"],
                        data["ask"],
                    )

                except Exception as e:
                    print(f"{symbol}: {e}")
            await asyncio.sleep(30)

    finally:
        if pg:
            await pg.close()

        if r:
            await r.aclose()


if __name__ == "__main__":
    
        asyncio.run(main())
     