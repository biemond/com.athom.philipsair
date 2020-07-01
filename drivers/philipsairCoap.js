(function () {

    var philipsairCoap = exports;

    const coap   = require("node-coap-client").CoapClient;
    const origin = require('node-coap-client/build/lib/Origin');
    const crypto = require('crypto');
    var aesjs = require('aes-js');
    var pkcs7 = require('pkcs7');
 
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
    
 


 

    // active functions()  -------------------------------------  active functions()  --------------------------------------------

 

    philipsairCoap.getCurrentStatusDataCoap = function getCurrentStatusDataCoap(settings) {
        console.log("node_modules settings " +  JSON.stringify(settings));
        
        return new Promise((resolve, reject) => {
            getCurrentDataCoap(settings, (error, jsonobj) => {
                if (jsonobj) {
                    resolve(jsonobj);
                } else {
                    reject(error);
                }
            });
        });
    }

    philipsairCoap.setValueAirDataCoap = function setValueAirDataCoap(value, settings) {
        console.log("value "+ value)
        console.log("node_modules settings " +  JSON.stringify(settings));
        
        return new Promise((resolve, reject) => {
            setValueDataCoap(value, settings, (error, jsonobj) => {
                if (jsonobj) {
                    resolve(jsonobj);
                } else {
                    reject(error);
                }
            });
        });
    }

    // sleep time expects milliseconds
    function sleep (time) {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    function getCurrentDataCoap(settings, callback) {
        console.log("getCurrentData " + settings.ipkey );
        var target = new origin.Origin('coap:', settings.ipkey, 5683);
        var targetString = 'coap://'+settings.ipkey+':5683';
            
        let jsonStatus = null;

        console.log('-------------------')
        coap.request(targetString+'/sys/dev/sync', 'post',
            Buffer.from(encodeCounter(statusCounter, 8 )), 
            {keepAlive: false}) 
        .then( response => {
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

        sleep(2000).then(() => {
            console.log('-------------------')
            coap.tryToConnect(target).then((result) => {
                console.log('tryToConnect ' + result);
            }).catch( err => {
                console.log(err);
            });
        });

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
                    jsonStatus = clean(dataText);
                    console.log(jsonStatus);
                    coap.stopObserving('coap://'+settings.ipkey+':5683/sys/dev/status')        

                }
            }, undefined, {
                    confirmable: false, // we expect no answer here in the typical coap way.
                    retransmit: false
                }
            ).then(() => {
                // TODO: nothing?
            }).catch(reason => console.log(reason));
        });

        sleep(5000).then(() => {
            console.log('-------------------');    
            coap.reset(target);
            console.log('-------------------');
        });

        setTimeout(function(){ 
            var response = {
                status: jsonStatus.state.reported
            };
            return callback(null, response); 
        }, 6000)
    }

    function setValueDataCoap(value, settings, callback) {
        console.log("setValueData " + settings.ipkey );
    }
})();