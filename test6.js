const https = require('http')
var aesjs = require('aes-js');
var bigInt = require("big-integer");
var pkcs7 = require('pkcs7');


let a = bigInt('35315308132206205938053219356172167184243234521329128101814628093311586402304');
let G = bigInt('A4D1CBD5C3FD34126765A442EFB99905F8104DD258AC507FD6406CFF14266D31266FEA1E5C41564B777E690F5504F213160217B4B01B886A5E91547F9E2749F4D7FBD7D3B9A92EE1909D0D2263F80A76A6A24C087A091F531DBF0A0169B6A28AD662A4D18E73AFA32D779D5918D08BC8858F4DCEF97C2A24855E6EEB22B3B2E5', 16)
let P = bigInt('B10B8F96A080E01DDE92DE5EAE5D54EC52C99FBCFB06A3C69A6A9DCA52D23B616073E28675A23D189838EF1E2EE652C013ECB4AEA906112324975C3CD49B83BFACCBDD7D90C4BD7098488E9C219A73724EFFD6FAE5644738FAA31A4FF55BCCC0A151AF5F0DC8B4BD45BF37DF365C1A65E68CFDA76D4DA708DF1FB2BC2E4A4371', 16)
 
var sharedSecretText
var hostname = '192.168.2.195';

console.log('-------------------')
let A = G.modPow(a,P)
let objA = { "diffie":A.toString(16)}
let json = JSON.stringify(objA);
console.log(json)

// -------------------
//{"diffie":"328871e20be6b47a63f67a02ea168ced5885fa3eaee5ba19b96296ed1e542752f852a3d7c2df67ea7233a675e67a4ecf26c3e09e513950c4ec12b82385ed465b4e9d101eb21b5d3948850894d88ef33f4a550a27a5d552d11dfb4608dd5c7b853ed5c392d06cb510f8ea672c781edb3502d4b17b721a80f9be116c1a939d78cf"}

let key_128 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const iv = new Uint8Array(key_128);

var optionsPut
var dataBytesEncrypted

function aes_decrypt2(data, key) {
    var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
    var decryptedBytes = aesCbc.decrypt(data);
    return decryptedBytes;
}

function aes_encrypt2(data, key) {
    var segmentSize = 16;
    var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
    var encryptedBytes = aesCbc.encrypt(data); 
    return Buffer(encryptedBytes).toString('base64');
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
        uil_str = {'1': 'ON', '0': 'OFF'}
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
}    

const options = {
    protocol: 'http:',
    path: '/di/v1/products/0/security',
    method: 'PUT',
    headers: {
    'Content-Type': 'application/json',
    'Content-Length': json.length
    }
}
options.hostname = hostname;

const req = https.request(options, res => {
    console.log("exchange keys");    
    console.log('-------------------')    
    console.log(`statusCode: ${res.statusCode}`)
  
    res.on('data', d => {
        respJson = JSON.parse(d.toString());
        let key = respJson.key
        console.log("key: " + key)
        console.log("hellman: " + respJson.hellman)

        let hellman = bigInt(respJson.hellman, 16)
        let secret = hellman.modPow(a,P)
        // let secret = bigintCryptoUtils.modPow(hellman,a,P)  

        let sharedSecret = aes_decrypt2(Buffer.from(key,'hex'), Buffer.from(secret.toString(16), 'hex').slice(0,16));
        sharedSecret = sharedSecret.slice(0,16);
        sharedSecretText = aesjs.utils.hex.fromBytes(sharedSecret);
        console.log("sharedSecret: " + sharedSecretText); 
        console.log('-------------------')

        // let values = { "aqil": 50}
        // let values = { "mode": "P"} 
        // let values = { "uil": '1'}   
        // let values = { "ddp": '0'}  
        // let values = { "om": 's'}  
        let values = { "cl": false} 
        // let values = { "dt": '1'}

        let jsonValues = 'AA' + JSON.stringify(values);
        console.log(jsonValues); 
        let dataBytes = pkcs7.pad(aesjs.utils.utf8.toBytes(jsonValues));
        console.log(dataBytes); 
        dataBytesEncrypted = aes_encrypt2(dataBytes, Buffer.from(sharedSecretText, 'hex'));
        console.log(dataBytesEncrypted);

        optionsPut = {
            protocol: 'http:',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': dataBytesEncrypted.length
            }
        }
        optionsPut.hostname = hostname;
        optionsPut.path = '/di/v1/products/1/air';

        const req1 = https.request(optionsPut, res1 => {
            console.log("put Values");    
            console.log('-------------------')
            console.log(`statusCode: ${res1.statusCode}`)
            res1.on('data', dd => {
                if (res1.statusCode == 200 ){
                // console.log(dd.toString('ascii'));
                var resp = dd.toString('ascii');
                let payload = new Buffer.from(resp, 'base64');
                let data = aes_decrypt2(payload,Buffer.from(sharedSecretText, 'hex'));
                let dataText = aesjs.utils.utf8.fromBytes(data.slice(2));
                let json = clean(dataText);
                // processStatus(json)
                console.log(json); 
                }
                console.log('-------------------')
            })
        })  
        
        req1.on('error', error => {
            console.error(error)
        })
        req1.write(dataBytesEncrypted)
        req1.end()
        


    })
})
  
