import dotenv from "dotenv";
import { ethers } from "ethers";
import { ApiKeyCreds, AssetType, Chain, ClobClient, Side } from ".";
// import { ApiKeyCreds, AssetType, Chain, ClobClient } from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/order-utils";

dotenv.config();

async function main() {
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

    // console.log(await clobClient.getEarningsForUserForDay("2024-12-22"));

    console.log(await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }));
    // console.log(await clobClient.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: "61870696561549212427703774084341694590597083144015451858728593820052569648622" }));

    // const tokenID = "61870696561549212427703774084341694590597083144015451858728593820052569648622";//Will there be a US Government shutdown?
    // const tokenID = "109992587593331777980210843651571281015978250725824581007250167010882302823923";//Will MicroStrategy hold 500k+ BTC before 2025?
    const tokenID = "76018684495672907293972579038657312280524447899213220717960084627380959769440";//Will Biden finish his term?

    const order = await clobClient.createOrder({
        tokenID,
        price: 0.9,//min: 0.01 - max: 0.99
        side: Side.BUY,
        size: 6
    });

    // // const order = await clobClient.createOrder({
    // //     tokenID,   
    // //     side: Side.SELL,
    // //     price: 0.2,
    // //     size: 1
    // // });

    console.log(await clobClient.postOrder(order));

    // await clobClient.cancelOrders();
    // await clobClient.cancelAll();

    console.log(await clobClient.getOpenOrders());
    // console.log(await clobClient.getOrder());

    // console.log(await clobClient.getMarket("0x87d67272f0ce1bb0d80ba12a1ab79287b2a235a5f361f5bcbc06ea0ce34e61c5"));
}

main().catch(console.error);
