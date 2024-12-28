import dotenv from "dotenv";
import { WebSocket } from "ws";
import { ethers } from "ethers";
import { ApiKeyCreds, AssetType, Chain, ClobClient, OpenOrder, OrderBookSummary, Side, Token, Trade, UserOrder } from "."; // from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/order-utils";
import { HttpsProxyAgent } from 'https-proxy-agent';
import Utility from "./Utility";
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, Secret, VerifyCallback, VerifyErrors } from 'jsonwebtoken';
import bodyParser from 'body-parser';
import cors from 'cors';
import { CANCEL_ORDER, GET_EARNINGS_FOR_USER_FOR_DAY, GET_MARKET, GET_OPEN_ORDERS, GET_REWARDS_MARKETS_CURRENT, GET_TRADES, POST_ORDER } from "./endpoints";
import { END_CURSOR, INITIAL_CURSOR } from "./constants";

dotenv.config();

const Yes = 0;
const No = 1;

const trades = {
    "0x37d6fdb304d3b1ba850a0618afa7ee344ef2fd62672fdfcc7b61782e7e66a3a6": Yes, // Dogecoin above $0.31 on January 3?
    "0x97480fb1ea30619d6682bedb183289eccf60da180311c8ba45985dcba13a05d6": Yes, // Solana above $185 on January 3?
    "0x131ec938bb5f143a0d345349ae02624d82207e960ca0a6caa40ccd5b3b5a7a26": Yes, // Ripple above $2.15 on January 3?
    "0x5f7842f5d3be987a52470265bd1909421cae8c318d6487fb38b902b0c5055d4d": Yes, // Ethereum above $3,300 on January 3?
    "0xc201255ac4fd4ca73d38eb331681dd9c4597fc85ed52a89ef664fa399a2f185a": Yes, // Bitcoin above $94,000 on January 3?

    // "0xf8df5cd1f0f97916b35c96743242a2f4ca377bf5c3e3f608f0d02196d36deae5": Yes, // Will MicroStrategy purchase more Bitcoin in 2024?
    // "0x7b0f6f3b168bfeeb8356a2e525d0566bd54118d79a44433485a1ddef9b32dee2": Yes, // Will OpenAI have the top AI model on January 31?
    // "0xc4f606569acc4d2871bf0cae1b53d0a12dae9f289d2f1011b4ead72b066ac00a": Yes, // Will Google have the top AI model on January 31?
    // "0xa5ac4cdcfff44ddfb0d332d33575f766414465786fb7d4350782db40d5e9da11": Yes, // Trump ends Ukraine war by first 90 days?
    "0x97587c58a3407fcc9a8df6396aaa8b66eff8b0c799fdf81880f258755b7d529c": Yes, // Will Bitcoin hit $100k again in 2024?
};

enum OrderStatus {
    PendingCancellation = "待取消",
    // Cancelled = "已取消",
    PendingSubmission = "待提交",
    Submitted = "已提交",
};

const userOrders: Record<string, UserOrder & { status: OrderStatus, timestamp: number }> = {};
const orderBooks: Record<string, OrderBookSummary> = {};

interface MarketData {
    question: string;
    // description: string;
    event_slug: string;
    market_slug: string;
    end_date_iso: string;
    // game_start_time: string | null;
    // maker_base_fee: number;
    // taker_base_fee: number;

    icon: string;

    tokens: Token[];
    tags: string[];
}

