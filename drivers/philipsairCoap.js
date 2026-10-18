'use strict';

const { CoapClient } = require('node-coap-client');
const { Origin } = require('node-coap-client/build/lib/Origin');
const crypto = require('crypto');
const aesjs = require('aes-js');
const pkcs7 = require('pkcs7');

const SHARED_KEY = 'JiangPan';
const PORT = 5683;
const MAX_COUNTER = 2000000000;

const REQUEST_TIMEOUT = 10 * 1000;
const FIRST_STATUS_TIMEOUT = 30 * 1000;   // no status this long after subscribing = connect failed
const SILENCE_TIMEOUT = 45 * 1000;        // devices push every few seconds; silence this long = resubscribe
const WATCHDOG_INTERVAL = 15 * 1000;
const RETRY_MIN = 5 * 1000;
const RETRY_MAX = 2 * 60 * 1000;
const UNAVAILABLE_AFTER_FAILURES = 3;
const BATCH_WINDOW = 50;                  // back-to-back setValues calls are sent as one message

// ---- protocol helpers -------------------------------------------------------

function decodeCounter(hex) {
    return parseInt(hex, 16);
}

function encodeCounter(counter) {
    return counter.toString(16).toUpperCase().padStart(8, '0');
}

function sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function keyAndIv(encodedCounter) {
    const hex = crypto.createHash('md5').update(SHARED_KEY + encodedCounter).digest('hex').toUpperCase();
    return {
        key: Buffer.from(hex.substring(0, hex.length / 2), 'utf-8'),
        iv: Buffer.from(hex.substring(hex.length / 2), 'utf-8'),
    };
}

/** Decrypts a /sys/dev/status payload; returns { counter, reported } or throws. */
function decryptStatus(response) {
    const encodedCounter = response.substring(0, 8);
    const hash = response.substring(response.length - 64);
    const counterAndMessage = response.substring(0, response.length - 64);
    if (sha256Hex(counterAndMessage) !== hash) {
        throw new Error('Invalid message hash');
    }
    const encrypted = Buffer.from(response.substring(8, response.length - 64), 'hex');
    if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
        throw new Error('Message corrupted, length ' + encrypted.length);
    }
    const { key, iv } = keyAndIv(encodedCounter);
    const text = aesjs.utils.utf8.fromBytes(new aesjs.ModeOfOperation.cbc(key, iv).decrypt(encrypted));
    // strips PKCS7 padding and other non-JSON control characters
    const cleaned = text.replace(/[\u0000-\u0019]+/g, '').trimEnd();
    let json;
    try {
        json = JSON.parse(cleaned);
    } catch (error) {
        throw new Error(`${error.message}: ${cleaned.substring(0, 200)}`);
    }
    return { counter: decodeCounter(encodedCounter), reported: json.state.reported };
}

function encryptCommand(values, counter) {
    const message = {
        state: {
            desired: Object.assign({ CommandType: 'app', DeviceId: '', EnduserId: '1' }, values),
        },
    };
    const encodedCounter = encodeCounter(counter);
    const { key, iv } = keyAndIv(encodedCounter);
    const padded = pkcs7.pad(aesjs.utils.utf8.toBytes(JSON.stringify(message)));
    const encrypted = Buffer.from(new aesjs.ModeOfOperation.cbc(key, iv).encrypt(padded)).toString('hex').toUpperCase();
    const result = encodedCounter + encrypted;
    return result + sha256Hex(result);
}

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---- per-device session -----------------------------------------------------

class CoapSession {

    constructor(device) {
        this.device = device;
        this.statusCounter = 0;
        this.controlCounter = 0;
        this.stopped = true;
        this.sending = false;
        this.observedUrl = null;
        this.connectedAt = 0;
        this.lastStatusAt = 0;
        this.failures = 0;
        this.available = null;
        this.timer = null;
        this.watchdog = null;
        this.queue = Promise.resolve();
        this.batch = null;
    }

    endpoint() {
        const host = this.device.getSetting('ipkey');
        return {
            host,
            target: new Origin('coap:', host, PORT),
            base: `coap://${host}:${PORT}`,
        };
    }

    start() {
        this.stopped = false;
        this.failures = 0;
        this.schedule(this.device.getSetting('add_delay') ? 60 * 1000 : 0);
        if (!this.watchdog) {
            this.watchdog = this.device.homey.setInterval(() => this.checkHealth(), WATCHDOG_INTERVAL);
        }
    }

    stop() {
        this.stopped = true;
        this.clearTimer();
        if (this.watchdog) {
            this.device.homey.clearInterval(this.watchdog);
            this.watchdog = null;
        }
        this.unobserve();
    }

    restart() {
        this.unobserve();
        this.start();
    }

    clearTimer() {
        if (this.timer) {
            this.device.homey.clearTimeout(this.timer);
            this.timer = null;
        }
    }

    schedule(delay) {
        this.clearTimer();
        if (this.stopped) return;
        this.timer = this.device.homey.setTimeout(() => {
            this.timer = null;
            this.connect();
        }, delay);
    }

    unobserve() {
        if (this.observedUrl) {
            CoapClient.stopObserving(this.observedUrl);
            this.observedUrl = null;
        }
    }

