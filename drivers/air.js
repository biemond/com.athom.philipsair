import Homey from 'homey';

const philipsair = require('./philipsair.js');
const philipsairCoap = require('./philipsairCoap.js');

const MINUTE = 60000;
let coap;
let timeoutId;


Date.prototype.timeNow = function () {
    return ((this.getHours() < 10) ? "0" : "") + ((this.getHours() > 12) ? (this.getHours() - 12) : this.getHours()) + ":" + ((this.getMinutes() < 10) ? "0" : "") + this.getMinutes() + " " + ((this.getHours() > 12) ? ('PM') : 'AM');
};

export class AirDevice extends Homey.Device {


    setClient(client) {
        this.coap = client;
    }

    getClient() {
        return this.coap;
    }

    setTimeoutId(timeoutId) {
        this.timeoutId = timeoutId;
    }

    getTimeoutId() {
        return this.timeoutId;
    }

    // flow triggers
    flowTriggerFilterReplaceClean(tokens, state) {
        this.log("trigger fired");
        this.homey.flow.getDeviceTriggerCard('filter_replace_clean').trigger(this, tokens, state)
            .then(this.log("flowTriggerFilterReplaceClean"))
            .catch(this.error)
        return this;
    }

    setState(value, settings) {
        this.log('setState:', value);
        //   let settings = this.getSettings();
        this.log(settings);

        let deviceSecret = this.getStoreValue('secretKey' + settings.id);
        // this.log(this);
        this.log(deviceSecret);
        settings.secretkey = deviceSecret;
        this.log(settings)

        philipsair.setValueAirData(value, settings).then(data => {
            this.log("-setValueAirData-begin-");
            this.log(data);
            this.handleDeviceStatus(data);
            this.log("-setValueAirData-end-");
            return value
        })
    }

    async setStateCoap(key, value, settings) {
        this.log('setStateCoap: ' + key + ":" + value);
        this.log(settings);
        philipsairCoap.setValueAirDataCoap(key, value, settings, this).then(data => {
            this.log("-setValueCoapAirData-begin-");
            this.log(data);
            this.log("-setValueCoapAirData-end-");
            return value
        })
    }

    observerAirCoapDevice() {
        this.log("observerAirCoapDevice");
        let settings = this.getSettings();
        this.log(settings);
        this.log("getCurrentStatusDataCoap");
        philipsairCoap.getCurrentStatusDataCoap(settings, this).then(data => {
            this.log("observerAirCoapDevice timeout");
            this.observerAirCoapDevice();
        }).catch(function (error) {
            console.log(error);
            this.observerAirCoapDevice();
        });
    }

    conditionScoreIaqlToString(index) {
        if (index > 9) {
            return 'verypoor';
        } else if (index > 6) {
            return 'poor';
        } else if (index > 3) {
            return 'fair';
        } else {
            return 'good';
        }
    }

    conditionScorePm25lToString(index) {
        if (index > 55) {
            return 'verypoor';
        } else if (index > 35) {
            return 'poor';
        } else if (index > 12) {
            return 'fair';
        } else {
            return 'good';
        }
    }