(async () => {
    const agent = process.env.PROXY_URL && new HttpsProxyAgent(process.env.PROXY_URL);
    await Utility.setupRuntimeEnvironment(agent);

    const host = "https://clob.polymarket.com";
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

    if (!process.env.CLOB_API_KEY) {
        const clobClient = new ClobClient(host, Chain.POLYGON, wallet);
        const creds = await clobClient.createApiKey(Date.now());
        console.log("API Key:", creds.key);
        console.log("Secret:", creds.secret);
        console.log("Passphrase:", creds.passphrase);
        return;
    }

    const creds: ApiKeyCreds = {
        key: process.env.CLOB_API_KEY,
        secret: process.env.CLOB_SECRET,
        passphrase: process.env.CLOB_PASS_PHRASE,
    };

    const clobClient = new ClobClient(host, Chain.POLYGON, wallet, creds, SignatureType.POLY_PROXY, process.env.FUNDER_ADDRESS);
    const gammaClient = new ClobClient("https://gamma-api.polymarket.com", Chain.POLYGON, wallet, creds, SignatureType.POLY_PROXY, process.env.FUNDER_ADDRESS);

    const markets: Record<string, MarketData> = JSON.parse(fs.readFileSync('markets.json').toString());

    let hasChanged = false;
    let next_cursor = INITIAL_CURSOR;
    while (next_cursor != END_CURSOR) {
        const response = await clobClient.getSamplingMarkets(next_cursor);
        next_cursor = response.next_cursor;
        console.log({ next_cursor });

        for (const item of response.data) {
            const { condition_id, question, end_date_iso, icon, tokens, tags } = item;

            if (markets[condition_id])
                continue;

            hasChanged = true;

            const [{ event_slug, market_slug }] = await clobClient.getRawRewardsForMarket(condition_id);

            console.log(condition_id, `https://polymarket.com/event/${event_slug}/${market_slug}`);

            // "https://polymarket-upload.s3.us-east-2.amazonaws.com/"
            const baseUrl = icon.match(/^(?:https?:\/\/)?[^\/]+\//);

            markets[condition_id] = {
                question,
                event_slug,
                market_slug,
                end_date_iso,
                icon: icon.replace(baseUrl, ""),
                tokens,
                tags
            };
        }
    }

    for (const key of Object.keys(markets)) {
        const market = markets[key];
        if (Date.now() > new Date(market.end_date_iso).getTime() - 3600_000) {
            console.log(market.question, "即将过期");
            delete markets[key];
            // hasChanged = true;
        }
    }

    hasChanged && fs.writeFileSync('markets.json', JSON.stringify(markets, null, 4));

    const { balance: balanceAmount } = await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const balance = Number(balanceAmount) / 10 ** 6;

    // await clobClient.cancelAll();

    // const keys = Object.keys(markets).slice(0, 50);
    // for (const key of keys) {
    //     trades[key] = Yes;
    // }

    for (const key of Object.keys(trades)) {
        if (!markets[key])
            delete trades[key];
    }

    const currentRewards: Record<string, { rewards_max_spread: number; rewards_min_size: number; rate_per_day: number; }> = (await clobClient.getCurrentRewards()).reduce((map, item) => {
        map[item.condition_id] = {
            rewards_max_spread: item.rewards_max_spread,
            rewards_min_size: item.rewards_min_size,
            rate_per_day: item.rewards_config[0].rate_per_day
        };
        return map;
    }, {});

    const openOrders = await clobClient.getOpenOrders();
    for (const { asset_id, price, side, size_matched, original_size, created_at } of openOrders) {
        userOrders[asset_id] = {
            tokenID: asset_id,
            price: Number(price),
            side: Side[side as keyof typeof Side],
            size: Number(original_size) - Number(size_matched),
            status: OrderStatus.Submitted,
            timestamp: created_at * 1000,
        };
    }

    const app = express();
    app.use(cors({
        exposedHeaders: ['token']  // 允许前端访问的自定义 headers
    }));
    app.use(bodyParser.json());

    if (process.env.ALLOWED_IPS) {
        const allowedIps = process.env.ALLOWED_IPS.split(',');

        app.use((req, res, next) => {
            const clientIp = req.ip;
            if (allowedIps.includes(clientIp))
                next();
            else
                res.status(403).json({ message: 'Forbidden', clientIp: req.ip });
        });
    }

    app.listen(80, () => {
        console.log(`服务器正在运行`);
    });

    app.post(GET_EARNINGS_FOR_USER_FOR_DAY, async (req: Request, res: Response) => {
        const rewardPercentages = await clobClient.getRewardPercentages();
        const response: any = await clobClient.getEarningsForUserForDay(new Date().toDateString());

        for (const item of response) {
            item.question = markets[item.condition_id].question;
            item.percentage = rewardPercentages[item.condition_id] + '%';
            delete item.asset_address;
            delete item.maker_address;
        }

        res.json(response);
    });

    app.post(GET_REWARDS_MARKETS_CURRENT, async (req: Request, res: Response) => {
        const response = await clobClient.getCurrentRewards();
        res.json(response);
    });

    app.post(GET_OPEN_ORDERS, async (req: Request, res: Response) => {
        const response = await clobClient.getOpenOrders();
        res.json(response);
    });

    app.post(GET_TRADES, async (req: Request, res: Response) => {
        const response = await clobClient.getTrades();
        res.json(response);
    });

    app.post(GET_MARKET, async (req: Request, res: Response) => {
        const response = await clobClient.getMarket(req.body.market_id);
        res.json(response);
    });

    app.post(CANCEL_ORDER, async (req: Request, res: Response) => {
        const response = await clobClient.cancelOrder(req.body);//orderID
        res.json(response);
    });


    async function executeTradingStrategy(orderBook: OrderBookSummary, sorted: boolean) {
        const { bids, asks, market: market_id, asset_id: token_id } = orderBook;
        const { rewards_max_spread, rewards_min_size } = currentRewards[market_id];
        const market = markets[market_id];

        if (bids.length == 0 || asks.length == 0)
            return;

        if (!sorted) {
            bids.sort((a, b) => Number(b.price) - Number(a.price));
            asks.sort((a, b) => Number(a.price) - Number(b.price));
        }

        const midpoint = (Number(bids[0].price) + Number(asks[0].price)) / 2;

        const existingOrder = userOrders[token_id];

        if (existingOrder) {
            if (existingOrder.status === OrderStatus.PendingCancellation) {
                console.debug(market.question, '等待订单取消完成');
                return;
            }

            if (existingOrder.status === OrderStatus.PendingSubmission) {
                console.debug(market.question, '等待订单提交完成');
                return;
            }

            async function cancelMarketOrders(reason: string) {
                console.debug(market.question, reason);
                const userOrder = userOrders[token_id];
                if (Date.now() < userOrder.timestamp + 1000) {
                    // console.error("创建超过1秒才能取消");
                    return;
                }

                existingOrder.status = OrderStatus.PendingCancellation;
                const response = await clobClient.cancelMarketOrders({ asset_id: token_id });
                if (response.canceled.length > 0)
                    delete userOrders[token_id];
                else
                    console.error(market.question, reason, "取消订单错误", response);
            }

            if (Math.abs(existingOrder.price - midpoint) * 100 > rewards_max_spread) {
                cancelMarketOrders("没有奖励就取消订单");
                return;
            }

            if (midpoint < 0.1) {
                cancelMarketOrders("概率太低就取消订单");
                return;
            }

            let totalValue = 0;

            for (const item of bids) {
                if (Number(item.price) > existingOrder.price)
                    totalValue += Number(item.price) * Number(item.size);
            }

            totalValue < 800 && cancelMarketOrders(`挂单不足就取消订单 totalValue:${totalValue}`);

            return;
        }

        if (midpoint <= 0.15 || midpoint >= 0.6)
            return;

        let sum = 0;
        for (let i = 0; i < bids.length; i++) {
            const price = Number(bids[i].price);
            const size = Number(bids[i].size);

            if (Math.abs(price - midpoint) > rewards_max_spread)
                return;

            sum += price * size;

            if (sum >= 1000 && i != 0) {
                const userOrderParams = {
                    tokenID: token_id,
                    price, // min: 0.01 - max: 0.99
                    side: Side.BUY,
                    // size: Math.min(balance / price, rewards_min_size),
                    size: Math.max(balance / price, rewards_min_size),
                };

                if (balance >= price * userOrderParams.size) {
                    userOrders[token_id] = { ...userOrderParams, status: OrderStatus.PendingSubmission, timestamp: Date.now() };
                    const userOrder = userOrders[token_id];

                    const order = await clobClient.createOrder(userOrderParams);
                    const { error } = await clobClient.postOrder(order);

                    userOrder.status = OrderStatus.Submitted;
                    userOrder.timestamp = Date.now();

                    if (error) {
                        console.error(market.question, "提交订单错误", userOrderParams, error);
                        delete userOrders[token_id];
                    }
                }
                return;
            }
        }
    }

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 20;

    function connectWebSocket(type: string) {
        const ws = new WebSocket(`wss://ws-subscriptions-clob.polymarket.com/ws/${type}`, { agent });

        ws.on("error", function (err: Error) {
            console.error("error", err.message || err.name);
        });

        let timer: NodeJS.Timer;

        ws.on("open", function () {
            console.log(type, "WebSocket connection established.");

            timer = setInterval(() => {
                ws.ping();
            }, 10000);

            reconnectAttempts = 0;

            const subscriptionMessage = {
                auth: type == "user"
                    ? {
                        apiKey: creds.key,
                        secret: creds.secret,
                        passphrase: creds.passphrase,
                    }
                    : undefined,
                type,
                markets: [] as string[],
                assets_ids: [] as string[]
            };

            const keys = Object.keys(trades);

            if (type == "user")
                subscriptionMessage.markets = keys;
            else
                subscriptionMessage.assets_ids = keys.map(item => markets[item].tokens[trades[item]].token_id);

            ws.send(JSON.stringify(subscriptionMessage));
        });

        ws.on("close", function (code: number, reason: Buffer) {
            console.error("close", "code", code, "reason", reason.toString());

            clearInterval(timer);

            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Reconnecting... Attempt ${reconnectAttempts}`);
                setTimeout(() => {
                    connectWebSocket(type);
                }, 3000);
            } else {
                console.error("Max reconnect attempts reached. Connection failed.");
            }
        });

        ws.onmessage = async function (msg: any) {
            const data = JSON.parse(msg.data);

            for (const item of data) {
                const { event_type, side, market: market_id, asset_id: token_id, outcome, price, status, type, timestamp } = item;
                const title = `${side} ${outcome} ${status}`;
                const market = markets[market_id];

                switch (event_type) {
                    // 当市价单被匹配时（”MATCHED”）
                    // 当用户的限价单被包含在一笔交易中时（”MATCHED”）
                    // 交易的后续状态变化（”MINED”、”CONFIRMED”、”RETRYING”、”FAILED”）
                    case 'trade': {
                        const { taker_order_id, size, match_time, trader_side } = item as Trade;

                        if (status != "MINED" && status != "CONFIRMED")
                            Utility.sendTextToDingtalk(`
## ${title}
- **问题**: ${market.question}
- **交易ID**: ${taker_order_id}
- **价格**: $${price}
- **数量**: ${size}
- **方向**: ${trader_side}
- **匹配时间**: ${new Date(Number(match_time) * 1000)}
- **当前时间**: ${new Date(timestamp * 1)}
`, title);
                        break;
                    }

                    // 当订单被提交时（PLACEMENT）
                    // 当订单被更新时（部分成交）（UPDATE）
                    // 当订单被取消时（CANCELLATION）
                    case 'order': {
                        const { id, original_size, size_matched, created_at } = item as OpenOrder;

                        console.log(`
## ${title}
- **问题**: ${market.question}
- **订单ID**: ${id}
- **价格**: $${price}
- **数量**: ${size_matched} / ${original_size}
- **类型**: ${type}
- **创建时间**: ${new Date(created_at * 1000)}
- **当前时间**: ${new Date(timestamp * 1)}
`);
                        break;
                    }

                    // 首次订阅市场时
                    // 当有交易影响订单簿时（不会先触发price_change）
                    case 'book': {
                        orderBooks[token_id] = item;
                        executeTradingStrategy(item, false);
                        break;
                    }

                    // 一个新订单被提交
                    // 一个订单被取消
                    case 'price_change': {
                        const orderBook = orderBooks[token_id];
                        const { bids, asks } = orderBook;

                        bids.sort((a, b) => Number(b.price) - Number(a.price));
                        asks.sort((a, b) => Number(a.price) - Number(b.price));

                        for (const { price, size, side } of item.changes) {
                            if (side == Side.BUY) {
                                if (asks[0] && Number(price) >= Number(asks[0].price))
                                    continue;

                                const bid = bids.find(item => item.price == price);
                                if (bid) {
                                    bid.size = size;
                                }
                                else {
                                    bids.push({ price, size });
                                    bids.sort((a, b) => Number(b.price) - Number(a.price));
                                }
                            }
                            else {
                                if (bids[0] && Number(price) <= Number(bids[0].price))
                                    continue;

                                const ask = asks.find(item => item.price == price);
                                if (ask) {
                                    ask.size = size;
                                }
                                else {
                                    asks.push({ price, size });
                                    asks.sort((a, b) => Number(a.price) - Number(b.price));
                                }
                            }
                        }

                        executeTradingStrategy(orderBook, true);
                        break;
                    }
                }
            }
        };
    }

    connectWebSocket('user');
    connectWebSocket('market');
})();
