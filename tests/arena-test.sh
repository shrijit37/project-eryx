#!/usr/bin/env bash
# Two-agent AI Arena test: maker rests a limit, taker sweeps it, verify settlement.
set -e
cd "$(dirname "$0")/.."

docker exec project_eryx_redis redis-cli HSET "price:AAPL" bid 220.10 ask 220.30 ltp 220.29 ts "$(date +%s)" market_state REGULAR >/dev/null
docker exec project_eryx_redis redis-cli EXPIRE "price:AAPL" 120 >/dev/null

EMAIL=$(docker exec project_eryx_postgres psql -U postgres -d project_eryx -t -c "SELECT email FROM \"User\" ORDER BY created_at DESC LIMIT 1;" | tr -d ' ')
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}" | jq -r .token)

K1=$(curl -s -X POST localhost:8080/api/agents -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"MakerArena","strategy":"maker"}' | jq -r '.data.api_key')
K2=$(curl -s -X POST localhost:8080/api/agents -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"TakerArena","strategy":"taker"}' | jq -r '.data.api_key')
A1=$(docker exec project_eryx_postgres psql -U postgres -d project_eryx -t -c "SELECT id FROM \"Agent\" WHERE name='MakerArena' ORDER BY created_at DESC LIMIT 1;" | tr -d ' ')
A2=$(docker exec project_eryx_postgres psql -U postgres -d project_eryx -t -c "SELECT id FROM \"Agent\" WHERE name='TakerArena' ORDER BY created_at DESC LIMIT 1;" | tr -d ' ')

AR1=$(curl -s -X POST localhost:8080/api/arena/account -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"agent_id\":\"$A1\"}")
AR2=$(curl -s -X POST localhost:8080/api/arena/account -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"agent_id\":\"$A2\"}")
echo "arena accts created: $(echo "$AR1"|jq -r '.success') $(echo "$AR2"|jq -r '.success')"

echo "=== Maker SELL LIMIT 5 @ 220 ==="
curl -s -X POST localhost:8080/api/agent/arena/orders -H "X-API-Key: $K1" -H 'Content-Type: application/json' -d '{"symbol":"AAPL","side":"SELL","type":"LIMIT","qty":5,"limit_price":220}' | jq -c '.data | {status, orderId}'

echo "=== book before taker (1 ask @ 220) ==="
curl -s localhost:8080/api/arena/book/AAPL | jq -c '.data | {ltp, asks, best_ask}'

echo "=== Taker MARKET BUY 5 ==="
curl -s -X POST localhost:8080/api/agent/arena/orders -H "X-API-Key: $K2" -H 'Content-Type: application/json' -d '{"symbol":"AAPL","side":"BUY","type":"MARKET","qty":5}' | jq -c '.data | {status, filledQty}'

echo "=== book after (ask gone, ltp moved to 220) ==="
curl -s localhost:8080/api/arena/book/AAPL | jq -c '.data | {ltp, best_ask, asks, bids}'

echo "=== Maker portfolio (sold 5 → cash +~1099) ==="
curl -s localhost:8080/api/agent/portfolio -H "X-API-Key: $K1" | jq -c '.data | {cash_balance, positions_count}'

echo "=== Taker portfolio (bought 5 @ 220 → holds 5) ==="
curl -s localhost:8080/api/agent/portfolio -H "X-API-Key: $K2" | jq -c '.data | {cash_balance, positions_count, positions}'

echo "=== arena leaderboard ==="
curl -s localhost:8080/api/arena/leaderboard | jq -c '.data[0:4]'

echo "=== bilateral trade row (both order ids set) ==="
docker exec project_eryx_postgres psql -U postgres -d project_eryx -t -c "SELECT buy_order_id IS NOT NULL AS has_buy, sell_order_id IS NOT NULL AS has_sell, quantity, execution_price FROM \"Trades\" WHERE description IS NOT NULL ORDER BY executed_at DESC LIMIT 3;" 2>/dev/null || docker exec project_eryx_postgres psql -U postgres -d project_eryx -t -c "SELECT buy_order_id IS NOT NULL AS has_buy, sell_order_id IS NOT NULL AS has_sell, quantity, execution_price FROM \"Trades\" ORDER BY executed_at DESC LIMIT 3;"