    handleDeviceStatus(json, settings) {
        if (json != null) {
            let currentdate = new Date().timeNow();
            this.log("refresh now " + currentdate);
            this.setCapabilityValue('latest_retrieval_date', currentdate);

            if (json.hasOwnProperty('pwr')) {
                if (json.pwr == '1') {
                    this.setCapabilityValue('onoff', true);
                } else {
                    this.setCapabilityValue('onoff', false);
                }
                this.log(`Power: ${json.pwr == '1' ? 'ON' : "OFF"}`)
            }
            if (json.hasOwnProperty('D03-02')) {
                if (json["D03-02"] == 'ON') {
                    this.setCapabilityValue('onoff', true);
                } else {
                    this.setCapabilityValue('onoff', false);
                }
                this.log(`Power: ${json["D03-02"] == 'ON' ? 'ON' : "OFF"}`)
            }
            if (json.hasOwnProperty("D03102")) {
                if (json["D03102"] == 1) {
                    this.setCapabilityValue('onoff', true);
                } else {
                    this.setCapabilityValue('onoff', false);
                }
                this.log(`Power: ${json["D03102"] == 1 ? 'ON' : "OFF"}`)
            }


            if (json.hasOwnProperty('pm25')) {
                this.log(`PM25: ${json.pm25}`);
                this.setCapabilityValue('measure_pm25', json.pm25);
            }

            if (json.hasOwnProperty('D03-33')) {
                this.log(`PM25: ${json["D03-33"]}`);
                this.setCapabilityValue('measure_pm25', json["D03-33"]);
            }

            if (json.hasOwnProperty('D03221')) {
                this.log(`PM25: ${json["D03221"]}`);
                this.setCapabilityValue('measure_pm25', json["D03221"]);
            }


            if (json.hasOwnProperty('tvoc')) {
                this.log(`GAS (TVOC): ${json.tvoc}`);
                this.setCapabilityValue('measure_tvoc', json.tvoc);
            }

            if (json.hasOwnProperty('D03122')) {
                this.log(`GAS (TVOC): ${json["D03122"]}`);
                this.setCapabilityValue('measure_tvoc', json["D03122"]);
            }


            if (json.hasOwnProperty('rh')) {
                this.log(`Humidity: ${json.rh}`);
                if (this.hasCapability('measure_humidity')) {
                    this.setCapabilityValue('measure_humidity', json.rh);
                }
            }
            if (json.hasOwnProperty('D03125')) {
                this.log(`Humidity: ${json["D03125"]}`);
                if (this.hasCapability('measure_humidity')) {
                    this.setCapabilityValue('measure_humidity', json["D03125"]);
                }
            }

            if (json.hasOwnProperty('D03130')) {
                this.log(`beep: ${json["D03130"]}`);
                if (this.hasCapability('beep')) {
                    if (json["D03130"] == 100) {
                        this.setCapabilityValue('beep', true);
                    } else {
                        this.setCapabilityValue('beep', false);
                    }
                }
            }


            if (json.hasOwnProperty('D0310C')) {

                this.log(`heating: ${json["D0310C"]}`);
                let value = json["D0310C"];
                if (this.hasCapability('heater_mode')) {
                    if (value == 0) {
                        this.setCapabilityValue('heater_mode', "AUTO");
                    }
                    if (value == 65) {
                        this.setCapabilityValue('heater_mode', "HIGH");
                    }
                    if (value == 66) {
                        this.setCapabilityValue('heater_mode', "LOW");
                    }
                    if (value == -127) {
                        this.setCapabilityValue('heater_mode', "VENTILATION");
                    }
                }
                if (this.hasCapability('heater_speed')) {
                    if (value == 65) {
                        this.setCapabilityValue('heater_speed', "HIGH");
                    }
                    if (value == 66) {
                        this.setCapabilityValue('heater_speed', "LOW");
                    }
                }
            }

            if (json.hasOwnProperty('D0320F')) {
                this.log(`swing: ${json["D0320F"]}`);
                if (this.hasCapability('swing')) {
                    this.setCapabilityValue('swing', json["D0320F"].toString());
                }
            }

            if (json.hasOwnProperty('rhset')) {
                this.log(`Target humidity: ${json.rhset}`);
                if (this.hasCapability('target_humidity')) {
                    this.setCapabilityValue('target_humidity', json.rhset.toString());
                }
            }

            if (json.hasOwnProperty('D03128')) {
                this.log(`Target humidity: ${json["D03128"]}`);
                if (this.hasCapability('target_humidity')) {
                    this.setCapabilityValue('target_humidity', json["D03128"].toString());
                }
            }


            if (json.hasOwnProperty('D0310E')) {
                this.log(`Target temperature: ${json["D0310E"]}`);
                if (this.hasCapability('target_temperature')) {
                    this.setCapabilityValue('target_temperature', json["D0310E"]);
                }
            }

            if (json.hasOwnProperty('iaql')) {
                this.log(`Allergen index: ${json.iaql}`);
                this.setCapabilityValue('measure_iaql', json.iaql);
            }
            if (json.hasOwnProperty('D03-32')) {
                this.log(`Allergen index: ${json["D03-32"]}`);
                this.setCapabilityValue('measure_iaql', json["D03-32"]);
            }
            if (json.hasOwnProperty('D03120')) {
                this.log(`Allergen index: ${json["D03120"]}`);
                this.setCapabilityValue('measure_iaql', json["D03120"]);
            }


            if (json.hasOwnProperty('temp')) {
                this.log(`Temperature: ${json.temp}`);
                if (this.hasCapability('measure_temperature')) {
                    this.setCapabilityValue('measure_temperature', json.temp);
                }
            }
            if (json.hasOwnProperty('D03224')) {
                this.log(`Temperature: ${json["D03224"]}`);
                if (this.hasCapability('measure_temperature')) {
                    this.setCapabilityValue('measure_temperature', json["D03224"] / 10);
                }
            }


            if (json.hasOwnProperty('func')) {
                // P or PH
                this.log(`Function: ${json.func == 'P' ? 'Purification' : "Purification & Humidification"}`)
                if (this.hasCapability('func_mode')) {
                    if (json.func == 'P') {
                        this.setCapabilityValue('func_mode', false);
                    } else {
                        this.setCapabilityValue('func_mode', true);
                    }
                }
            }

            try {

                if (json.hasOwnProperty('mode')) {
                    let mode_str = { 'P': 'auto', 'AG': 'auto', 'A': 'allergen', 'S': 'sleep', 'AS': 'sleep allergy', 'M': 'manual', 'B': 'bacteria', 'N': 'night' }
                    this.setCapabilityValue('purifier_mode', json.mode);

                    this.log(`Mode: ${mode_str[json.mode]}`)
                    if (json.mode == 'P' || json.mode == 'AG') {
                        this.setCapabilityValue('fan_speed', 'AUTO');
                        this.log(`Fan speed: auto`);
                    } else {
                        if (json.hasOwnProperty('om')) {
                            let om_str = { '1': 'speed 1', '2': 'speed 2', '3': 'speed 3', 'P': 'AUTO', 'AG': 'AUTO', 'as': 'sleep allergy', 's': 'silent/sleep', 't': 'turbo' }
                            this.log(`Fan speed: ${om_str[json.om]}`)
                            this.setCapabilityValue('fan_speed', json.om);
                        }
                    }
                }
                if (json.hasOwnProperty('D03-12')) {
                    let mode_str = { 'Auto General': 'AUTO', 'Gentle/Speed 1': '1', 'Speed 2': '2', 'Turbo': 't', 'Sleep': 's' }
                    let fan = mode_str[json["D03-12"]];
                    this.log(`Fan speed: ${fan} - ${json["D03-12"]}`)
                    if (fan) {
                        this.setCapabilityValue('fan_speed', fan);
                    }
                }


                if (json.hasOwnProperty('D0310C')) {
                    if (this.hasCapabilityValue('fan_speed')) {
                        let mode_str = { '0': 'AUTO', '1': '1', '2': '2', '18': 't', '17': 's', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10' }
                        let fan = mode_str[json["D0310C"]];
                        this.log(`Fan speed: ${fan} - ${json["D0310C"]}`)
                        if (fan) {
                            this.setCapabilityValue('fan_speed', fan);
                        }
                    }
                }
            }
            catch (error) {
                this.log('fan_speed error');
            }



            if (json.hasOwnProperty('aqil')) {
                this.log(`Light brightness: ${json.aqil}`);
                this.setCapabilityValue('light_intensity', parseInt(json.aqil));
            }
            if (json.hasOwnProperty('D03105')) {
                this.log(`Light brightness: ${json["D03105"]}`);
                this.setCapabilityValue('light_intensity', parseInt(json["D03105"]));
            }



            if (json.hasOwnProperty('uil')) {
                let uil_str = { '1': 'ON', '0': 'OFF', '2': 'FIXED' };
                this.setCapabilityValue('button_lights', json.uil.toString());
                this.log(`Buttons light: ${uil_str[json.uil]}`)
            }
            if (json.hasOwnProperty('D03-05')) {
                if (json["D03-05"] == 100) {
                    this.setCapabilityValue('button_lights', '1');
                    this.log(`Buttons light: 1`)
                } else {
                    this.setCapabilityValue('button_lights', '0');
                    this.log(`Buttons light: 0`)
                }
            }

            if (json.hasOwnProperty('ddp')) {
                let ddp_str = { '1': 'PM2.5', '0': 'IAI', '3': 'Humidity' };
                this.log(`Used index: ${ddp_str[json.ddp]}`);
                if (this.hasCapability('display_mode')) {
                    this.setCapabilityValue('display_mode', json.ddp);
                }
                if (this.hasCapability('display_mode_ph')) {
                    this.setCapabilityValue('display_mode_ph', json.ddp);
                }
            }
            if (json.hasOwnProperty('D03-42')) {
                let ddp_str = { 'PM2.5': '1', 'IAI': '0' };
                this.log(`Used index: ${ddp_str[json["D03-42"]]}`);
                if (this.hasCapability('display_mode')) {
                    this.setCapabilityValue('display_mode', ddp_str[json["D03-42"]]);
                }
            }
            if (json.hasOwnProperty('D0312A')) {
                this.log(`Display: ${json["D0312A"]}`);
                if (this.hasCapability('display_mode')) {
                    if (json["D0312A"] == 0 || json["D0312A"] == 1 || json["D0312A"] == 2 || json["D0312A"] == 3) {
                        this.setCapabilityValue('display_mode', json["D0312A"].toString());
                    }
                }
                if (this.hasCapability('display_mode_ph')) {
                    if (json["D0312A"] == 0 || json["D0312A"] == 1 || json["D0312A"] == 2 || json["D0312A"] == 3 || json["D0312A"] == 6) {
                        this.setCapabilityValue('display_mode_ph', json["D0312A"].toString());
                    }
                }
            }

            if (json.hasOwnProperty('cl')) {
                this.log(`Child lock: ${json.cl}`);
                this.setCapabilityValue('child_lock', json.cl);
            }

            if (json.hasOwnProperty('D03103')) {
                this.log(`Child lock: ${json["D03103"]}`);
                if (json["D03103"] == 1) {
                    this.setCapabilityValue('child_lock', true);
                } else {
                    this.setCapabilityValue('child_lock', false);
                }
            }


            if (json.hasOwnProperty('wl')) {
                this.log(`Water level: ${json.wl}`);
                if (this.hasCapability('water_level')) {
                    if (json.wl == 100) {
                        this.setCapabilityValue('water_level', "Ok");
                    } else {
                        this.setCapabilityValue('water_level', "Empty");
                    }
                }
            }
            if (json.hasOwnProperty('dt')) {
                this.log(`Timer hours: ${json.dt}`);
                if (this.hasCapability('timer')) {
                    this.setCapabilityValue('timer', json.dt.toString());
                }
            }


            if (json.hasOwnProperty('D03110')) {
                this.log(`Timer hours: ${json["D03110"]}`);
                if (this.hasCapability('timer')) {
                    this.setCapabilityValue('timer', json["D03110"].toString());
                }
            }
            if (json.hasOwnProperty('dtrs')) {
                this.log(`Timer total minutes left: ${json.dtrs}`);
                if (this.hasCapability('timer_remaining')) {
                    this.setCapabilityValue('timer_remaining', json.dtrs);
                }
            }

            try {

                if (json.hasOwnProperty('err')) {
                    if (json.err != 0) {
                        let err_str = { 49408: 'no water', 32768: 'water tank open', 49153: "pre-filter must be cleaned", 49155: "pre-filter must be cleaned" };
                        this.log(`Error: ${err_str[json.err]}`);
                    } {
                        this.log(`Error: -`);
                    }
                }

                if (json.hasOwnProperty('D03240')) {
                    if (json["D03240"] != 0) {
                        let err_str = { 49408: 'no water', 32768: 'water tank open', 49153: "pre-filter must be cleaned", 49155: "pre-filter must be cleaned" };
                        this.log(`Error: ${err_str[json["D03240"]]}`);

                        if (this.hasCapability('water_level')) {
                            if (json["D03240"] == 49408) {
                                this.setCapabilityValue('water_level', "Empty");
                            }
                        }
                        let errorValue = err_str[json["D03240"]];
                        if (errorValue) {
                            if (this.hasCapability('error')) {
                                this.setCapabilityValue('error', errorValue);
                            }
                        }
                    } else {
                        this.log(`Error: -`);
                        if (this.hasCapability('water_level')) {
                            if (json["D03240"] != 49408) {
                                this.setCapabilityValue('water_level', "Ok");
                            }
                        }
                        if (this.hasCapability('error')) {
                            this.setCapabilityValue('error', "-");
                        }
                    }
                }
            }
            catch (error) {
                this.log('error cap error');
            }
            if (json.hasOwnProperty('modelid')) {
                this.log(`Location: ${json.name} modelid ${json.modelid} `);
                this.setCapabilityValue('product', `${json.modelid}`);
            }
            if (json.hasOwnProperty('D01-05')) {
                this.log(`Location: ${json["D01-03"]} modelid ${json["D01-05"]} `);
                this.setCapabilityValue('product', `${json["D01-05"]}`);
            }
            if (json.hasOwnProperty("D01S05")) {
                this.log(`Location: ${json["D01S03"]} modelid ${json["D01S05"]} `);
                this.setCapabilityValue('product', `${json["D01S05"]}`);
            }


            // if 'wicksts' in filters:
            // print('Wick filter: replace in {} hours'.format(filters['wicksts']))
            if (json.hasOwnProperty('fltsts0')) {
                this.log(`Pre-filter: clean in ${json.fltsts0} hours`);
                this.setCapabilityValue('pre_filter_clean', json.fltsts0);
                let tokens = {
                    "hours": json.fltsts0,
                    "filter": "pre_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "pre_filter"
                };

                this.log("preFilterTriggered: " + this.preFilterTriggered)
                if (this.preFilterTriggered == false) {
                    this.log("is preFilterTriggered ");
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.preFilterTriggered = true;
                    setTimeout(() => {
                        this.preFilterTriggered = false;
                    }, 60 * MINUTE);
                }

            }
            if (json.hasOwnProperty('D05-13')) {
                this.log(`Pre-filter: clean in ${json["D05-13"]} hours`);
                this.setCapabilityValue('pre_filter_clean', json["D05-13"]);
                let tokens = {
                    "hours": json["D05-13"],
                    "filter": "pre_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "pre_filter"
                };

                this.log("preFilterTriggered: " + this.preFilterTriggered)
                if (this.preFilterTriggered == false) {
                    this.log("is preFilterTriggered ");
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.preFilterTriggered = true;
                    setTimeout(() => {
                        this.preFilterTriggered = false;
                    }, 60 * MINUTE);
                }

            }

            if (json.hasOwnProperty('D0520D')) {
                this.log(`Pre-filter: clean in ${json["D0520D"]} hours`);
                this.setCapabilityValue('pre_filter_clean', json["D0520D"]);
                let tokens = {
                    "hours": json["D0520D"],
                    "filter": "pre_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "pre_filter"
                };

                this.log("preFilterTriggered: " + this.preFilterTriggered)
                if (this.preFilterTriggered == false) {
                    this.log("is preFilterTriggered ");
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.preFilterTriggered = true;
                    setTimeout(() => {
                        this.preFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }

            if (json.hasOwnProperty('fltsts2')) {
                this.log(`Active Carbon ${json.fltt2} filter: replace in ${json.fltsts2} hours`)
                this.setCapabilityValue('carbon_filter_replace', json.fltsts2);
                let tokens = {
                    "hours": json.fltsts2,
                    "filter": "carbon_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "carbon_filter"
                };

                if (this.carbonFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.carbonFilterTriggered = true;
                    setTimeout(() => {
                        this.carbonFilterTriggered = false;
                    }, 60 * MINUTE);
                }

            }
            if (json.hasOwnProperty('fltsts1')) {
                this.log(`HEPA ${json.fltt1} filter: replace in ${json.fltsts1} hours`);
                this.setCapabilityValue('hepa_filter_replace', json.fltsts1);
                let tokens = {
                    "hours": json.fltsts1,
                    "filter": "hepa_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "hepa_filter"
                };

                if (this.hepaFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.hepaFilterTriggered = true;
                    setTimeout(() => {
                        this.hepaFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }
            if (json.hasOwnProperty('D05-14')) {
                this.log(`HEPA ${json['D05-14']} filter: replace in ${json['D05-14']} hours`);
                this.setCapabilityValue('hepa_filter_replace', json['D05-14']);
                let tokens = {
                    "hours": json['D05-14'],
                    "filter": "hepa_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "hepa_filter"
                };

                if (this.hepaFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.hepaFilterTriggered = true;
                    setTimeout(() => {
                        this.hepaFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }

            if (json.hasOwnProperty('D05213')) {
                this.log(`HEPA ${json['D05213']} filter: replace in ${json['D05213']} hours`);
                this.setCapabilityValue('hepa_filter_replace', json['D05213']);
                let tokens = {
                    "hours": json['D05213'],
                    "filter": "hepa_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "hepa_filter"
                };

                if (this.hepaFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.hepaFilterTriggered = true;
                    setTimeout(() => {
                        this.hepaFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }

        }
    }

    pollAirDevice() {
        this.log("pollAirDevice");
        let settings = this.getSettings();
        this.log(settings);
        // this.log(JSON.stringify(settings));
        let deviceSecret = this.getStoreValue('secretKey' + settings.id);
        // this.log(this);
        this.log(deviceSecret);
        settings.secretkey = deviceSecret;
        this.log(settings);
        this.log("getCurrentStatusData");
        philipsair.getCurrentStatusData(settings).then(data => {

            this.log("pollAirDevice: " + JSON.stringify(data));
            if (data.error != null) {
                this.setCapabilityValue('product', data.error);
                philipsair.getInitData(settings).then(data => {
                    let secretKey = data;
                    if (secretKey != "ERROR") {
                        this.log('refresh key');
                        this.log('old key: ' + deviceSecret);
                        this.log('new key: ' + secretKey);
                        this.setStoreValue('secretKey', secretKey);
                    } else {
                        this.log('failed  to get the shared secret key');
                    }
                })
            }
            if (data.firmware != null) {
                this.log(`Product: ${data.firmware.name} version ${data.firmware.version} upgrade ${data.firmware.upgrade != '' ? data.firmware.upgrade : "-"} status ${data.firmware.statusmsg != '' ? data.firmware.statusmsg : "-"}`)
                this.setCapabilityValue('product', `${data.firmware.name} ${data.firmware.version}`);
            }
            if (data.filter != null) {
                // if 'wicksts' in filters:
                // print('Wick filter: replace in {} hours'.format(filters['wicksts']))
                if (data.filter.hasOwnProperty('fltsts0')) {
                    this.log(`Pre-filter: clean in ${data.filter.fltsts0} hours`);
                    this.setCapabilityValue('pre_filter_clean', data.filter.fltsts0);
                    let tokens = {
                        "hours": data.filter.fltsts0,
                        "filter": "pre_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "pre_filter"
                    };
                    this.log("preFilterTriggered: " + this.preFilterTriggered)
                    if (this.preFilterTriggered == false) {
                        this.log("is preFilterTriggered ");
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.preFilterTriggered = true;
                        setTimeout(() => {
                            this.preFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
                if (data.filter.hasOwnProperty('fltsts2')) {
                    this.log(`Active Carbon ${data.filter.fltt2} filter: replace in ${data.filter.fltsts2} hours`);
                    this.setCapabilityValue('carbon_filter_replace', data.filter.fltsts2);
                    let tokens = {
                        "hours": data.filter.fltsts2,
                        "filter": "carbon_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "carbon_filter"
                    };
                    if (this.carbonFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.carbonFilterTriggered = true;
                        setTimeout(() => {
                            this.carbonFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
                if (data.filter.hasOwnProperty('fltsts1')) {
                    this.log(`HEPA ${data.filter.fltt1} filter: replace in ${data.filter.fltsts1} hours`);
                    this.setCapabilityValue('hepa_filter_replace', data.filter.fltsts1);
                    let tokens = {
                        "hours": data.filter.fltsts1,
                        "filter": "hepa_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "hepa_filter"
                    };
                    if (this.hepaFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.hepaFilterTriggered = true;
                        setTimeout(() => {
                            this.hepaFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
            }
            this.handleDeviceStatus(data.status, settings);
        })
    }
}

// module.exports = AirDevice;