req.on('error', error => {
    console.error(error)
})
  
req.write(json)
req.end()



const optionsGet = {
    protocol: 'http:',
    method: 'GET',
    headers: {
    }
}
optionsGet.hostname = hostname;
optionsGet.path = '/di/v1/products/1/air';


const req2 = https.request(optionsGet, res2 => {
    console.log("get Status");    
    console.log('-------------------')
    // console.log(`statusCode: ${res2.statusCode}`)
    res2.on('data', dd => {
        // console.log(dd.toString('ascii'));
        var resp = dd.toString('ascii');
        let payload = new Buffer.from(resp, 'base64');
        let data = aes_decrypt2(payload,Buffer.from(sharedSecretText, 'hex'));
        let dataText = aesjs.utils.utf8.fromBytes(data.slice(2));
        let json = clean(dataText);
        processStatus(json)
        // console.log(json); 
        console.log('-------------------')
    })
})  

req2.on('error', error => {
    console.error(error)
})
req2.end()


optionsGet.path = '/di/v1/products/0/firmware';

const req3 = https.request(optionsGet, res3 => {
    console.log("get firmware");    
    console.log('-------------------')
    // console.log(`statusCode: ${res3.statusCode}`)
    res3.on('data', dd => {
        var resp = dd.toString('ascii');
        let payload = new Buffer.from(resp, 'base64');
        let data = aes_decrypt2(payload,Buffer.from(sharedSecretText, 'hex'));
        let dataText = aesjs.utils.utf8.fromBytes(data.slice(2));
        let json = clean(dataText);
        // console.log(json); 
        console.log(`Product: ${json.name} version ${json.version} upgrade ${json.upgrade != '' ? json.upgrade  : "-"} status ${json.statusmsg != '' ? json.statusmsg  : "-"}`)
        console.log('-------------------')
    })
})  

req3.on('error', error => {
    console.error(error)
})
req3.end()


optionsGet.path = '/di/v1/products/1/fltsts';

const req4 = https.request(optionsGet, req4 => {
    console.log("get filters");    
    console.log('-------------------')
    // console.log(`statusCode: ${req4.statusCode}`)
    req4.on('data', dd => {
        var resp = dd.toString('ascii');
        let payload = new Buffer.from(resp, 'base64');
        let data = aes_decrypt2(payload,Buffer.from(sharedSecretText, 'hex'));
        let dataText = aesjs.utils.utf8.fromBytes(data.slice(2));
        let json = clean(dataText);
        // console.log(json); 
        console.log(`Pre-filter: clean in ${json.fltsts0} hours`)
        console.log(`Active Carbon ${json.fltt2} filter: replace in ${json.fltsts2} hours`)
        console.log(`HEPA ${json.fltt1} filter: replace in ${json.fltsts1} hours`)
        console.log('-------------------')
    })
})  

req4.on('error', error => {
    console.error(error)
})
req4.end()