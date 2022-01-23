'use strict';

const Homey = require('homey');
const philipsairCoap = require('../philipsairCoap.js');
const AirDevice = require('../air');

// sleep time expects milliseconds
function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}


class deviceCoap2 extends AirDevice {

	onInit() {
		this.log('MyPhilipsAirDevice has been inited');
        this.preFilterTriggered = false;
        this.carbonFilterTriggered = false;
        this.hepaFilterTriggered = false;

        let settings = this.getData();

        this.log('create cronjob');
        let name = this.getData().id;
        this.log("name " + name );
        let cronName = this.getData().id.toLowerCase();
        this.log('cronjob: '+cronName);
        // Homey.ManagerSettings.set('settings',settings);
        Homey.ManagerCron.getTask(cronName)
            .then(task => {
                this.log("The task exists: " + cronName);
                this.log('Unregistering cron:', cronName);
                Homey.ManagerCron.unregisterTask(cronName, function (err, success) {});
                Homey.ManagerCron.registerTask(cronName, "*/2 * * * *", settings)
                .then(task => {
                    task.on('run', settings => this.pollAirCoapDevice(settings));
                })
                .catch(err => {
                    this.log('problem with registering cronjob: ${err.message}');
                });            
            })
            .catch(err => {
                if (err.code == 404) {
                    this.log("The task has not been registered yet, registering task: " + cronName);
                    Homey.ManagerCron.registerTask(cronName, "*/2 * * * *", settings)
                        .then(task => {
                            task.on('run', settings => this.pollAirCoapDevice(settings));
                        })
                        .catch(err => {
                            this.log('problem with registering cronjob: ${err.message}');
                        });
                } else {
                    this.log('other cron error: ${err.message}');
                }
            });
        this.pollAirCoapDevice(settings)

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
            this.setStateCoap( "aqil", value, this.getSettings());
            return value;
        });   

        this.registerCapabilityListener('func_mode', async (value)  => {
            // P or PH
            let values;
            if ( value == true ) {
                values = "PH";
            } else {
                values =  "P";
            }
            this.setStateCoap("func", values, this.getSettings());
            return value;
        });   

        this.registerCapabilityListener('target_humidity', async (value)  => {
            this.setStateCoap("rhset", Number(value), this.getSettings());
            return value;
        });   

        this.registerCapabilityListener('button_lights', async (value)  => {
            this.setStateCoap("uil",value, this.getSettings());
            return value;
        });  

        this.registerCapabilityListener('purifier_mode', async (value)  => {
            this.setStateCoap("mode", value, this.getSettings());
            return value;
        });          
 
        this.registerCapabilityListener('display_mode_ph', async (value)  => {
            this.setStateCoap("ddp", value, this.getSettings());
            return value;
        });            

        this.registerCapabilityListener('onoff', async (value)  => {
            let values;
            if ( value == true ) {
                values = "1";
            } else {
                values = "0";
            }
            this.setStateCoap( "pwr", values, this.getSettings());
            return value;
        }); 

        this.registerCapabilityListener('child_lock', async (value)  => {
            this.setStateCoap("cl", value, this.getSettings());
            return value;
        });            


       this.registerCapabilityListener('fan_speed', async (value)  => {
            let model = this.getCapabilityValue('product')
            const newCoapDevices = [ 'AC4236/10', 'AC2958/10', 'AC2939/10', 'AC3858/10', 'AC3033/10', 'AC3059/10']

            if ( value == "AUTO") {
                // auto
                if ( newCoapDevices.includes( model) ) {
                  this.setStateCoap("mode", "AG", this.getSettings());
                } else { 
                  this.setStateCoap("mode", "P", this.getSettings());
                }
            } else { 
                if ( value == "s" || value == "t" ) {
                    // turbo / sleep
                    if (newCoapDevices.includes( model) ) {
                      this.setStateCoap("mode", value.toUpperCase(), this.getSettings());
                      sleep(2000).then(() => {
                         this.setStateCoap("om", value, this.getSettings());    
                      });                         
                    } else { 
                      this.setStateCoap("mode", "M", this.getSettings());
                      sleep(2000).then(() => {
                         this.setStateCoap("om", value, this.getSettings());    
                      });                         
                    }
                } else {
                    this.setStateCoap("mode", "M", this.getSettings());
                    sleep(2000).then(() => {
                       this.setStateCoap("om", value, this.getSettings());    
                    });                       
                }
            }
            return value;
        });    


        this.registerCapabilityListener('timer', async (value)  => {
            this.setStateCoap("dt", value, this.getSettings());
            return value;
        }); 

    }
}

module.exports = deviceCoap2;
