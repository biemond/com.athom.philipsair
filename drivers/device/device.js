'use strict';

const Homey = require('homey');
const philipsair = require('../philipsair.js');
const AirDevice = require('../air');

class device extends AirDevice {

	onInit() {
        this.preFilterTriggered = false;
        this.carbonFilterTriggered = false;
        this.hepaFilterTriggered = false;
		this.log('MyPhilipsAirDevice has been inited');
        let settings = this.getData();

        let secretKey = "-";   
        philipsair.getInitData(settings).then(data => {
            secretKey =  data;
            if (secretKey != "ERROR") {
                this.log('create cronjob');
                let name = this.getData().id;
                this.log("name " + name + " key " + secretKey);
                let cronName = this.getData().id.toLowerCase();
                this.setStoreValue('secretKey'+cronName,secretKey);
                this.log('cronjob: '+cronName);
                Homey.ManagerCron.getTask(cronName)
                    .then(task => {
                        this.log("The task exists: " + cronName);
                        this.log('Unregistering cron:', cronName);
                        Homey.ManagerCron.unregisterTask(cronName, function (err, success) {});
                        Homey.ManagerCron.registerTask(cronName, "*/2 * * * *", settings)
                        .then(task => {
                            task.on('run', settings => this.pollAirDevice(settings));
                        })
                        .catch(err => {
                            this.log('problem with registering cronjob: ${err.message}');
                        });            
                        // task.on('run', settings => this.pollAirDevice(settings));
                    })
                    .catch(err => {
                        if (err.code == 404) {
                            this.log("The task has not been registered yet, registering task: " + cronName);
                            Homey.ManagerCron.registerTask(cronName, "*/2 * * * *", settings)
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
                this.log('failed  to get the shared secret key');
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

        this.registerCapabilityListener('light_intensity', async (value)  => {
            let values = { "aqil": value};
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });   

        this.registerCapabilityListener('button_lights', async (value)  => {
            let values = { "uil": value};
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });  

        this.registerCapabilityListener('purifier_mode', async (value)  => {
            let values = { "mode": value};
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });          
 
        this.registerCapabilityListener('display_mode', async (value)  => {
            let values = { "ddp": value};
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });            

        this.registerCapabilityListener('onoff', async (value)  => {
            let values;
            if ( value == true ) {
                values = { "pwr": "1"}
            } else {
                values = { "pwr": "0"}
            }
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        }); 

        this.registerCapabilityListener('child_lock', async (value)  => {
            let values = { "cl": value}
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });            

        this.registerCapabilityListener('fan_speed', async (value)  => {
            let values = { "om": value}
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });    

        this.registerCapabilityListener('timer', async (value)  => {
            let values = { "dt": value}
            this.setState(JSON.stringify(values), this.getSettings());
            return value;
        });   
    }
}

module.exports = device;
