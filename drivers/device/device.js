'use strict';

const Homey = require('homey');
const { ManagerSettings } = require('homey');
const philipsair = require('index.js');

Date.prototype.timeNow = function(){ 
    return ((this.getHours() < 10)?"0":"") + ((this.getHours()>12)?(this.getHours()-12):this.getHours()) +":"+ ((this.getMinutes() < 10)?"0":"") + this.getMinutes() + " " + ((this.getHours()>12)?('PM'):'AM');
};

class device extends Homey.Device {

	onInit() {
		this.log('MyPhilipsAirDevice has been inited');
        let settings = this.getData();

        let secretKey = "-";   
        philipsair.getInitData(settings).then(data => {
            secretKey =  data;

            this.getData().secretkey = secretKey;
            settings.secretkey = secretKey;
            let name = this.getData().id;
            this.log("name " + name + " key " + settings.secretkey);
            let cronName = this.getData().id.toLowerCase();
    
            Homey.ManagerCron.getTask(cronName)
                .then(task => {
                    this.log("The task exists: " + cronName);
                    task.on('run', settings => this.pollAirDevice(settings));
                })
                .catch(err => {
                    if (err.code == 404) {
                        this.log("The task has not been registered yet, registering task: " + cronName);
                        Homey.ManagerCron.registerTask(cronName, "*/1 * * * *", settings)
                            .then(task => {
                                task.on('run', settings => this.pollAirDevice(settings));
                            })
                            .catch(err => {
                                this.log('problem with registering cronjob: ${err.message}');
                            });
                    } else {
                        this.log('other cron error: ${err.message}');
                    }
                });
        })

        this._conditionScoreIaql = new Homey.FlowCardCondition('score_iaql').register().registerRunListener((args, state) => {
            let result = (this.conditionScoreIaqlToString(this.getCapabilityValue('measure_iaql')) == args.argument_main) 
            return Promise.resolve(result);
        }); 
        this._conditionScorePm25 = new Homey.FlowCardCondition('score_pm25').register().registerRunListener((args, state) => {
            let result = (this.conditionScorePm25lToString(this.getCapabilityValue('measure_pm25')) == args.argument_main) 
            return Promise.resolve(result);
        }); 
    }

    conditionScoreIaqlToString(index) {
        if ( index > 9 ) {
            return 'verypoor';
        } else if ( index > 6 ) {
            return 'poor';
        } else if ( index > 3 ) {
            return 'fair';
        } else {
            return 'good';
        }
    }

    conditionScorePm25lToString(index) {
        if ( index > 55 ) {
            return 'verypoor';
        } else if ( index > 35 ) {
            return 'poor';
        } else if ( index > 12 ) {
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
        Homey.ManagerCron.unregisterTask(cronName, function (err, success) {});
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

	pollAirDevice(settings) {
        let currentdate =new Date().timeNow();
        this.log("refresh now " + currentdate);
        this.setCapabilityValue('latest_retrieval_date', currentdate);
        this.log(settings);
        philipsair.getCurrentStatusData(settings).then(data => {
            this.log("pollAirDevice: "+data);

            this.log(`Product: ${data.firmware.name} version ${data.firmware.version} upgrade ${data.firmware.upgrade != '' ? data.firmware.upgrade  : "-"} status ${data.firmware.statusmsg != '' ? data.firmware.statusmsg  : "-"}`)
            this.setCapabilityValue('product', `${data.firmware.name} ${data.firmware.version}`);

            if(data.filter.hasOwnProperty('fltsts0')){
               this.log(`Pre-filter: clean in ${data.filter.fltsts0} hours`)
               this.setCapabilityValue('pre_filter_clean', data.filter.fltsts0);
            }
            if(data.filter.hasOwnProperty('fltsts2')){
               this.log(`Active Carbon ${data.filter.fltt2} filter: replace in ${data.filter.fltsts2} hours`)
               this.setCapabilityValue('carbon_filter_replace', data.filter.fltsts2);
            }
            if(data.filter.hasOwnProperty('fltsts1')){
                this.log(`HEPA ${data.filter.fltt1} filter: replace in ${data.filter.fltsts1} hours`)
                this.setCapabilityValue('herpa_filter_replace', data.filter.fltsts1);
            }
            let json = data.status;
            if(json.hasOwnProperty('pwr')){
                this.log(`Power: ${json.pwr == '1' ? 'ON'  : "OFF"}`)
            }
            if(json.hasOwnProperty('pm25')){
                this.log(`PM25: ${json.pm25}`)
                this.setCapabilityValue('measure_pm25', json.pm25);
            }
            if(json.hasOwnProperty('tvoc')){
                this.log(`GAS (TVOC): ${json.tvoc}`)
                this.setCapabilityValue('measure_tvoc', json.tvoc);
            }
            if(json.hasOwnProperty('rhset')){
                this.log(`Target humidity: ${json.rhset}`)
                this.setCapabilityValue('measure_humidity', json.rhset);
            }     
            if(json.hasOwnProperty('iaql')){
                this.log(`Allergen index: ${json.iaql}`)
                this.setCapabilityValue('measure_iaql', json.iaql);
            } 
            if(json.hasOwnProperty('temp')){
                this.log(`Temperature: ${json.temp}`)
                this.setCapabilityValue('measure_temperature', json.temp);
            } 
            if(json.hasOwnProperty('func')){
                this.log(`Function: ${json.pwr == 'P' ? 'Purification'  : "Purification & Humidification"}`)
            } 
            if(json.hasOwnProperty('mode')){
                let mode_str = {'P': 'auto', 'A': 'allergen', 'S': 'sleep', 'M': 'manual', 'B': 'bacteria', 'N': 'night'}
                this.log(`Mode: ${mode_str[json.mode]}`)
            } 
            if(json.hasOwnProperty('om')){
                let om_str = {'s': 'silent', 't': 'turbo'}
                this.log(`Fan speed: ${om_str[json.om]}`)
            } 
            if(json.hasOwnProperty('aqil')){
                this.log(`Light brightness: ${json.aqil}`)
            } 
            if(json.hasOwnProperty('uil')){
                let uil_str = {'1': 'ON', '0': 'OFF'}
                this.log(`Buttons light: ${uil_str[json.uil]}`)
            } 
            if(json.hasOwnProperty('ddp')){
                let ddp_str = {'1': 'PM2.5', '0': 'IAI'}
                this.log(`Used index: ${ddp_str[json.ddp]}`)
            } 
            if(json.hasOwnProperty('wl')){
                this.log(`Water level: ${json.wl}`)
            } 
            if(json.hasOwnProperty('cl')){
                this.log(`Child lock: ${json.cl}`)
            }     
            if(json.hasOwnProperty('dt')){
                this.log(`Timer hours: ${json.dt}`)
            } 
            if(json.hasOwnProperty('dtrs')){
                this.log(`Timer minutes: ${json.dtrs}`)
            }  
            if(json.hasOwnProperty('err')){
                if ( json.err != 0) {
                    let err_str = {49408: 'no water', 32768: 'water tank open'}
                    this.log(`Error: ${ddp_str[json.err]}`)
                } {
                    this.log(`Error: -`)
                }
            } 
        })
    }
}

module.exports = device;