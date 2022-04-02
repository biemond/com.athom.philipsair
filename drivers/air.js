'use strict';

const Homey = require('homey');
const philipsair = require('./philipsair.js');
const philipsairCoap = require('./philipsairCoap.js');
const MINUTE = 60000;

Date.prototype.timeNow = function () {
    return ((this.getHours() < 10) ? "0" : "") + ((this.getHours() > 12) ? (this.getHours() - 12) : this.getHours()) + ":" + ((this.getMinutes() < 10) ? "0" : "") + this.getMinutes() + " " + ((this.getHours() > 12) ? ('PM') : 'AM');
};

class AirDevice extends Homey.Device {

    // flow triggers
    flowTriggerFilterReplaceClean(tokens, state) {
        this.log("trigger fired");
        this._flowTriggerFilterReplaceClean
            .trigger(this, tokens, state)
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

    setStateCoap(key, value, settings) {
        this.log('setStateCoap: ' + key + ":" + value);
        // let settings = this.getSettings();
        this.log(settings);
        philipsairCoap.setValueAirDataCoap(key, value, settings).then(data => {
            this.log("-setValueCoapAirData-begin-");
            this.log(data);
            //   this.pollAirCoapDevice(settings);
            this.log("-setValueCoapAirData-end-");
            return value
        })
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

    onDeleted() {
        let id = this.getData().id;
        let name = this.getData().id;
        let cronName = name.toLowerCase();
        this.log('Unregistering cron:', cronName);
        Homey.ManagerCron.unregisterTask(cronName, function (err, success) { });
        this.log('device deleted:', id);
    } // end onDeleted

    onSettings(settings, newSettingsObj, changedKeysArr, callback) {
        try {
            for (var i = 0; i < changedKeysArr.length; i++) {
                switch (changedKeysArr[i]) {
                    case 'ipkey':
                        this.log('IPKey changed to ' + newSettingsObj.ipkey);
                        settings.ipkey = newSettingsObj.ipkey;
                        break;

                    default:
                        this.log("Key not matched: " + i);
                        break;
                }
            }
            callback(null, true)
        } catch (error) {
            callback(error, null)
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
            if (json.hasOwnProperty('pm25')) {
                this.log(`PM25: ${json.pm25}`);
                this.setCapabilityValue('measure_pm25', json.pm25);
            }
            if (json.hasOwnProperty('tvoc')) {
                this.log(`GAS (TVOC): ${json.tvoc}`);
                this.setCapabilityValue('measure_tvoc', json.tvoc);
            }
            if (json.hasOwnProperty('rh')) {
                this.log(`Humidity: ${json.rh}`);
                this.setCapabilityValue('measure_humidity', json.rh);
            }
            if (json.hasOwnProperty('rhset')) {
                this.log(`Target humidity: ${json.rhset}`);
                this.setCapabilityValue('target_humidity', json.rhset.toString());
            }
            if (json.hasOwnProperty('iaql')) {
                this.log(`Allergen index: ${json.iaql}`);
                this.setCapabilityValue('measure_iaql', json.iaql);
            }
            if (json.hasOwnProperty('temp')) {
                this.log(`Temperature: ${json.temp}`);
                this.setCapabilityValue('measure_temperature', json.temp);
            }
            if (json.hasOwnProperty('func')) {
                // P or PH
                this.log(`Function: ${json.func == 'P' ? 'Purification' : "Purification & Humidification"}`)
                if (json.func == 'P') {
                    this.setCapabilityValue('func_mode', false);
                } else {
                    this.setCapabilityValue('func_mode', true);
                }
            }
            if (json.hasOwnProperty('mode')) {
                let mode_str = { 'P': 'auto', 'AG': 'auto', 'A': 'allergen', 'S': 'sleep', 'M': 'manual', 'B': 'bacteria', 'N': 'night' }
                this.setCapabilityValue('purifier_mode', json.mode);

                this.log(`Mode: ${mode_str[json.mode]}`)
                if (json.mode == 'P' || json.mode == 'AG') {
                    this.setCapabilityValue('fan_speed', 'AUTO');
                    this.log(`Fan speed: auto`);
                } else {
                    if (json.hasOwnProperty('om')) {
                        let om_str = { '1': 'speed 1', '2': 'speed 2', '3': 'speed 3', 'P': 'auto', 'AG': 'auto', 's': 'silent', 't': 'turbo' }
                        this.setCapabilityValue('fan_speed', json.om);
                        this.log(`Fan speed: ${om_str[json.om]}`)
                    }
                }

            }

            if (json.hasOwnProperty('aqil')) {
                this.log(`Light brightness: ${json.aqil}`);
                this.setCapabilityValue('light_intensity', json.aqil);
            }
            if (json.hasOwnProperty('uil')) {
                let uil_str = { '1': 'ON', '0': 'OFF', '2': 'FIXED' };
                this.setCapabilityValue('button_lights', json.uil.toString());
                this.log(`Buttons light: ${uil_str[json.uil]}`)
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
            if (json.hasOwnProperty('cl')) {
                this.log(`Child lock: ${json.cl}`);
                this.setCapabilityValue('child_lock', json.cl);
            }
            if (json.hasOwnProperty('wl')) {
                this.log(`Water level: ${json.wl}`);
                if (json.wl == 100) {
                    this.setCapabilityValue('water_level', "Ok");
                } else {
                    this.setCapabilityValue('water_level', "Empty");
                }
            }
            if (json.hasOwnProperty('dt')) {
                this.log(`Timer hours: ${json.dt}`);
                this.setCapabilityValue('timer', json.dt.toString());
            }
            if (json.hasOwnProperty('dtrs')) {
                this.log(`Timer total minutes left: ${json.dtrs}`);
                this.setCapabilityValue('timer_remaining', json.dtrs);
            }
            if (json.hasOwnProperty('err')) {
                if (json.err != 0) {
                    let err_str = { 49408: 'no water', 32768: 'water tank open' };
                    this.log(`Error: ${err_str[json.err]}`);
                } {
                    this.log(`Error: -`);
                }
            }
            if (json.hasOwnProperty('modelid')) {
                this.log(`Location: ${json.name} modelid ${json.modelid} `);
                this.setCapabilityValue('product', `${json.modelid}`);
            }

            // if 'wicksts' in filters:
            // print('Wick filter: replace in {} hours'.format(filters['wicksts']))
            if (json.hasOwnProperty('fltsts0')) {
                this.log(`Pre-filter: clean in ${json.fltsts0} hours`);
                this.setCapabilityValue('pre_filter_clean', json.fltsts0);
                let tokens = {
                    "hours": json.fltsts0,
                    "filter": "pre_filter",
                    "device": "air_" + settings.id.toLowerCase()
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
                    "device": "air_" + settings.id.toLowerCase()
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
                    "device": "air_" + settings.id.toLowerCase()
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

    pollAirCoapDevice(settings) {
        this.log("pollAirCoapDevice");
        this.log(settings);
        this.log("getCurrentStatusDataCoap");
        philipsairCoap.getCurrentStatusDataCoap(settings).then(data => {
            if (data != null) {
                this.log("pollAirCoapDevice: " + JSON.stringify(data));
                this.handleDeviceStatus(data.status, settings);
            } else {
                this.log("pollAirDevice went wrong");
            }
        })
    }

    pollAirDevice(settings) {
        this.log("pollAirDevice");
        this.log(settings);
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
                        "device": "air_" + settings.id.toLowerCase()
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
                        "device": "air_" + settings.id.toLowerCase()
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
                        "device": "air_" + settings.id.toLowerCase()
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

module.exports = AirDevice;