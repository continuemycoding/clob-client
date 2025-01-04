import axios from 'axios';
import fs from 'fs';

(async () => {
    const address = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
    const url = `https://api.polygonscan.com/api?module=contract&action=getsourcecode&address=${address}&apikey=${process.env.POLYGONSCAN_API_KEY}`;
    const response = await axios.get(url);
    const code = response.data.result[0].SourceCode;
    const { sources } = JSON.parse(code.substring(1, code.length - 1));
    for (const key in sources) {
        const name = key.substring(key.lastIndexOf('/') + 1);
        fs.writeFileSync(`Contract/${name}`, sources[key].content);
    }
})();