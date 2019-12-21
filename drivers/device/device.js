'use strict';

const Homey = require('homey');
const { ManagerSettings } = require('homey');
const philipsair = require('index.js');
const MINUTE = 60000;


Date.prototype.timeNow = function(){ 
    return ((this.getHours() < 10)?"0":"") + ((this.getHours()>12)?(this.getHours()-12):this.getHours()) +":"+ ((this.getMinutes() < 10)?"0":"") + this.getMinutes() + " " + ((this.getHours()>12)?('PM'):'AM');
};

class device extends Homey.Device {

	onInit() {
        this.preFilterTriggered = false;
        this.carbonFilterTriggered = false;
        this.hepaFilterTriggered = false;
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

            Homey.ManagerSettings.set('settings',settings);

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
        // https://apps.developer.athom.com/tutorial-Flow-State.html
        this._flowTriggerFilterReplaceClean = new Homey.FlowCardTrigger('filter_replace_clean').registerRunListener(( args, state ) => {
            // If true, this flow should run
            return Promise.resolve( args.which === state.which );
        }).register()

        this._conditionScoreIaql = new Homey.FlowCardCondition('score_iaql').register().registerRunListener((args, state) => {
            let result = (this.conditionScoreIaqlToString(this.getCapabilityValue('measure_iaql')) == args.argument_main) 
            return Promise.resolve(result);
        }); 
        this._conditionScorePm25 = new Homey.FlowCardCondition('score_pm25').register().registerRunListener((args, state) => {
            let result = (this.conditionScorePm25lToString(this.getCapabilityValue('measure_pm25')) == args.argument_main) 
            return Promise.resolve(result);
        }); 

        this.registerCapabilityListener('light_intensity', async (value)  => {
            let values = { "aqil": value}
            this.setState(JSON.stringify(values))
            return value;
        });   

        this.registerCapabilityListener('button_lights', async (value)  => {
            let values;
            if ( value == true ) {
                values = { "uil": "1"}
            } else {
                values = { "uil": "0"}
            }
            this.setState(JSON.stringify(values))
            return value;
        });  

        this.registerCapabilityListener('purifier_mode', async (value)  => {
            let values = { "mode": value}
            this.setState(JSON.stringify(values))
            return value;
        });          
 
        this.registerCapabilityListener('display_mode', async (value)  => {
            let values = { "ddp": value}
            this.setState(JSON.stringify(values))
            return value;
        });            

        this.registerCapabilityListener('onoff', async (value)  => {
            let values;
            if ( value == true ) {
                values = { "pwr": "1"}
            } else {
                values = { "pwr": "0"}
            }
            this.setState(JSON.stringify(values))
            return value;
        }); 

        this.registerCapabilityListener('child_lock', async (value)  => {
            let values = { "cl": value}
            this.setState(JSON.stringify(values))
            return value;
        });            

        this.registerCapabilityListener('fan_speed', async (value)  => {
            let values = { "om": value}
            this.setState(JSON.stringify(values))
            return value;
        });    
    
    }

    // flow triggers
    flowTriggerFilterReplaceClean(tokens, state) {
        this._flowTriggerFilterReplaceClean
            .trigger(tokens, state)
            .then(this.log("flowTriggerFilterReplaceClean"))
            .catch(this.error)
    }

