import util from 'util';
import moment from 'moment';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export default class Utility {
    static async setupRuntimeEnvironment(agent: HttpsProxyAgent) {
        process.on("uncaughtException", function (e: Error) {
            console.error("uncaughtException\t", e?.stack);
        });

        process.on('unhandledRejection', function (e: Error) {
            console.error("unhandledRejection\t", e?.stack);
        });

        axios.interceptors.request.use(
            config => {
                if (config.url.startsWith("https://clob.polymarket.com/") || ["https://www.okx.com", "https://api.binance.com"].includes(config.baseURL))
                    config.httpsAgent = agent;

                return config;
            },
            error => {
                return Promise.reject(error);
            }
        );

        axios.interceptors.response.use(
            response => {
                return response;
            },
            async error => {
                const { url, data, params, method } = error.config;

                if (error.response?.data.code && error.response.data.code != '0') {
                    console.error(url, error.response.data.msg);
                    // Utility.sendTextToDingtalk(JSON.stringify({ url, data, params, method, msg: error.response.data.msg }, null, 4), "错误");
                }
                else if (error.code) {
                    console.error(url, error.message || error.stack);
                    // Utility.sendTextToDingtalk(JSON.stringify({ url, data, params, method, message: error.message }, null, 4), "错误");
                }

                if (['Too Many Requests', "API endpoint request timeout ", 'Getting information timed out, please try again later.'].includes(error.response?.data.msg))
                    return axios(error.config);

                if (['connect EADDRINUSE 127.0.0.1:10809', 'Client network socket disconnected before secure TLS connection was established'].includes(error.message))
                    return axios(error.config);

                if (['read ECONNRESET', 'write ECONNABORTED', 'socket hang up'].includes(error.message))
                    return axios(error.config);

                return Promise.reject(error);
            }
        );

        Date.prototype[util.inspect.custom] = function () {
            return moment(this).format('YYYY-MM-DD HH:mm:ss.SSS');
        };

        Date.prototype.toString = function () {
            return moment(this).format('YYYY-MM-DD HH:mm:ss.SSS');
        };

        Date.prototype.toDateString = function () {
            return moment(this).format('YYYY-MM-DD');
        };

        Date.prototype.toLocaleDateString = function () {
            return moment(this).format('YYYY-MM-DD');
        };

        const log = console.log;
        console.log = function (...args) {
            log("log:", new Date(), ...args);
            // log(new Error().stack.split('\n')[2]);
        };

        const error = console.error;
        console.error = function (...args) {
            error("error:", new Date(), ...args);
            // error(new Error().stack.split('\n').slice(2).join('\n'));
        };

        const debug = console.debug;
        console.debug = function (...args) {
            // debug("debug:", new Date(), ...args);
            // debug(new Error().stack.split('\n').slice(2).join('\n'));
        };
    }

    /**
     * 对输入的对象进行深度排序
     * @param obj 任意对象
     * @returns 排序后的对象
     */
    static deepSort(obj: any): any {
        if (Array.isArray(obj)) {
            // 如果是数组，对数组中的每个元素递归排序
            return obj.map(Utility.deepSort);
        } else if (typeof obj === "object" && obj !== null) {
            // 如果是对象，对键按字母序排序并递归处理值
            const sortedObj: Record<string, any> = {};
            Object.keys(obj)
                .sort()
                .forEach(key => {
                    sortedObj[key] = Utility.deepSort(obj[key]);
                });
            return sortedObj;
        }
        // 如果是基本类型，直接返回
        return obj;
    }

    /**
     * 对象序列化为按键排序的 JSON 字符串
     * @param obj 任意对象
     * @returns 排序后的 JSON 字符串
     */
    static stringify(obj: any): string {
        // 深度排序对象后调用 JSON.stringify
        const sortedObj = this.deepSort(obj);
        return JSON.stringify(sortedObj, null, 4);
    }

    static formatDuration(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        seconds %= 86400;
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);
        seconds %= 60;

        const parts = [];
        if (days > 0) parts.push(`${days}日`);
        if (hours > 0) parts.push(`${hours}时`);
        if (minutes > 0) parts.push(`${minutes}分`);
        if (seconds > 0 || parts.length == 0) parts.push(`${seconds.toFixed(1)}秒`);

        return parts.join('');
    }

    static formatToFixed(value: number, decimalPlaces = 3): number {
        return Number(value.toFixed(decimalPlaces));
    }

    static async waitForSeconds(delay: number) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(null);
            }, delay * 1000);
        });
    }

    static parse(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(Utility.parse);
        } else if (typeof obj === 'object' && obj !== null) {
            const parsedObj: Record<string, any> = {};
            Object.entries(obj).forEach(([key, value]) => {
                if (key.endsWith('Id'))
                    parsedObj[key] = value;
                else
                    parsedObj[key] = Utility.parse(value);
            });
            return parsedObj;
        } else if (typeof obj === 'string' && !isNaN(Number(obj))) {
            return Number(obj);
        } else {
            return obj;
        }
    }

    static sendTextToDingtalk(markdown: string, title = "") {
        console.log("dingtalk send", markdown);

        const accessToken = process.env.DINGTALK_ACCESS_TOKEN;
        const secret = process.env.DINGTALK_SECRET;

        const timestamp = Date.now();
        const stringToSign = timestamp + "\n" + secret;
        const crypto = require('crypto');
        const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest("base64");

        // 每个机器人每分钟最多发送20条。如果超过20条，会限流10分钟。
        axios.post(`https://oapi.dingtalk.com/robot/send?access_token=${accessToken}&timestamp=${timestamp}&sign=${sign}`, {
            msgtype: "markdown",
            markdown: {
                title: title || markdown,
                text: markdown
            }
        }).then(function (response) {
            console.log("dingtalk response", response.data);
        }).catch(function (error) {
            console.error(error.toJSON().message);
        }).then(function () {
            // always executed
        });
    }

    static getDecimalPlaces(num: any) {
        if (!Number(num) || !Number.isFinite(num)) return 0;
        const str = num.toString();
        const decimalIndex = str.indexOf('.');
        const decimalPart = str.slice(decimalIndex + 1);
        return decimalPart.length;
    }
}