import yfinance as yf
import redis as rd
import asyncpg as pg
from pathlib import Path
from dotenv import load_dotenv 
import os
import asyncio


async def getPriceDetails(tickName: str):
    tck = yf.Ticker(tickName)
    info = tck.info
    if not info:
        return None
    return {
    "symbol": info["symbol"],
    "bid": info.get("bid"),
    "ask": info.get("ask"),
    "ltp": info.get("currentPrice"),          # same value here
    "ts": info.get("regularMarketTime"),
}

async def pushToRedis(data, rds):
    pipeline = rds.pipeline()
    key = f"price:data:{data['symbol']}"
    pipeline.hset(key, mapping=data)
    pipeline.expire(key, 60)
    pipeline.execute()



async def main():
    try:
        root_env = Path(__file__).resolve().parent.parent.parent.parent.joinpath(".env")
        load_dotenv(root_env)
        REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
        REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
        rds = rd.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        rds.ping()
        conn = await pg.connect(user='postgres', password='postgres',
                                 database='project_eryx', host='localhost',port=5432)
        current_tickers = await conn.fetch('SELECT symbol FROM "Stocks";')
        current_tickers = [i['symbol'] for i in current_tickers]
        for ticker in current_tickers:
            print("getting data for ", ticker)
            data = await getPriceDetails(ticker)
            if data:
                print("Pushing data for ", ticker)
                await pushToRedis(data, rds)
        print("Done")
    except Exception as e:
        print(e)
        exit(1)


if __name__ == "__main__":
    asyncio.run(main())