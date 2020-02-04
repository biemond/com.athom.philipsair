'use strict';

const Homey = require('homey');
const philipsair = require('index.js');
const AirDevice = require('../air');

class device2 extends AirDevice {

	onInit() {
        this.preFilterTriggered = false;
        this.carbonFilterTriggered = false;
        this.hepaFilterTriggered = false;
		this.log('MyPhilipsAirHumidifierDevice has been inited');
        let settings = this.getData();

        let secretKey = "-";   
        philipsair.getInitData(settings).then(data => {
            secretKey =  data;
            if (secretKey != "ERROR") {
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
                            Homey.ManagerCron.registerTask(cronName, "1-59/2 * * * *", settings)
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
                this.pollAirDevice(settings)      
            }  else {
                this.setUnavailable("Not able to get the shared secret key, please re-add the device and check if the IP address exists")
            }  
        })
        // https://apps.developer.athom.com/tutorial-Flow-State.html
        this._flowTriggerFilterReplaceClean = new Homey.FlowCardTriggerDevice('filter_replace_clean').register();
        this._flowTriggerFilterReplaceClean.registerRunListener(( args, state ) => {
            // If true, this flow should run
            let conditionMet = args.which === state.which;
            return Promise.resolve(conditionMet);
        });

        this._conditionScoreIaql = new Homey.FlowCardCondition('score_iaql').register().registerRunListener((args, state) => {
            let result = (this.conditionScoreIaqlToString(this.getCapabilityValue('measure_iaql')) == args.argument_main) 
            return Promise.resolve(result);
        }); 
        this._conditionScorePm25 = new Homey.FlowCardCondition('score_pm25').register().registerRunListener((args, state) => {
            let result = (this.conditionScorePm25lToString(this.getCapabilityValue('measure_pm25')) == args.argument_main) 
            return Promise.resolve(result);
        }); 

        let onAction = new Homey.FlowCardAction('on');
        onAction.register().registerRunListener(( args, state ) => {
            let values = { "pwr": "1"}
            this.setState(JSON.stringify(values))
            return Promise.resolve( true );
        })
        let offAction = new Homey.FlowCardAction('off');
        offAction.register().registerRunListener(( args, state ) => {
            let values = { "pwr": "0"}
            this.setState(JSON.stringify(values))
            return Promise.resolve( true );
        })

        this.registerCapabilityListener('light_intensity', async (value)  => {
            let values = { "aqil": value}
            this.setState(JSON.stringify(values))
            return value;
        });   

        this.registerCapabilityListener('func_mode', async (value)  => {
            // P or PH
            let values;
            if ( value == true ) {
                values = { "func": "PH"}
            } else {
                values = { "func": "P"}
            }
            this.setState(JSON.stringify(values))
            return value;
        });   

        this.registerCapabilityListener('target_humidity', async (value)  => {
            let values = { "rhset": Number(value)}
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
}

module.exports = device2;
