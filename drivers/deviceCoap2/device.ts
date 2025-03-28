
import { AirDevice } from '../air';
// sleep time expects milliseconds
function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

class deviceCoap2 extends AirDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('deviceCoap2 has been initialized');
    this.log('MyPhilipsAirDevice has been inited');
    this.preFilterTriggered = false;
    this.carbonFilterTriggered = false;
    this.hepaFilterTriggered = false;

    this.observerAirCoapDevice();

    if (this.hasCapability('error') === false) {
      await this.addCapability('error');
    }

    let flowTriggerFilterReplaceClean = this.homey.flow.getDeviceTriggerCard('filter_replace_clean');
    flowTriggerFilterReplaceClean.registerRunListener(async (args, state) => {
      // If true, this flow should run
      let conditionMet = args.which === state.which;
      return Promise.resolve(conditionMet);
    });

    this.homey.flow.getConditionCard('score_iaql').registerRunListener(async (args, state) => {
      let result = (this.conditionScoreIaqlToString(this.getCapabilityValue('measure_iaql')) == args.argument_main)
      return Promise.resolve(result);
    });
    this.homey.flow.getConditionCard('score_pm25').registerRunListener(async (args, state) => {
      let result = (this.conditionScorePm25lToString(this.getCapabilityValue('measure_pm25')) == args.argument_main)
      return Promise.resolve(result);
    });
    
    this.registerCapabilityListener('light_intensity', async (value) => {
      let model = this.getCapabilityValue('product')      
      const newCoapDevices2 = ['AC3737/10','AMF765/10','AC3421/13','AC4236/14']       
      if (newCoapDevices2.includes(model)) {
        let values2
        if (value == "0") {
          values2 = 0;   // off
        } else {
          values2 = 100; // on
        }
        this.setStateCoap("D03105", values2, this.getSettings());
      } else {        
        this.setStateCoap("aqil", value, this.getSettings());
      }
      return value;
    });

    this.registerCapabilityListener('func_mode', async (value) => {
      // P or PH
      let values;
      if (value == true) {
        values = "PH";
      } else {
        values = "P";
      }
      this.setStateCoap("func", values, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('target_humidity', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices2 = ['AC3737/10','AC3421/13']  
      if (newCoapDevices2.includes(model)) {
        this.setStateCoap("D03128",  Number(value), this.getSettings());
      } else {
        this.setStateCoap("rhset", Number(value), this.getSettings());
      }        

      return value;
    });

    this.registerCapabilityListener('button_lights', async (value) => {
      this.setStateCoap("uil", value, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('purifier_mode', async (value) => {
      this.setStateCoap("mode", value, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('display_mode_ph', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices2 =  ['AC3737/10','AMF765/10','AC3421/13','AC4236/14','AMF870/15']  
      if (newCoapDevices2.includes(model)) {
        this.setStateCoap("D0312A", Number(value), this.getSettings());   
      } else {     
         this.setStateCoap("ddp", value, this.getSettings());
      }
      return value;
    });

    this.registerCapabilityListener('onoff', async (value) => {
      let values;
      let model = this.getCapabilityValue('product')
      const newCoapDevices2 = ['AC3737/10','AC3421/13','AC4236/14','AMF870/15']  
      if (newCoapDevices2.includes(model)) {
        if (value == true) {
          values = 1;
        } else {
          values = 0;
        }
        this.setStateCoap("D03102", values, this.getSettings());
      } else {
        if (value == true) {
          values = '1';
        } else {
          values = '0';
        }
        this.setStateCoap("pwr", values, this.getSettings());
      }      
      return value;
    });

    this.registerCapabilityListener('child_lock', async (value) => {
      let model = this.getCapabilityValue('product')      
      const newCoapDevices2 = ['AC3737/10','AMF765/10','AC3421/13','AC4236/14','AMF870/15']        
      if (newCoapDevices2.includes(model)) {
        let values;
        if (value == true) {
          values = 1;
        } else {
          values = 0;
        }
        this.setStateCoap("D03103", values, this.getSettings());
      }  else {  
        this.setStateCoap("cl", value, this.getSettings());
      }
      return value;
    });


    this.registerCapabilityListener('fan_speed', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices = ['AC4236/10', 'AC2958/10', 'AC2939/10', 'AC3858/10', 'AC3033/10','AC3033/14','AC3036/10','AC3039/10', 'AC3059/10', 'AC2936/13']
      const newCoapDevices2 = ['AC3737/10','AMF765/10','AC3421/13','AC4236/14','AMF870/15']       

      if (newCoapDevices2.includes(model)) {
        if (value == "1") {
          this.setStateCoap("D0310C", 1, this.getSettings());
        }
        if (value == "2") {
          this.setStateCoap("D0310C", 2, this.getSettings());
        }
        if (value == "s") {
          this.setStateCoap("D0310C", 17, this.getSettings());
        }
        if (value == "AUTO") {
          this.setStateCoap("D0310C", 0, this.getSettings());
        }
        if (value == "t") {
          this.setStateCoap("D0310C", 18, this.getSettings());
        }           
      } else {
        if (value == "AUTO") {
          // auto
          if (newCoapDevices.includes(model)) {
            this.setStateCoap("mode", "AG", this.getSettings());
          } else {
            this.setStateCoap("mode", "P", this.getSettings());
          }
        } else {
          if (value == "s" || value == "t" || value == "as") {
            // turbo / sleep
            if (newCoapDevices.includes(model)) {
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
      }

      return value;
    });


    this.registerCapabilityListener('timer', async (value) => {
      let model = this.getCapabilityValue('product')      
      const newCoapDevices2 = ['AC3737/10','AMF765/10','AC3421/13','AC4236/14','AMF870/15']        
      if (newCoapDevices2.includes(model)) {
        this.setStateCoap("D03110", Number(value), this.getSettings());
      } else {  
        this.setStateCoap("dt", value, this.getSettings());
      }  
      return value;
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('deviceCoap2 has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings: { }, newSettings: { }, changedKeys: { } }): Promise<string | void> {
    this.log('deviceCoap2 settings where changed');
  }



  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('deviceCoap2 was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('deviceCoap2 has been deleted');
    // this.homey.clearInterval(timer);    
  }

}

module.exports = deviceCoap2;
