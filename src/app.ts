import dotenv from "dotenv";
import { ethers } from "ethers";
import { ApiKeyCreds, AssetType, Chain, ClobClient, MarketData, OpenOrder, OrderBookSummary, Side, Token, Trade, UserOrder } from "."; // from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/order-utils";
import { HttpsProxyAgent } from 'https-proxy-agent';
import Utility from "./Utility";
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { CANCEL_ORDER, GET_EARNINGS_FOR_USER_FOR_DAY, GET_MARKET, GET_OPEN_ORDERS, GET_REWARDS_MARKETS_CURRENT, GET_TRADES, POST_ORDER } from "./endpoints";
import { END_CURSOR, INITIAL_CURSOR } from "./constants";
import axios from "axios";

dotenv.config();

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

    const markets: Record<string, MarketData> = JSON.parse(fs.readFileSync('markets.json').toString());

    // let hasChanged = false;
    // let next_cursor = INITIAL_CURSOR;
    // while (next_cursor != END_CURSOR) {
    //     const response = await clobClient.getSamplingMarkets(next_cursor);
    //     next_cursor = response.next_cursor;
    //     console.log({ next_cursor });

    //     for (const item of response.data) {
    //         const { condition_id, question, end_date_iso, icon, tokens, tags } = item;

    //         if (markets[condition_id])
    //             continue;

    //         hasChanged = true;

    //         const [{ event_slug, market_slug }] = await clobClient.getRawRewardsForMarket(condition_id);

    //         console.log(condition_id, `https://polymarket.com/event/${event_slug}/${market_slug}`, end_date_iso);

    //         // "https://polymarket-upload.s3.us-east-2.amazonaws.com/"
    //         const baseUrl = icon.match(/^(?:https?:\/\/)?[^\/]+\//);

    //         markets[condition_id] = {
    //             question,
    //             event_slug,
    //             market_slug,
    //             end_date_iso,
    //             icon: icon.replace(baseUrl, ""),
    //             tokens,
    //             tags
    //         };
    //     }
    // }

    // hasChanged && fs.writeFileSync('markets.json', JSON.stringify(markets, null, 4));

    const assets_ids = Object.keys(markets).flatMap(item => [
        markets[item].tokens[0].token_id,
        markets[item].tokens[1].token_id
    ]);

    const eventAbi = [
        // "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
        // "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
        // "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
        // "event Transfer(address indexed from, address indexed to, uint256 amount)",
        // "event Approval(address indexed owner, address indexed spender, uint256 amount)",
        // "event TradingPaused(address indexed pauser)",
        // "event TradingUnpaused(address indexed pauser)",
        // "event TokenRegistered(uint256 indexed token0, uint256 indexed token1, bytes32 indexed conditionId)",
        "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)",
        "event OrdersMatched(bytes32 indexed takerOrderHash, address indexed takerOrderMaker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)"
    ];

    const iface = new ethers.utils.Interface(eventAbi);

    const processedTransactionHashes = new Set<string>()
    let lastBlockNumber = 0;
    const exchange = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
    const offset = 100;  // 每页请求的数量

    const addresses = [
        "0xA97b8f91F2F85e475c7A832911182320FF3A16B4",
        "0x4E8bD6FBCD4811dc7cDA3EC2c02e1B65f543C713",//2号
    ];

    const addressAliasMap: Record<string, string> = {
        "0xfb79181a9d9dcaceda40803c0aeb55f6c58ec2c6": "Terror",//Mar 2023
        "0xe6a2b60aa401ff375c607631735936225cb56af8": "SexPistols",//Jul 2024
        "0x8b3eeb3ea135c9b2246b1b78adce71a4c580662c": "...",//Feb 2024 加密货币
        "0x6a603ead2ab361654d867ea15eb610d81686d019": "chi3",//Sep 2024 加密货币
        "0xad3e2be07448adf31ce8a2e3c5c24c8ca6fe4422": "buffalobill",//Dec 2024
        "0x615363327b74b926fb4e75867e9bb62188400e04": "phantom07",//Dec 2024
        "0xb5111c580bf127908cb547923d6b93fea36701da": "Brainiac",//Nov 2024
        "0xc174f8185c2b8243304108bb30bc0a4f26986941": "RealDeal",//Aug 2024
        "0xee00ba338c59557141789b127927a55f5cc5cea1": "S-Works",//Aug 2024 太多市场

        // "0xd42f6a1634a3707e27cbae14ca966068e5d1047d": "Apsalar",//Nov 2023 仓位太多/市场太多
        // "0x1e3e3375612e45cbd6ba905f955091f08c2db656": "ThePopo",//Dec 2024
        // "0xd3989ba133ab48b5b3a81e3dba9b37b5966a46d7": "semi",//May 2024 仓位太多/市场太多
    };


    const address = "0xA97b8f91F2F85e475c7A832911182320FF3A16B4";

    const { data: { result: balanceAmount } } = await axios.get(`https://api.polygonscan.com/api?module=account&action=tokenbalance&contractaddress=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&address=${address}&tag=latest&apikey=${process.env.POLYGONSCAN_API_KEY}`);
    const balance = Number(balanceAmount) / 10 ** 6;

    while (true) {
        const url = `https://api.polygonscan.com/api?module=account&action=tokentx&address=${exchange}&startblock=${lastBlockNumber}&page=1&offset=${lastBlockNumber > 0 ? offset : 1}&sort=${lastBlockNumber > 0 ? 'asc' : 'desc'}&apikey=${process.env.POLYGONSCAN_API_KEY}`;
        const { data } = await axios.get(url);
        const { result: trades } = data;

        if (!trades) {
            Utility.sendTextToDingtalk(`没有获取到交易数据:${JSON.stringify(data, null, 4)}`);
            continue;
        }

        if (trades.length == offset && trades[0].blockNumber == trades[trades.length - 1].blockNumber) {
            Utility.sendTextToDingtalk(`区块${trades[0].blockNumber}可能不止${offset}条数据，需要处理翻页`);
            break;
        }

        const blockNumber = trades[trades.length - 1].blockNumber;

        if (lastBlockNumber == 0) {
            lastBlockNumber = blockNumber;
            continue;
        }

        const uniqueTrades = Array.from<any>(
            new Map(trades.map(trade => [trade.hash, trade])).values()
        ).filter(tx => !processedTransactionHashes.has(tx.hash));

        for (const { blockNumber, hash, from, to, contractAddress, input, tokenName } of uniqueTrades) {
            // if (tokenName == "USD Coin")
            //     continue;

            if (contractAddress != "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" || tokenName != "USD Coin (PoS)") {
                console.error(contractAddress, tokenName);
                continue;
            }

            console.log(hash);

            const { data } = await axios.get(`https://api.polygonscan.com/api?module=proxy&action=eth_getTransactionReceipt&txhash=${hash}&apikey=${process.env.POLYGONSCAN_API_KEY}`);
            if (!data.result) {
                console.error(data);
                debugger;
            }

            for (const log of data.result.logs) {
                if (![
                    "0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6",//OrderFilled
                    "0x63bf4d16b7fa898ef4c4b2b6d90fd201e9c56313b65638af6088d149d2ce956c",//OrdersMatched
                ].includes(log.topics[0]))
                    continue;

                const decodedLog = iface.parseLog(log);

                if (decodedLog.name == "OrdersMatched") {
                    // maker:挂单 taker:吃单
                    const { takerOrderHash, takerOrderMaker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled } = decodedLog.args;

                    // if (!addresses.includes(takerOrderMaker))
                    //     continue;

                    const url = `https://polymarket.com/profile/${takerOrderMaker}?tab=activity`;
                    const side = Number(makerAmountFilled.toString()) < Number(takerAmountFilled.toString()) ? Side.BUY : Side.SELL;
                    const price = side == Side.BUY ? makerAmountFilled / takerAmountFilled : takerAmountFilled / makerAmountFilled;
                    const amountFilled = side == Side.BUY ? makerAmountFilled : takerAmountFilled;
                    const shares = amountFilled / price / 10 ** 6;
                    const assetId = (side == Side.BUY ? takerAssetId : makerAssetId).toString();


                    console.log(`${decodedLog.name} ${url} 单价${Number(price.toFixed(3))} ${side} ${Number(shares.toFixed(3))}份 ${assetId} 价值${Number((amountFilled / 10 ** 6).toFixed(3))}`);

                    // if (assets_ids.includes(assetId))
                    //     debugger;

                    if (assetId.toString() == '0')
                        debugger;
                }
                else if (decodedLog.name == "OrderFilled") {
                    // maker:挂单 taker:吃单
                    const { orderHash, maker, taker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled, fee } = decodedLog.args;

                    if (taker == exchange)
                        continue;

                    if (maker == exchange)
                        debugger;

                    const url = `https://polymarket.com/profile/${maker}?tab=activity`;
                    const side = Number(makerAmountFilled.toString()) < Number(takerAmountFilled.toString()) ? Side.BUY : Side.SELL;
                    const price = side == Side.BUY ? makerAmountFilled / takerAmountFilled : takerAmountFilled / makerAmountFilled;
                    const amountFilled = side == Side.BUY ? makerAmountFilled : takerAmountFilled;
                    const shares = amountFilled / price / 10 ** 6;
                    const assetId = (side == Side.BUY ? takerAssetId : makerAssetId).toString();

                    console.log(`${decodedLog.name} ${url} 单价${Number(price.toFixed(3))} ${side} ${Number(shares.toFixed(3))}份 ${assetId} 价值${Number((amountFilled / 10 ** 6).toFixed(3))}`);

                    // if (assets_ids.includes(assetId))
                    //     debugger;

                    if (assetId.toString() == '0')
                        debugger;
                }
            }
        }

        if (blockNumber != lastBlockNumber)
            processedTransactionHashes.clear();

        for (const tx of uniqueTrades) processedTransactionHashes.add(tx.hash);

        lastBlockNumber = blockNumber;
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
})();