    setState(value) {
      this.log('setState:', value);
      let settings = Homey.ManagerSettings.get('settings');
      this.log(settings); 

      philipsair.setValueAirData(value,settings).then(data => {
        this.log("-setValueAirData-begin-"); 
        this.log(data); 
        this.handleDeviceStatus(data);
        this.log("-setValueAirData-end-"); 
        return value  
      })
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

    handleDeviceStatus(json) {
        if(json != null){            
            let currentdate =new Date().timeNow();
            this.log("refresh now " + currentdate);
            this.setCapabilityValue('latest_retrieval_date', currentdate);
    
            if(json.hasOwnProperty('pwr')){
                if ( json.pwr == '1' ) {
                    this.setCapabilityValue('onoff', true);
                } else {
                    this.setCapabilityValue('onoff', false);
                }
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
            if(json.hasOwnProperty('rh')){
                this.log(`Humidity: ${json.rh}`)
                this.setCapabilityValue('measure_humidity', json.rh);
            }  
            if(json.hasOwnProperty('rhset')){
                this.log(`Target humidity: ${json.rhset}`)
                this.setCapabilityValue('target_humidity', json.rhset);
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
                this.setCapabilityValue('purifier_mode', json.mode);
                this.log(`Mode: ${mode_str[json.mode]}`)
            } 
            if(json.hasOwnProperty('om')){
                let om_str = {'1': 'speed 1', '2': 'speed 2' ,'3': 'speed 3' ,'s': 'silent', 't': 'turbo'}
                this.setCapabilityValue('fan_speed', json.om);
                this.log(`Fan speed: ${om_str[json.om]}`)
            } 
            if(json.hasOwnProperty('aqil')){
                this.log(`Light brightness: ${json.aqil}`)
                this.setCapabilityValue('light_intensity', json.aqil);
            } 
            if(json.hasOwnProperty('uil')){
                let uil_str = {'1': 'ON', '0': 'OFF'}
                if ( json.uil == '1' ) {
                    this.setCapabilityValue('button_lights', true);
                } else {
                    this.setCapabilityValue('button_lights', false);
                }
                this.log(`Buttons light: ${uil_str[json.uil]}`)
            } 
            if(json.hasOwnProperty('ddp')){
                let ddp_str = {'1': 'PM2.5', '0': 'IAI'}
                this.log(`Used index: ${ddp_str[json.ddp]}`)
                this.setCapabilityValue('display_mode', json.ddp);
            } 
            if(json.hasOwnProperty('wl')){
                this.log(`Water level: ${json.wl}`)
            } 
            if(json.hasOwnProperty('cl')){
                this.log(`Child lock: ${json.cl}`)
                this.setCapabilityValue('child_lock', json.cl);
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
        }            
    }

	pollAirDevice(settings) {
        this.log(settings);
        philipsair.getCurrentStatusData(settings).then(data => {
            
            this.log("pollAirDevice: "+ JSON.stringify(data));
            if (data.error != null) {
                this.setCapabilityValue('product', data.error);
            }
            if(data.firmware != null){
                this.log(`Product: ${data.firmware.name} version ${data.firmware.version} upgrade ${data.firmware.upgrade != '' ? data.firmware.upgrade  : "-"} status ${data.firmware.statusmsg != '' ? data.firmware.statusmsg  : "-"}`)
                this.setCapabilityValue('product', `${data.firmware.name} ${data.firmware.version}`);
            }
            if(data.filter != null){
                if(data.filter.hasOwnProperty('fltsts0')){
                  this.log(`Pre-filter: clean in ${data.filter.fltsts0} hours`)
                  this.setCapabilityValue('pre_filter_clean', data.filter.fltsts0);
                  let tokens = {
                    "hours": data.filter.fltsts0,
                    "filter": "pre_filter"
                  };
                  let state = {
                    "which": "pre_filter"
                  }; 
                  if (this.preFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.preFilterTriggered = true;
                    setTimeout(() => {
                        this.preFilterTriggered = false;
                    }, 60 * MINUTE);
                  }
                }
                if(data.filter.hasOwnProperty('fltsts2')){
                  this.log(`Active Carbon ${data.filter.fltt2} filter: replace in ${data.filter.fltsts2} hours`)
                  this.setCapabilityValue('carbon_filter_replace', data.filter.fltsts2);
                  let tokens = {
                    "hours": data.filter.fltsts2,
                    "filter": "carbon_filter"
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
                if(data.filter.hasOwnProperty('fltsts1')){
                  this.log(`HEPA ${data.filter.fltt1} filter: replace in ${data.filter.fltsts1} hours`)
                  this.setCapabilityValue('hepa_filter_replace', data.filter.fltsts1);
                  let tokens = {
                    "hours": data.filter.fltsts1,
                    "filter": "hepa_filter"
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
            this.handleDeviceStatus(data.status);
        })
    }
}

module.exports = device;
