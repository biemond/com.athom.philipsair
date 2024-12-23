const { resolve } = require("path");

(function () {

    let philipsairCoap = exports;

    const coapclass = require("node-coap-client");
    const origin = require('node-coap-client/build/lib/Origin');
    const crypto = require('crypto');
    let aesjs = require('aes-js');
    let pkcs7 = require('pkcs7');

    let sharedKey = 'JiangPan';

    let statusCounter = 0;
    let controlCounter = 0;

    function decodeCounter(encodedCounter) {
        let counterUpperCase = encodedCounter.toUpperCase();
        let length = counterUpperCase.length;

        let counter = 0;
        for (let i = length; i > 0; i--) {
            let charAt = counterUpperCase.charAt(i - 1);
            counter = (counter) + Math.pow(16.0, length - i) * ((charAt < '0' || charAt > '9') ? charAt.charCodeAt(0) - '7'.charCodeAt(0) : charAt.charCodeAt(0) - '0'.charCodeAt(0));
        }
        return counter;
    }

    function encodeCounter(counter, length) {
        let hex = counter.toString(16);
        if (hex.length % 2 === 1) {
            hex = '0' + hex;
        }
        return prependZero(hex.toUpperCase(), length);
    }

    function prependZero(value, length) {
        let result = '';
        for (let i = 0; i < length - value.length; i++) {
            result = '0' + result;
        }
        return (result + value).substring(0, length);
    }
    function toMD5(value) {
        return crypto.createHash('md5').update(value).digest();
    }

    function toSha256(value) {
        return crypto.createHash('sha256').update(value).digest();
    }

    function aes_decrypt2(data, key, iv) {
        let aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
        let decryptedBytes = aesCbc.decrypt(data);
        return decryptedBytes;
    }

    function aes_encrypt2(data, key, iv) {
        let segmentSize = 16;
        let aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
        let encryptedBytes = aesCbc.encrypt(data);
        return encryptedBytes;
    }

    function clean(data) {
        data = data.trimRight().replace(/\\n/g, "\\n")
            .replace(/\\'/g, "\\'")
            .replace(/\\"/g, '\\"')
            .replace(/\\&/g, "\\&")
            .replace(/\\r/g, "\\r")
            .replace(/\\t/g, "\\t")
            .replace(/\\b/g, "\\b")
            .replace(/\\f/g, "\\f");
        // remove non-printable and other non-valid JSON chars
        data = data.replace(/[\u0000-\u0019]+/g, "");
        return JSON.parse(data);
    }

    // active functions()  -------------------------------------  active functions()  --------------------------------------------

    philipsairCoap.getCurrentStatusDataCoap = function getCurrentStatusDataCoap(settings, device) {
        console.log("settings " + JSON.stringify(settings));
        return new Promise(async (resolve, reject) => {
            await getCurrentDataCoap(settings, device, (error, jsonobj) => {
                if (jsonobj) {
                    console.log('getCurrentDataCoap res ', jsonobj)
                    resolve(jsonobj);
                } else {
                    console.log('2: ' + error);
                    reject(error);
                }
            });
        }).catch(reason => console.log('1: ' + reason));
    }

    philipsairCoap.setValueAirDataCoap = function setValueAirDataCoap(key, value, settings, device) {
        console.log("key " + key)
        console.log("value " + value)
        console.log("settings " + JSON.stringify(settings));
        return new Promise((resolve, reject) => {
            setValueDataCoap(key, value, settings, device, (error, jsonobj) => {
                if (jsonobj) {
                    resolve(jsonobj);
                } else {
                    reject(error);
                }
            });
        }).catch(reason => console.log('1: ' + reason));
    }

    // sleep time expects milliseconds
    function sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    let newTimeout = (handler, delay) => {
        let id = setTimeout(handler, delay), clear = clearTimeout.bind(null, id);
        return {id, clear, trigger: () => (clear(), handler())};
    };

    async function getCurrentDataCoap(settings, device, callback) {

        if (settings.add_delay == true){
            console.log("add 60 sec delay");
            await sleep(60000);
        } else {
            console.log("no delay");
        }

        console.log("getCurrentDataCoap " + settings.ipkey);
        let target = new origin.Origin('coap:', settings.ipkey, 5683);
        let targetString = 'coap://' + settings.ipkey + ':5683';

        let coap;
        if (device.getClient()) {
            coap = device.getClient();
            coap.reset(target);
        } else {
            coap = coapclass.CoapClient;
        }

        let jsonStatus = null;

        coap.request(targetString + '/sys/dev/sync', 'post',
            Buffer.from(encodeCounter(statusCounter, 8)), { keepAlive: true })
            .then(response => {
                if (response.payload) {
                    const payload = response.payload.toString('utf-8');
                    controlCounter = decodeCounter(payload);
                    // console.log(controlCounter);
                } else {
                    let error = new Error('No response received for sync call. Cannot proceed, is coap://' + settings.ipkey + ':5683 up');
                    // coap.reset(target);
                    return callback(error, null);
                    // throw new Error('No response received for sync call. Cannot proceed, is coap://'+settings.ipkey+':5683 up');
                }
            }).catch(err => {
                console.log(err);
                let error = new Error('catch: No response received for sync call. Cannot proceed, is coap://' + settings.ipkey + ':5683 up');
                coap.reset(target);
                return callback(error, null);
                // throw new Error('No response received for sync call. Cannot proceed, is coap://'+settings.ipkey+':5683 up');
            });

        const connectResult = await coap.tryToConnect(target);
       
        console.log("tryToConnect " + connectResult);
        device.setClient(coap);

        await coap.observe(targetString + '/sys/dev/status', 'get', resp => {
            if (resp.payload) {
                const response = resp.payload.toString('utf-8');
                const encodedCounter = response.substring(0, 8);
                let counter = decodeCounter(encodedCounter);
                console.log("counter " + counter);
                const hash = response.substring(response.length - 64);
                const encodedMessageAndCounter = response.substring(0, response.length - 64);
                // console.log(encodedMessageAndCounter);
                const hashedMessage = Buffer.from(toSha256(encodedMessageAndCounter)).toString('hex').toUpperCase();

                if (counter < 1 || counter > 2000000000 ||
                    ((counter < statusCounter && statusCounter < 2000000000 - 10) ||
                        ((counter > statusCounter + 10 && counter < 2000000000) ||
                            (2000000000 - statusCounter < 10 && counter < statusCounter &&
                                (10 - (2000000000 - statusCounter)) + 1 < counter && counter < statusCounter)))) {
                    console.log('Invalid message id');
                }
                if (hash !== hashedMessage) {
                    console.log('Invalid message hash');
                }
                if (counter >= 2000000000) {
                    counter = 1;
                }

                statusCounter = counter;

                let keyAndIv = toMD5(sharedKey + encodedCounter).toString('hex').toUpperCase();
                // console.log("keyAndIv " + keyAndIv);
                const secretKey = keyAndIv.substring(0, keyAndIv.length / 2);
                // console.log("secret " + secretKey);
                const iv = keyAndIv.substring(keyAndIv.length / 2, keyAndIv.length);
                // console.log("iv " + iv);

                const encodedMessage = response.substring(8, response.length - 64);

                let payload = new Buffer.from(encodedMessage, 'hex');
                let data = aes_decrypt2(payload, Buffer.from(secretKey, 'utf-8'), Buffer.from(iv, 'utf-8'));
                let dataText = aesjs.utils.utf8.fromBytes(data);
                jsonStatus = clean(dataText).state.reported;
                console.log(jsonStatus);
                device.handleDeviceStatus(jsonStatus, settings);
            }

        }, undefined, {
            confirmable: false, // we expect no answer here in the typical coap way.
            retransmit: false
        }).then(() => {
            // TODO: nothing?
        }).catch(function (error) { 
            console.log(error); 
            console.log('observe stopped'); 
            
        });

        let timeoutId = newTimeout(function () {
            let response = {
                status: jsonStatus
            };
            coap.stopObserving('coap://'  + settings.ipkey + ':5683/sys/dev/status');
            
            console.log('---------timeout----------');
            if (jsonStatus != null) {
                return callback(null, response);
            } else {
                return callback(new Error('No response received'), null);
            }    
        }, 600000);


        device.setTimeoutId(timeoutId);
    }
    
    async function setValueDataCoap(key, value, settings, device, callback) {
        console.log("setValueDataCoap ");
        let target = new origin.Origin('coap:', settings.ipkey, 5683);
        let targetString = 'coap://' + settings.ipkey + ':5683';
        let jsonStatus = null;

        let coap = device.getClient();

        await coap.stopObserving('coap://'  + settings.ipkey + ':5683/sys/dev/status');
        
        // await coap.reset(target);
        coap = coapclass.CoapClient;

        console.log('-------------------')
        coap.request(targetString + '/sys/dev/sync', 'post',
            Buffer.from(encodeCounter(statusCounter, 8)),
            { keepAlive: false })
            .then(response => {
                // console.log(response);
                if (response.payload) {
                    const payload = response.payload.toString('utf-8');
                    controlCounter = decodeCounter(payload);
                    console.log(controlCounter);
                } else {
                    let error = new Error('No response received for call. Cannot proceed, is coap://' + settings.ipkey + ':5683 up');
                    return callback(error, null);
                }
            }).catch(err => {
                let error = new Error('No response received for call. Cannot proceed, is coap://' + settings.ipkey + ':5683 up');
                return callback(error, null);
                console.log(err);
            });

        await coap.tryToConnect(target);
        console.log('tryToConnect ');

        sleep(2000).then(() => {
            console.log('-------------------')

            let message = {
                state: {
                    desired: {
                        CommandType: 'app',
                        DeviceId: '',
                        EnduserId: '1'
                    }
                }
            };

            (message.state.desired)[key] = value;
            const messageString = JSON.stringify(message);
            console.log('messageString ' + messageString);

            if (controlCounter == 2000000000) {
                controlCounter = 1;
            } else {
                controlCounter = controlCounter + 1;
            }

            let encodedCounter = encodeCounter(controlCounter, 8);
            let keyAndIv = toMD5(sharedKey + encodedCounter).toString('hex').toUpperCase();

            const secretKey = keyAndIv.substring(0, keyAndIv.length / 2);
            const iv = keyAndIv.substring(keyAndIv.length / 2, keyAndIv.length);

            let dataBytes = pkcs7.pad(aesjs.utils.utf8.toBytes(messageString));
            const encodedMessage = Buffer.from(aes_encrypt2(dataBytes, Buffer.from(secretKey, 'utf-8'), Buffer.from(iv, 'utf-8'))).toString('hex').toUpperCase();
            // console.log('encodedMessage '+encodedMessage);
            let result = encodedCounter + encodedMessage;

            const hash = Buffer.from(toSha256(result)).toString('hex').toUpperCase();

            result = encodedCounter + encodedMessage + hash;
            console.log(targetString);
            coap.request(targetString + '/sys/dev/control', 'post',
                Buffer.from(result), { keepAlive: false })
                .then(response => {
                    console.log(response);
                    if (response.payload) {
                        const payload = response.payload.toString('utf-8');
                        console.log(payload);
                        jsonStatus = payload
                    } 
                }).catch(err => {
                    console.log(err);
                });
            console.log('-------------------');
        });

        sleep(4000).then(() => {
            console.log('-------------------');
            let response = {
                status: jsonStatus
            };
            // coap.reset(target);
            console.log("intervalId: ", device.getTimeoutId());
            device.getTimeoutId().trigger();
            // clearTimeout(device.getTimeoutId());
            if (jsonStatus != null) {
                return callback(null, response);
            } else {
                return callback(new Error('No response received'), null);
            }
        });
    }
})();