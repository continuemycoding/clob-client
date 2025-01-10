import dotenv from "dotenv";
import { ethers } from "ethers";
import { ApiKeyCreds, Chain, ClobClient } from "."; // from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/order-utils";
import { HttpsProxyAgent } from 'https-proxy-agent';
import Utility from "./Utility";
import axios from "axios";

dotenv.config();

async function getConditionId(data: string) {
    const contractAddresses = [
        '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e',
        '0xC5d563A36AE78145C45a50134d48A1215220f80a',
    ];

    for (const contractAddress of contractAddresses) {
        const url = `https://api.polygonscan.com/api?module=proxy&action=eth_call&to=${contractAddress}&data=${data}&apikey=${process.env.POLYGONSCAN_API_KEY}`;
        const { data: { result } } = await axios.get(url);
        if (result != "0x0000000000000000000000000000000000000000000000000000000000000000")
            return result;
    }
}

(async () => {
    const agent = process.env.PROXY_URL && new HttpsProxyAgent(process.env.PROXY_URL);
    await Utility.setupRuntimeEnvironment(agent);

    const host = "https://clob.polymarket.com";
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

    const creds: ApiKeyCreds = {
        key: process.env.CLOB_API_KEY,
        secret: process.env.CLOB_SECRET,
        passphrase: process.env.CLOB_PASS_PHRASE,
    };

    const clobClient = new ClobClient(host, Chain.POLYGON, wallet, creds, SignatureType.POLY_PROXY, process.env.FUNDER_ADDRESS);

    const tokenId = "74385256365261740991943052404976663449426970722774337626179714294936780155816";


    const args = [tokenId];

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
        "event OrdersMatched(bytes32 indexed takerOrderHash, address indexed takerOrderMaker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)",
        "function getConditionId(uint256 tokenId)"
    ];

    const iface = new ethers.utils.Interface(eventAbi);

    const encodedData = iface.encodeFunctionData('getConditionId', args);

    const conditionId = await getConditionId(encodedData);

    const [{ event_slug, market_slug }] = await clobClient.getRawRewardsForMarket(conditionId);
    console.log(`https://polymarket.com/event/${event_slug}/${market_slug}`);
})();
