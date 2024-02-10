



const coap = require("node-coap-client").CoapClient;
const origin = require('node-coap-client/build/lib/Origin');
const crypto = require('crypto');
var aesjs = require('aes-js');
var pkcs7 = require('pkcs7');

var sharedKey = 'JiangPan';

var statusCounter = 0;
var controlCounter = 0;

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
    var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
    var decryptedBytes = aesCbc.decrypt(data);
    return decryptedBytes;
}

function aes_encrypt2(data, key, iv) {
    var segmentSize = 16;
    var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
    var encryptedBytes = aesCbc.encrypt(data);
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

// sleep time expects milliseconds
function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}


var keyOn = "D03102"
var valueOn = 1

// child lock 
// var key =  "D03103"
// var value = "0" // "1"

// display D03105
var key2 =  "D03105"
var value2 = 100 // "0" "100"

// display D03106
// var key =  "D03106"
// var value = "2" // "0" or 2

// var key =  "D0310C"
// var value = "1" // "0" or 2  auto
// var key2 =  "D0310D"
// var value2 = "2" // "0" or 2



console.log('setStateCoap: ' + keyOn + ":" + valueOn);
setValueAirDataCoap(keyOn, valueOn).then(data => {
    console.log("-setValueCoapAirData-begin-");
    console.log(data);
    console.log("-setValueCoapAirData-end-");
})

// sleep(4000).then(() => {
//     console.log('setStateCoap2: ' + key2 + ":" + value2);
//     setValueAirDataCoap(key2, value2).then(data => {
//         console.log("-setValueCoapAirData2-begin-");
//         console.log(data);
//         console.log("-setValueCoapAirData2-end-");
//     })
// });



function setValueAirDataCoap(key, value) {
    console.log("key " + key)
    console.log("value " + value)
    return new Promise((resolve, reject) => {
        setValueDataCoap(key, value, (error, jsonobj) => {
            if (jsonobj) {
                resolve(jsonobj);
            } else {
                reject(error);
            }
        });
    }).catch(reason => console.log('1: ' + reason));
}


async function setValueDataCoap(key, value, callback) {
    console.log("setValueDataCoap ");
    var target = new origin.Origin('coap:', "192.168.178.44", 5683);
    var targetString = 'coap://' + "192.168.178.44" + ':5683';    

    let jsonStatus = null;

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
                let error = new Error('No response received for call. Cannot proceed, is coap://192.168.178.44:5683 up');
                return callback(error, null);
            }
        }).catch(err => {
            let error = new Error('No response received for call. Cannot proceed, is coap://192.168.178.44:5683 up');
            return callback(error, null);
            console.log(err);
        });

    await coap.tryToConnect(target);
    console.log('tryToConnect ');

    sleep(1000).then(() => {
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

        coap.request(targetString + '/sys/dev/control', 'post',
            Buffer.from(result), { keepAlive: false })
            .then(response => {
                // console.log(response);
                if (response.payload) {
                    const payload = response.payload.toString('utf-8');
                    console.log(payload);
                    jsonStatus = payload
                } else {
                    // throw new Error('No response received for call. Cannot proceed');
                    let error = new Error('No response received for call. Cannot proceed');
                    return callback(error, null);
                }
            }).catch(err => {
                console.log(err);
            });
        console.log('-------------------');
    });

    sleep(2000).then(() => {
        console.log('-------------------');
        coap.reset(target);
        var response = {
            status: jsonStatus
        };
        if (jsonStatus != null) {
            return callback(null, response);
        } else {
            return callback(new Error('No response received'), null);
        }
        console.log('-------------------');
    });
}
