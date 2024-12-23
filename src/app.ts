import dotenv from "dotenv";
import { WebSocket } from "ws";
import { ethers } from "ethers";
import { ApiKeyCreds, AssetType, Chain, ClobClient, OpenOrder, Side } from ".";
// import { ApiKeyCreds, AssetType, Chain, ClobClient } from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/order-utils";
import { HttpsProxyAgent } from 'https-proxy-agent';
import Utility from "./Utility";
import fs from 'fs';

dotenv.config();

async function main() {
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

    const array = await clobClient.getCurrentRewards();
    let hasChanged = false;
    for (const { condition_id } of array) {
        if (markets[condition_id]) continue;

        const data = await clobClient.getMarket(condition_id);
        console.log(condition_id, data.question);
        markets[condition_id] = data;
        hasChanged = true;
    }

    hasChanged && fs.writeFileSync('markets.json', JSON.stringify(markets, null, 4));

    // const CONDITION_ID = "0x87d67272f0ce1bb0d80ba12a1ab79287b2a235a5f361f5bcbc06ea0ce34e61c5";//Will Biden finish his term?
    // const CONDITION_ID = "0x1ba85a54b6ff5db0d5f345bb07c2466850e476a8a735a6b82d407222a19b8a07"; //Will Elon tweet 250-274 times Dec 20-27?
    // const CONDITION_ID = "0x7d65c2360ae87c27b252cfb41356914e80187659be5685fb65da8e17ccfd215d"; //Will Elon tweet 275-299 times Dec 20-27?
    // const CONDITION_ID = "0x055f0838ccbaafce2a0d694d20ffb815cb0b5bb85667fee55cce958a7fe89c5a"; //Will Elon tweet 300-324 times Dec 20-27?
    // const CONDITION_ID = "0xdc7d3eba0d5c91f58cc90626065c95243fc2d9b47ce9dfe1ab4341e230b6dc84"; //Will Elon tweet 325-349 times Dec 20-27?
    // const CONDITION_ID = "0x643a489de21c4c07d50065a90cb44f3b3e746a54660b940eaf21a1d9e4dc4a87"; //Will Elon tweet 350-374 times Dec 20-27?
    // const CONDITION_ID = "0x67500eddcbf5fe7d5e5ec16b67c212eb58e462845a0bb10bf4401c48088bbd07"; //Will Elon tweet 375-399 times Dec 20-27?
    // const CONDITION_ID = "0xf56b00519c0841f123302402a247d0241acd93a22e1a1cc8a7a557abe6e34dc7"; //Will Elon tweet 400-424 times Dec 20-27?
    const CONDITION_ID = "0xe18a5a9d08e3f89798244959c20d198d13ab5d8230ee48c1b8201f73ae969ffb"; //Will Elon tweet 425-449 times Dec 20-27?
    // const CONDITION_ID = "0x8dea7119588d217a183b0d31bb5d3acc220986a1bb95976b2d02858d8b37eb35"; //Will Elon tweet 450-474 times Dec 20-27?
    // const CONDITION_ID = "0x3e388cdb2df676ec02935cf75a535d764cb8dc7cd997dab18b3779df02a263de"; //Will Elon tweet 475-499 times Dec 20-27?

    await clobClient.cancelAll();

    const { tokens } = await clobClient.getMarket(CONDITION_ID);

    interface subscriptionMessage {
        // only necessary for 'user' subscriptions
        auth?: { apiKey: string; secret: string; passphrase: string };
        type: string;
        markets: string[];
        assets_ids: string[];
    }

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    function connectWebSocket(type: string) {
        const ws = new WebSocket(`wss://ws-subscriptions-clob.polymarket.com/ws/${type}`, { agent });

        let subscriptionMessage: subscriptionMessage = {} as subscriptionMessage;

        if (type !== "live-activity") {
            let creds: ApiKeyCreds | undefined;
            if (type == "user") {
                creds = {
                    key: `${process.env.CLOB_API_KEY}`,
                    secret: `${process.env.CLOB_SECRET}`,
                    passphrase: `${process.env.CLOB_PASS_PHRASE}`,
                };
            }

            subscriptionMessage = {
                auth:
                    type == "user" && creds
                        ? {
                            apiKey: creds.key,
                            secret: creds.secret,
                            passphrase: creds.passphrase,
                        }
                        : undefined,
                type, // change to market for market, user for user
                markets: [] as string[],
                assets_ids: [] as string[],
            };

            if (type == "user") {
                subscriptionMessage["markets"] = [CONDITION_ID];
            } else {
                subscriptionMessage["assets_ids"] = tokens.map(item => item.token_id);
            }
        }

        ws.on("error", function (err: Error) {
            console.error("error", err.message || err.name);
        });

        let timer: NodeJS.Timer;

        ws.on("open", function () {
            console.log("WebSocket connection established.");

            timer = setInterval(() => {
                ws.ping();
            }, 10000);

            reconnectAttempts = 0;
            if (type !== "live-activity") {
                ws.send(JSON.stringify(subscriptionMessage));
            }
        });

        ws.on("close", function (code: number, reason: Buffer) {
            console.error("close", "code", code, "reason", reason.toString());

            clearInterval(timer);

            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Reconnecting... Attempt ${reconnectAttempts}`);
                setTimeout(connectWebSocket, reconnectAttempts * 1000);
            } else {
                console.error("Max reconnect attempts reached. Connection failed.");
            }
        });

        ws.onmessage = function (msg: any) {
            const data = JSON.parse(msg.data);

            for (const item of data) {
                const { event_type, side, market: market_id, outcome, price, status, type, timestamp } = item;
                const title = `${side} ${outcome} ${status}`;
                const market = markets[market_id];

                switch (event_type) {
                    case 'order': {
                        const { id, original_size, size_matched, created_at } = item as OpenOrder;

                        Utility.sendTextToDingtalk(`
## ${title}
- **问题**: ${market.question}
- **订单ID**: ${id}
- **价格**: $${price}
- **数量**: ${size_matched} / ${original_size}
- **类型**: ${type}
- **创建时间**: ${new Date(created_at * 1000)}
- **当前时间**: ${new Date(timestamp * 1)}
`, title);
                        break;
                    }

                    case 'trade': {
                        const { taker_order_id, size, match_time, trader_side } = item as TradeData;

                        if (status != "MINED")
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
                }
            }
        };
    }

    connectWebSocket('user');



    await Utility.waitForSeconds(3);


    // console.log(await clobClient.getEarningsForUserForDay("2024-12-22"));

    console.log(await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }));
    // console.log(await clobClient.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: "61870696561549212427703774084341694590597083144015451858728593820052569648622" }));

    const order = await clobClient.createOrder({
        tokenID: tokens[0].token_id,
        price: 0.01,//min: 0.01 - max: 0.99
        side: Side.BUY,
        size: 6
    });

    // const order = await clobClient.createOrder({
    //     tokenID: tokens[1].token_id,
    //     price: 0.86,//min: 0.01 - max: 0.99
    //     side: Side.BUY,
    //     size: 5
    // });

    // const order = await clobClient.createOrder({
    //     tokenID: tokens[1].token_id,
    //     side: Side.SELL,
    //     price: 0.15,
    //     size: 6
    // });

    console.log(await clobClient.postOrder(order));

    // await Utility.waitForSeconds(3);
    // await clobClient.cancelAll();
}

main().catch(console.error);
