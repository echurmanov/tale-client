const https = require('https');
const querystring = require('querystring');

const CLIENT_NAME = 'CrazyNigerHACS-1.0';

const METHODS = {
    login: {
        version: '1.0',
        url: '/accounts/auth/api/login'
    },
    shop: {
        version: '0.0',
        url: '/shop/info'
    },
    heroInfo: {
        version: '1.9',
        url: '/game/api/info'
    },
    sendHelp: {
        version: '1.0',
        url: '/game/abilities/help/api/use'
    },
    getCards: {
        version: '2.0',
        url: '/game/cards/api/get-cards'
    }
};

function generateCsrf() {
    const alpha = '1234567890qazxswedcvfrtgbnhyujmkiolpQAZXSWEDCVFRTGBNHYUJMKIOLP';
    let token = '';
    for (let i = 0; i < 64; i++) {
        token += alpha[Math.floor(Math.random() * alpha.length)];
    }

    return token;
}

/**
 *
 * @param method
 * @returns {string}
 */
function buildBaseApiUrl(method) {
    return `${method.url}?api_version=${method.version}&api_client=${CLIENT_NAME}`;
}

/**
 *
 * @param cookieSets
 */
function parseCookies(cookieSets) {
    const list = {};
    if (cookieSets && typeof cookieSets.length !== 'undefined') {
        for(let i = 0; i < cookieSets.length; i++) {
            const rawCookie = cookieSets[i].split(';')[0].split('=');
            list[rawCookie[0]] = rawCookie[1];
        }
    }
    return list;
}

function parseResponse(response) {
    if (/json/.test(response.headers['content-type'])) {
        try {
            return JSON.parse(response.body);
        } catch(e) {
            return response.body;
        }
    }

    return response.body;
}

class Account {
    constructor (host) {
        this.host = host;
        this.username = '';
        this.password = '';
        this.sessionId = '';
        this.crfsToken1 = '';
        this.crfsToken2 = '';
    }

    async login(login, password) {
        this.username = login;
        this.password = password;

        const loginResponse = await this.sendRequest(
            buildBaseApiUrl(METHODS.login),
            'POST',
            {
                "email": this.username,
                "password": this.password
            }
        );

        const cookies = parseCookies(loginResponse.headers['set-cookie']);
        this.crfsToken1 = cookies['csrftoken'];
        this.sessionId = cookies['sessionid'];

        return this;
    }

    async getShop() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.shop)));
    }

    async getHeroInfo() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.heroInfo)));
    }

    async sendHelp() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.sendHelp), 'POST'));
    }

    async getCards() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.getCards)));
    }

    /**
     *
     * @param uri
     * @param type
     * @param data
     * @returns {Promise<any>}
     */
    sendRequest(uri, type = 'GET', data = {}) {
        return new Promise((success, reject) => {
            const csrf = this.crfsToken1 ? this.crfsToken1 : generateCsrf();
            const sessionid = this.sessionId ? this.sessionId : generateCsrf();
            if (type === 'GET') {
                data['_'] = (new Date()).getTime();
            }

            const encodedData = querystring.encode(data);
            const options = {
                host: this.host,
                path: uri + (type === "GET" && encodedData ? `&${encodedData}` : ''),
                method: type === 'POST' ? 'POST' : 'GET',
                headers: {
                    Referer: 'https://' + this.host,
                    Cookie: `csrftoken=${csrf}; sessionid=${sessionid}`
                }
            };

            if (options.method === 'POST') {
                options.headers['Content-type'] = 'application/x-www-form-urlencoded';
                options.headers['Content-length'] = Buffer.from(encodedData).length;
                options.headers['x-csrftoken'] = csrf;
            }

            const req = https.request(options, (response) => {
                const chunks = [];
                response.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                response.on('end', () => {
                    success({
                        headers: response.headers,
                        body: Buffer.concat(chunks).toString('utf-8')
                    });
                });
            });

            req.on('error', reject);

            if (options.method === 'POST' && encodedData) {
                req.write(encodedData);
            }

            req.end();
        });
    }
}

module.exports = Account;
