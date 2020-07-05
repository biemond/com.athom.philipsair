const coap   = require("node-coap-client").CoapClient;
const origin = require('node-coap-client/build/lib/Origin');
const crypto = require('crypto');
var aesjs = require('aes-js');
var pkcs7 = require('pkcs7');


var target = new origin.Origin('coap:', '192.168.107.196', 5683);
var targetString = 'coap://192.168.107.196:5683';
var sharedKey = 'JiangPan';

var statusCounter = 0;
var controlCounter= 0;

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
    data = data.replace(/[\u0000-\u0019]+/g,""); 
    return JSON.parse(data);
} 

function processStatus(json) {
    if(json.hasOwnProperty('pwr')){
        console.log(`Power: ${json.pwr == '1' ? 'ON'  : "OFF"}`)
    }
    if(json.hasOwnProperty('pm25')){
        console.log(`PM25: ${json.pm25}`)
    }
    if(json.hasOwnProperty('tvoc')){
        console.log(`GAS (TVOC): ${json.tvoc}`)
    }
    if(json.hasOwnProperty('rhset')){
        console.log(`Target humidity: ${json.rhset}`)
    }     
    if(json.hasOwnProperty('iaql')){
        console.log(`Allergen index: ${json.iaql}`)
    } 
    if(json.hasOwnProperty('temp')){
        console.log(`Temperature: ${json.temp}`)
    } 
    if(json.hasOwnProperty('func')){
        console.log(`Function: ${json.pwr == 'P' ? 'Purification'  : "Purification & Humidification"}`)
    } 
    if(json.hasOwnProperty('mode')){
        let mode_str = {'P': 'auto', 'A': 'allergen', 'S': 'sleep', 'M': 'manual', 'B': 'bacteria', 'N': 'night'}
        console.log(`Mode: ${mode_str[json.mode]}`)
    } 
    if(json.hasOwnProperty('om')){
        om_str = {'s': 'silent', 't': 'turbo'}
        console.log(`Fan speed: ${om_str[json.om]}`)
    } 
    if(json.hasOwnProperty('aqil')){
        console.log(`Light brightness: ${json.aqil}`)
    } 
    if(json.hasOwnProperty('uil')){
        uil_str = {'1': 'ON', '0': 'OFF', '2': 'Fixed'}
        console.log(`Buttons light: ${uil_str[json.uil]}`)
    } 
    if(json.hasOwnProperty('ddp')){
        ddp_str = {'1': 'PM2.5', '0': 'IAI'}
        console.log(`Used index: ${ddp_str[json.ddp]}`)
    } 
    if(json.hasOwnProperty('wl')){
        console.log(`Water level: ${json.wl}`)
    } 
    if(json.hasOwnProperty('cl')){
        console.log(`Child lock: ${json.cl}`)
    }     
    if(json.hasOwnProperty('dt')){
        console.log(`Timer hours: ${json.dt}`)
    } 
    if(json.hasOwnProperty('dtrs')){
        console.log(`Timer minutes: ${json.dtrs}`)
    }  
    if(json.hasOwnProperty('err')){
        if ( json.err != 0) {
            err_str = {49408: 'no water', 32768: 'water tank open'}
            console.log(`Error: ${ddp_str[json.err]}`)
        } {
            console.log(`Error: -`)
        }
    } 
    if(json.hasOwnProperty('name')){
        console.log(`Name: ${json.name}`)
    }  
    if(json.hasOwnProperty('modelid')){
        console.log(`Product: ${json.modelid}`)
    }  
    if(json.hasOwnProperty('swversion')){
        console.log(`version: ${json.swversion}`)
    }  
    if(json.hasOwnProperty('fltsts0')){
        console.log(`Pre-filter: clean in ${json.fltsts0} hours`)
    }  
    if(json.hasOwnProperty('fltsts2')){
        console.log(`Active Carbon ${json.fltt2} filter: replace in ${json.fltsts2} hours`)
    }  
    if(json.hasOwnProperty('fltsts1')){
        console.log(`HEPA ${json.fltt1} filter: replace in ${json.fltsts1} hours`)
    }     
}    

// sleep time expects milliseconds
function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

