
console.log("pollAirCoapDevice");
console.log("getCurrentStatusDataCoap");

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


function getCurrentStatusDataCoap() {
    return new Promise(async (resolve, reject) => {
        await getCurrentDataCoap( (error, jsonobj) => {
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

// sleep time expects milliseconds
function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

async function getCurrentDataCoap( callback) {
    var target = new origin.Origin('coap:', "192.168.178.44", 5683);
    var targetString = 'coap://' + "192.168.178.44" + ':5683';

    let jsonStatus = null;

    coap.request(targetString + '/sys/dev/sync', 'post',
        Buffer.from(encodeCounter(statusCounter, 8)), { keepAlive: false })
        .then(response => {
            if (response.payload) {
                const payload = response.payload.toString('utf-8');
                controlCounter = decodeCounter(payload);
                console.log(controlCounter);
            } else {
                let error = new Error('No response received for sync call. Cannot proceed, is coap://' + "192.168.178.44" + ':5683 up');
                return callback(error, null);
                // throw new Error('No response received for sync call. Cannot proceed, is coap://'+"192.168.178.44"+':5683 up');
            }
        }).catch(err => {
            console.log(err);
            let error = new Error('catch: No response received for sync call. Cannot proceed, is coap://' + "192.168.178.44" + ':5683 up');
            return callback(error, null);
            // throw new Error('No response received for sync call. Cannot proceed, is coap://'+"192.168.178.44"+':5683 up');
        });

    const connectResult = await coap.tryToConnect(target);

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
            console.log("keyAndIv " + keyAndIv);
            const secretKey = keyAndIv.substring(0, keyAndIv.length / 2);
            console.log("secret " + secretKey);
            const iv = keyAndIv.substring(keyAndIv.length / 2, keyAndIv.length);
            console.log("iv " + iv);

            const encodedMessage = response.substring(8, response.length - 64);

            let payload = new Buffer.from(encodedMessage, 'hex');
            let data = aes_decrypt2(payload, Buffer.from(secretKey, 'utf-8'), Buffer.from(iv, 'utf-8'));
            let dataText = aesjs.utils.utf8.fromBytes(data);
            jsonStatus = clean(dataText).state.reported;
            console.log(jsonStatus);
            console.log('-------stopObserving------------')
            coap.stopObserving('coap://' + "192.168.178.44" + ':5683/sys/dev/status')
            console.log('---------end----------');
        }

    }, undefined, {
        confirmable: false, // we expect no answer here in the typical coap way.
        retransmit: true
    }).then(() => {
        // TODO: nothing?
    }).catch(reason => console.log(reason));

    sleep(30000).then(() => {
        console.log('--------reset-----------');
        coap.reset(target);
        console.log('---------end----------');
    });

    setTimeout(function () {
        var response = {
            status: jsonStatus
        };
        if (jsonStatus != null) {
            return callback(null, response);
        } else {
            return callback(new Error('No response received'), null);
        }
    }, 32000)
}

// start
getCurrentStatusDataCoap().then(data => {
    if (data != null) {
        console.log("pollAirCoapDevice: " + JSON.stringify(data));


        let json = data.status

            if (json != null) {

            
                if (json.hasOwnProperty('pwr')) {
                    console.log(`Power: ${json.pwr == '1' ? 'ON' : "OFF"}`)
                }
                if (json.hasOwnProperty('D03-02')) {
                    console.log(`Power: ${json["D03-02"]== 'ON' ? 'ON' : "OFF"}`)
                }
                if (json.hasOwnProperty("D03102")) {
                    console.log(`Power: ${json["D03102"]== 1 ? 'ON' : "OFF"}`)
                }
                
        
                if (json.hasOwnProperty('pm25')) {
                    console.log(`PM25: ${json.pm25}`);
                }
                
                if (json.hasOwnProperty('D03-33')) {
                    console.log(`PM25: ${json["D03-33"]}`);
                }
        
                if (json.hasOwnProperty('D03221')) {
                    console.log(`PM25: ${json["D03221"]}`);
                }
        
                if (json.hasOwnProperty('tvoc')) {
                    console.log(`GAS (TVOC): ${json.tvoc}`);
                }

                if (json.hasOwnProperty('D03122')) {
                    console.log(`GAS (TVOC): ${json["D03122"]}`);
                }

                if (json.hasOwnProperty('rh')) {
                    console.log(`Humidity: ${json.rh}`);
                }
                if (json.hasOwnProperty('D03125')) {
                    console.log(`Humidity: ${json["D03125"]}`);
                }
        
                if (json.hasOwnProperty('rhset')) {
                    console.log(`Target humidity: ${json.rhset}`);
                }

                if (json.hasOwnProperty('D03128')) {
                    console.log(`Target Humidity: ${json["D03128"]}`);
                }

                if (json.hasOwnProperty('iaql')) {
                    console.log(`Allergen index: ${json.iaql}`);
                }
                if (json.hasOwnProperty('D03-32')) {
                    console.log(`Allergen index: ${json["D03-32"]}`);
                }
                if (json.hasOwnProperty('D03120')) {
                    console.log(`Allergen index: ${json["D03120"]}`);
                }
                

                if (json.hasOwnProperty('temp')) {
                    console.log(`Temperature: ${json.temp}`);
                }
                if (json.hasOwnProperty('D03224')) {
                    console.log(`Temperature: ${json["D03224"]}`);
                }
                
        
                if (json.hasOwnProperty('func')) {
                    // P or PH
                    console.log(`Function: ${json.func == 'P' ? 'Purification' : "Purification & Humidification"}`)
                }
                if (json.hasOwnProperty('mode')) {
                    let mode_str = { 'P': 'auto', 'AG': 'auto', 'A': 'allergen', 'S': 'sleep', 'M': 'manual', 'B': 'bacteria', 'N': 'night' }
        
                    console.log(`Mode: ${mode_str[json.mode]}`)
                    if (json.mode == 'P' || json.mode == 'AG') {
                        console.log(`Fan speed: auto`);
                    } else {
                        if (json.hasOwnProperty('om')) {
                            let om_str = { '1': 'speed 1', '2': 'speed 2', '3': 'speed 3', 'P': 'AUTO', 'AG': 'AUTO', 's': 'silent', 't': 'turbo' }
                            console.log(`Fan speed: ${om_str[json.om]}`)
                        }
                    }
                }
                if (json.hasOwnProperty('D03-12')) {
                    let mode_str = { 'Auto General': 'AUTO', 'Gentle/Speed 1': '1','Speed 2': '2', 'Turbo': 't','Sleep': 's' }
                }            
        
                if (json.hasOwnProperty('aqil')) {
                    console.log(`Light brightness: ${json.aqil}`);
                }
                if (json.hasOwnProperty('D0312D')) {
                    console.log(`Light brightness: ${json["D0312D"]}`);
                }
                if (json.hasOwnProperty('uil')) {
                    let uil_str = { '1': 'ON', '0': 'OFF', '2': 'FIXED' };
                    console.log(`Buttons light: ${uil_str[json.uil]}`)
                }
                if (json.hasOwnProperty('D03-05')) {
                    let uil_str = { 100: '1', 0: '0' };
                    console.log(`Buttons light: ${uil_str[json["D03-05"]]}`)
                }
        
                if (json.hasOwnProperty('ddp')) {
                    let ddp_str = { '1': 'PM2.5', '0': 'IAI', '3': 'Humidity' };
                    console.log(`Used index: ${ddp_str[json.ddp]}`);
        
                }
                if (json.hasOwnProperty('D03-42')) {
                    let ddp_str = { 'PM2.5': '1', 'IAI': '0' };
                    console.log(`Used index: ${ddp_str[json["D03-42"]]}`);
        
                }
        
                if (json.hasOwnProperty('cl')) {
                    console.log(`Child lock: ${json.cl}`);
                }
        
                if (json.hasOwnProperty('D03103')) {
                    console.log(`Child lock: ${json["D03103"]}`);
                }
                
        
                if (json.hasOwnProperty('wl')) {
                    console.log(`Water level: ${json.wl}`);
                }
                if (json.hasOwnProperty('dt')) {
                    console.log(`Timer hours: ${json.dt}`);
                }
        
                
                if (json.hasOwnProperty('D03110')) {
                    console.log(`Timer hours: ${json["D03110"]}`);
        
                }
                if (json.hasOwnProperty('dtrs')) {
                    console.log(`Timer total minutes left: ${json.dtrs}`);
        
                }
                if (json.hasOwnProperty('err')) {
                    if (json.err != 0) {
                        let err_str = { 49408: 'no water', 32768: 'water tank open', 49153: "pre-filter must be cleaned", 49155: "pre-filter must be cleaned" };
                        console.log(`Error: ${err_str[json.err]}`);
                    } {
                        console.log(`Error: -`);
                    }
                }
        
                if (json.hasOwnProperty('D03240')) {
                    if (json["D03240"] != 0) {
                        let err_str = { 49408: 'no water', 32768: 'water tank open', 49153: "pre-filter must be cleaned", 49155: "pre-filter must be cleaned" };
                        console.log(`Error: ${err_str[json["D03240"]]}`);
                    } {
                        console.log(`Error: -`);
                    }
                }
        
                if (json.hasOwnProperty('modelid')) {
                    console.log(`Location: ${json.name} modelid ${json.modelid} `);
                }
                if (json.hasOwnProperty('D01-05')) {
                    console.log(`Location: ${json["D01-03"]} modelid ${json["D01-05"]} `);
                }
                if (json.hasOwnProperty("D01S05")) {
                    console.log(`Location: ${json["D01S03"]} modelid ${json["D01S05"]} `);
                }
        
        
                // if 'wicksts' in filters:
                // print('Wick filter: replace in {} hours'.format(filters['wicksts']))
                if (json.hasOwnProperty('fltsts0')) {
                    console.log(`Pre-filter: clean in ${json.fltsts0} hours`);
                }
                if (json.hasOwnProperty('D05-13')) {
                    console.log(`Pre-filter: clean in ${json["D05-13"]} hours`);
                }
        
                if (json.hasOwnProperty('D0520D')) {
                    console.log(`Pre-filter: clean in ${json["D0520D"]} hours`);
                }
        
                if (json.hasOwnProperty('fltsts2')) {
                    console.log(`Active Carbon ${json.fltt2} filter: replace in ${json.fltsts2} hours`)
                }
                if (json.hasOwnProperty('fltsts1')) {
                    console.log(`HEPA ${json.fltt1} filter: replace in ${json.fltsts1} hours`);
                }
                if (json.hasOwnProperty('D05-14')) {
                    console.log(`HEPA ${json['D05-14']} filter: replace in ${json['D05-14']} hours`);
                }
        
                if (json.hasOwnProperty('D05213')) {
                    console.log(`HEPA ${json['D05213']} filter: replace in ${json['D05213']} hours`);
                }                        
                
            }
    
        


    } else {
        console.log("pollAirCoapDevice went wrong");
    }
})    