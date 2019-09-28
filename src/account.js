const https = require('https');
const querystring = require('querystring');

const CLIENT_NAME = 'CrazyNigerHACS-1.0';

const AUTH_STATE = {
    NOT_REQUESTED: 0,
    WAIT: 1,
    SUCCESS: 2,
    REJECT: 3
};

const METHODS = {
    gameInfo: {
        version: '1.0',
        url: '/api/info'
    },

    authRequest: {
        version: '1.0',
        method: 'POST',
        url: '/accounts/third-party/tokens/api/request-authorisation',
    },

    authState: {
        version: '1.0',
        method: 'GET',
        url: '/accounts/third-party/tokens/api/authorisation-state'
    },

    authLogout: {
        version: '1.0',
        method: 'POST',
        url: '/accounts/auth/api/logout'
    },

    accountInfo: {
        version: '1.0',
        method: 'GET',
        url: '/accounts/%accountId%/api/show'
    },

    newMessagesNumber: {
        version: '1.0',
        method: 'GET',
        url: '/accounts/messages/api/new-messages-number'
    },

    login: {
        version: '1.0',
        url: '/accounts/auth/api/login'
    },

    shopInfo: {
        version: '0.0',
        url: '/shop/info'
    },
    shopItemPrices: {
        version: '0.0',
        url: '/shop/item-type-prices'
    },
    shopCreateSellLot: {
        version: '0.0',
        url: '/shop/create-sell-lot'
    },
    shopCancelSellLot: {
        version: '0.0',
        url: '/shop/cancel-sell-lot'
    },
    shopCloseSellLot: {
        version: '0.0',
        url: '/shop/close-sell-lot'
    },

    heroInfo: {
        version: '1.9',
        method: 'GET',
        url: '/game/api/info'
    },
    sendHelp: {
        version: '1.0',
        url: '/game/abilities/help/api/use'
    },

    cardGet: {
        version: '2.0',
        url: '/game/cards/api/get-cards'
    },
    cardReceive: {
        version: '1.0',
        url: '/game/cards/api/receive'
    },
    cardCombine: {
        version: '2.0',
        url: '/game/cards/api/combine'
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
 * @param urlReplaceParams
 * @returns {string}
 */
function buildBaseApiUrl(method, urlReplaceParams = null) {
    let baseUrl = method.url;

    if (urlReplaceParams) {
        baseUrl = Object.keys(urlReplaceParams).reduce(
            (url, placeHolder) => baseUrl.replace(`%${placeHolder}%`, urlReplaceParams[placeHolder])
        , baseUrl);

    }

    return `${baseUrl}?api_version=${method.version}&api_client=${CLIENT_NAME}`;
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
        this.crfsToken = '';

        this.accountId = null;
        this.accountName = null;

        this.heroId = null;
        this.heroName = null;
    }

    /**
     * Получени базовой информации об игре
     *
     * @return {Promise<*>}
     */
    async info() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.gameInfo)));
    }

    /**
     * Запрос на авторизацию приложения, в результате будет ссылка дял пользоватля для подтверждения авторизации
     * и токен для првоерки
     *
     * @param applicationName
     * @param applicationInfo
     * @param applicationDesc
     * @return {Promise<*>}
     */
    async authRequest(applicationName, applicationInfo, applicationDesc = '') {
        const authResponse = await this.sendRequest(
            buildBaseApiUrl(METHODS.authRequest),
            METHODS.authRequest.method,
            {
                application_name: applicationName,
                application_info: applicationInfo,
                application_description: applicationDesc
            }
        );

        const cookies = parseCookies(authResponse.headers['set-cookie']);
        this.crfsToken = cookies['csrftoken'];
        this.sessionId = cookies['sessionid'];

        const response = parseResponse(authResponse);

        if (response.status === 'error') {
            throw new Error("Error from Tale API: " + JSON.stringify(response.errors))
        }

        return parseResponse(authResponse).data.authorisation_page;
    }

    /**
     * Запрос на авторизацию приложения, в результате будет ссылка дял пользоватля для подтверждения авторизации
     * и токен для првоерки
     *
     * @return {Promise<*>}
     */
    async authState() {
        const authStateResponse = await this.sendRequest(
            buildBaseApiUrl(METHODS.authState),
            METHODS.authState.method
        );

        const result = parseResponse(authStateResponse);
        if (result.data.state === AUTH_STATE.SUCCESS) {
            const cookies = parseCookies(authStateResponse.headers['set-cookie']);
            this.crfsToken = cookies['csrftoken'];
            this.sessionId = cookies['sessionid'];

            this.accountId = result.data.account_id;
            this.accountName = result.data.accountName;
        }

        return result.data;
    }

    /**
     * Завершение пользовательской сессии
     *
     * @return {Promise<*>}
     */
    async authLogout() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.authLogout), METHODS.authLogout.method));
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
        this.crfsToken = cookies['csrftoken'];
        this.sessionId = cookies['sessionid'];

        return this;
    }

    async shopInfo() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.shopInfo)));
    }

    /**
     * Возвращает цены для указаной Карты Судьбы
     *
     * @param cardType
     * @return {Promise<*>}
     */
    async shopItemPrices(cardType) {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.shopItemPrices), 'GET', {item_type: cardType}));
    }

    /**
     * Выставляет указаннубю карту (card_uid) на рынок по указаной цене
     *
     * @param card [string] Строка или массив строк с ID Карт Судьбы
     * @param price number Цена продажи
     * @return {Promise<*>}
     */
    async shopCreateSellLot(card, price) {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.shopCreateSellLot), 'POST', {card, price}));
    }

    /**
     * Отмена выставленной карты
     *
     * @param cardType string Полный тип карты
     * @param price number цена
     * @return {Promise<*>}
     */
    async shopCancelSellLot(cardType, price) {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.shopCancelSellLot), 'POST', {item_type: cardType, price}));
    }

    /**
     * Купить карту казанного типа, по указаной цене
     *
     * @param cardType
     * @param price
     * @return {Promise<*>}
     */
    async shopCloseSellLot(cardType, price) {
        const pospondedResponse = await parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.shopCloseSellLot), 'POST', {item_type: cardType, price}));

        return await this.waitPospondetTask(pospondedResponse.status_url);
    }

    /**
     * Получение информации о текущем акаунте
     *
     * @return {Promise<*>}
     */
    async accountInfo() {
        if (!this.accountId) {
            return Promise.resolve({});
        }

        return await parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.accountInfo, {accountId: this.accountId}), METHODS.accountInfo.method));
    }

    /**
     * Получение информаци о состоняии героя
     *
     * @param clientTurns
     * @param accountId
     * @return {Promise<*>}
     */
    async getHeroInfo(clientTurns = null, accountId = null) {
        return parseResponse(await this.sendRequest(
            buildBaseApiUrl(METHODS.heroInfo),
            METHODS.heroInfo.method,
            {
                client_turns: clientTurns,
                account_id: accountId
            }
        ));
    }

    async sendHelp() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.sendHelp), 'POST'));
    }

    /**
     * Получить список карт
     *
     * @link https://docs.the-tale.org/ru/stable/external_api/methods.html#id16
     * @return {Promise<*>}
     */
    async cardGet() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.cardGet)));
    }

    /**
     * Получить новые карты
     *
     * @link https://docs.the-tale.org/ru/stable/external_api/methods.html#id13
     * @return {Promise<*>}
     */
    async cardReceive() {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.cardReceive), 'POST'));
    }

    /**
     * Превратить карты
     *
     * @link https://docs.the-tale.org/ru/stable/external_api/methods.html#id14
     *
     * @param card string[]
     * @return {Promise<*>}
     */
    async cardCombine(card) {
        return parseResponse(await this.sendRequest(buildBaseApiUrl(METHODS.cardCombine), 'POST', {card}));
    }

    waitPospondetTask(url) {
        return new Promise((success, reject) => {
            function checkUrl() {
                this.sendRequest(url + '?').then((response) => {
                    const data = parseResponse(response);
                    if (data.status === 'processing') {
                        setTimeout(checkUrl.bind(this), 300);
                    } else {
                        success(data);
                    }
                });
            }

            setTimeout(checkUrl.bind(this), 300);
        });
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
            const csrf = this.crfsToken ? this.crfsToken : generateCsrf();
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