console.log('-------------------')
// coap.ping(target, 2000)
// .then((success) => { 
//     console.log('ping ' + success);
// });

// sleep(2500).then(() => {
    console.log('-------------------')
    coap.request(targetString+'/sys/dev/sync', 'post',
        Buffer.from(encodeCounter(statusCounter, 8 )), 
        {keepAlive: false}) 
    .then( response => {
        // console.log(response);
        if (response.payload) {
            const payload = response.payload.toString('utf-8');
            controlCounter = decodeCounter(payload);
            console.log(controlCounter);
        } else {
            throw new Error('No response received for sync call. Cannot proceed');
        }            
    }).catch( err => {
        console.log(err);
    });
// });

sleep(2000).then(() => {
    console.log('-------------------')
    coap.tryToConnect(target).then((result) => {
        console.log('tryToConnect ' + result);
    }).catch( err => {
        console.log(err);
    });
});

// sleep(4000).then(() => {
//     console.log('-------------------')
//     // coap.tryToConnect(target).then((result) => {
//     //     console.log('tryToConnect ' + result);
//         coap.request(targetString+'/sys/dev/info', 'get',null, options) 
//         .then( response => {
//             if (response.payload) {
//                 // console.log(response.payload);
//                 const response2 = response.payload.toString('utf-8');
//                 console.log(response2);
//             }
//         }).catch( err => {
//             console.log(err);
//         });         
//     // }).catch( err => {
//     //     console.log(err);
//     // });
// });

sleep(3000).then(() => {
    console.log('-------------------')
    coap.observe(targetString+'/sys/dev/status', 'get', resp => {
        if (resp.payload) {
            const response = resp.payload.toString('utf-8');
            const encodedCounter = response.substring(0, 8);
            let counter = decodeCounter(encodedCounter);
            console.log("counter " +counter);
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
            console.log("keyAndIv "+keyAndIv);
            const secretKey = keyAndIv.substring(0, keyAndIv.length / 2);
            console.log("secret "+secretKey);
            const iv = keyAndIv.substring(keyAndIv.length / 2, keyAndIv.length);
            console.log("iv "+iv);

            const encodedMessage = response.substring(8, response.length - 64);

            let payload = new Buffer.from(encodedMessage, 'hex');
            let data = aes_decrypt2(payload, Buffer.from(secretKey,'utf-8') , Buffer.from(iv,'utf-8'));
            let dataText = aesjs.utils.utf8.fromBytes(data);
            let json = clean(dataText);
            console.log(json);
            processStatus(json.state.reported);
            coap.stopObserving('coap://192.168.107.196:5683/sys/dev/status')        

        }
    }, undefined, {
            confirmable: false, // we expect no answer here in the typical coap way.
            retransmit: false
        }
    ).then(() => {
        // TODO: nothing?
    }).catch(reason => console.log(reason));
});

// sleep(14000).then(() => {
//     console.log('-------------------')
//     coap.stopObserving('coap://192.168.2.196:5683/sys/dev/status')
// });




sleep(6000).then(() => {
    console.log('-------------------') 

    key = 'uil'
    value = '1'  

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
    console.log('messageString '+messageString);

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
    const encodedMessage = Buffer.from(aes_encrypt2(dataBytes, Buffer.from(secretKey,'utf-8'), Buffer.from(iv,'utf-8'))).toString('hex').toUpperCase();
    // console.log('encodedMessage '+encodedMessage);
    let result = encodedCounter + encodedMessage;

    const hash = Buffer.from(toSha256(result)).toString('hex').toUpperCase();

    result = encodedCounter + encodedMessage + hash;
 
    coap.request(targetString+'/sys/dev/control', 'post',
        Buffer.from(result), {keepAlive: false})
        .then( response => {
            // console.log(response);
            if (response.payload) {
                const payload = response.payload.toString('utf-8');
                console.log(payload);
            } else {
                throw new Error('No response received for call. Cannot proceed');
            }
        }).catch( err => {
            console.log(err);
        });         
    console.log('-------------------');
});

sleep(10000).then(() => {
    console.log('-------------------');    
    coap.reset(target);
    console.log('-------------------');
});