    async sync(base) {
        const response = await withTimeout(
            CoapClient.request(`${base}/sys/dev/sync`, 'post', Buffer.from(encodeCounter(this.statusCounter)), { keepAlive: true }),
            REQUEST_TIMEOUT, 'No response to sync from ' + base);
        if (!response || !response.payload) {
            throw new Error('Empty sync response from ' + base);
        }
        this.controlCounter = decodeCounter(response.payload.toString('utf-8'));
    }

    async connect() {
        if (this.stopped || this.sending) return;
        const { host, target, base } = this.endpoint();
        if (!host) {
            this.setAvailable(false, 'No IP address configured');
            return;
        }
        try {
            this.unobserve();
            if (this.failures > 0) CoapClient.reset(target);
            await CoapClient.tryToConnect(target);
            await this.sync(base);
            if (this.stopped || this.sending) return;

            const url = `${base}/sys/dev/status`;
            this.observedUrl = url;
            this.connectedAt = Date.now();
            this.lastStatusAt = 0;
            CoapClient.observe(url, 'get', (resp) => this.onStatus(resp), undefined, {
                confirmable: false, // we expect no answer here in the typical coap way.
                retransmit: false,
            }).catch((error) => this.device.log('observe stopped:', error && error.message));
        } catch (error) {
            this.onFailure(error);
        }
    }

    checkHealth() {
        if (this.stopped || this.sending || !this.observedUrl) return;
        const now = Date.now();
        if (!this.lastStatusAt) {
            if (now - this.connectedAt > FIRST_STATUS_TIMEOUT) {
                this.onFailure(new Error('No status received after subscribing'));
            }
        } else if (now - this.lastStatusAt > SILENCE_TIMEOUT) {
            this.device.log(`No status for ${Math.round((now - this.lastStatusAt) / 1000)}s, resubscribing`);
            this.unobserve();
            this.schedule(0);
        }
    }

    onFailure(error) {
        this.failures += 1;
        const delay = Math.min(RETRY_MIN * 2 ** (this.failures - 1), RETRY_MAX);
        this.device.log(`CoAP connection failed (${this.failures}x), retry in ${delay / 1000}s:`, error && error.message);
        if (this.failures >= UNAVAILABLE_AFTER_FAILURES) {
            this.setAvailable(false, 'Device not reachable');
        }
        this.unobserve();
        try {
            CoapClient.reset(this.endpoint().target);
        } catch (e) {
            // ignore
        }
        this.schedule(delay);
    }

    onStatus(resp) {
        if (!resp.payload || this.stopped) return;
        let status;
        try {
            status = decryptStatus(resp.payload.toString('utf-8'));
        } catch (error) {
            this.device.log('Ignoring status message:', error.message);
            return;
        }
        this.statusCounter = status.counter >= MAX_COUNTER ? 1 : status.counter;
        this.lastStatusAt = Date.now();
        this.failures = 0;
        this.setAvailable(true);
        try {
            this.device.handleDeviceStatus(status.reported, this.device.getSettings());
        } catch (error) {
            this.device.error('handleDeviceStatus failed:', error);
        }
    }

    setAvailable(available, reason) {
        if (this.available === available) return;
        this.available = available;
        const result = available ? this.device.setAvailable() : this.device.setUnavailable(reason);
        result.catch((error) => this.device.error(error));
    }

    setValues(values) {
        if (!this.batch) {
            const batch = { values: {} };
            batch.promise = new Promise((resolve, reject) => {
                this.device.homey.setTimeout(() => {
                    this.batch = null;
                    this.queue = this.queue.then(() => this.send(batch.values)).then(resolve, reject);
                }, BATCH_WINDOW);
            });
            this.batch = batch;
        }
        Object.assign(this.batch.values, values);
        return this.batch.promise;
    }

    async send(values) {
        const { host, target, base } = this.endpoint();
        if (!host) throw new Error('No IP address configured');
        this.device.log('setValues', JSON.stringify(values));

        // this CoAP client gets no sync reply while subscribed, so pause the subscription around the command
        this.sending = true;
        this.clearTimer();
        this.unobserve();
        try {
            await CoapClient.tryToConnect(target);
            await this.sync(base);
            this.controlCounter = this.controlCounter >= MAX_COUNTER ? 1 : this.controlCounter + 1;
            const response = await withTimeout(
                CoapClient.request(`${base}/sys/dev/control`, 'post', Buffer.from(encryptCommand(values, this.controlCounter)), { keepAlive: true }),
                REQUEST_TIMEOUT, 'No response to command from ' + base);
            const text = response && response.payload ? response.payload.toString('utf-8') : '';
            this.device.log('control response', text);
            let result = null;
            try {
                result = JSON.parse(text);
            } catch (e) {
                // not JSON, nothing to check
            }
            if (result && result.status && result.status !== 'success') {
                throw new Error('Device rejected command: ' + text);
            }
            return text;
        } finally {
            this.sending = false;
            // resubscribe right away; the first status confirms the change
            this.schedule(0);
        }
    }
}

function session(device) {
    if (!device._coapSession) {
        device._coapSession = new CoapSession(device);
    }
    return device._coapSession;
}

module.exports = {
    start: (device) => session(device).start(),
    stop: (device) => {
        if (device._coapSession) device._coapSession.stop();
    },
    restart: (device) => session(device).restart(),
    setValues: (device, values) => session(device).setValues(values),
};
