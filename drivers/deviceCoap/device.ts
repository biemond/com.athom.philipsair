const philipsair = require('../philipsair.js');

import { AirDevice } from '../air';
// sleep time expects milliseconds
function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

const RETRY_INTERVAL = 95 * 1000;
let timer: NodeJS.Timer;

class deviceCoap extends AirDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyPhilipsAirDevice has been inited');
    this.preFilterTriggered = false;
    this.carbonFilterTriggered = false;
    this.hepaFilterTriggered = false;

    this.pollAirCoapDevice();

    timer = this.homey.setInterval(() => {
      // poll device state from invertor
      this.pollAirCoapDevice();
    }, RETRY_INTERVAL);

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
      this.setStateCoap("aqil", value, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('button_lights', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices = ['AC0850/11', 'AC1715/11']
      if (newCoapDevices.includes(model)) {
        let values2
        if (value == "0") {
          values2 = "0";   // off
        } else {
          values2 = "100"; // on
        }
        this.setStateCoap("D03-05", values2, this.getSettings());
      }  
      else {  
        this.setStateCoap("uil", value, this.getSettings());
      }
      return value;
    });

    this.registerCapabilityListener('purifier_mode', async (value) => {
      this.setStateCoap("mode", value, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('display_mode', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices = ['AC0850/11', 'AC1715/11']
      if (newCoapDevices.includes(model)) {
        let values2
        if (value == '1' ) {
          values2 = "PM2.5";
        } else {
          values2 = "IAI";
        }
        this.setStateCoap("D03-02", values2, this.getSettings());
      }  
      else {        
        this.setStateCoap("ddp", value, this.getSettings());
      }  
      return value;
    });

    this.registerCapabilityListener('onoff', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices = ['AC0850/11', 'AC1715/11']
      if (newCoapDevices.includes(model)) {
        let values2
        if (value == true ) {
          values2 = "ON";
        } else {
          values2 = "OFF";
        }
        this.setStateCoap("D03-02", values2, this.getSettings());
      }  
      else {  
        let values;
        if (value == true) {
          values = "1";
        } else {
          values = "0";
        }
        this.setStateCoap("pwr", values, this.getSettings());
      }
      return value;
    });

    this.registerCapabilityListener('child_lock', async (value) => {
      this.setStateCoap("cl", value, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('fan_speed', async (value) => {
      let model = this.getCapabilityValue('product')
      const newCoapDevices = ['AC4236/10', 'AC2958/10', 'AC2939/10', 'AC3858/10', 'AC3033/10', 'AC3059/10']
      const newCoapDevices2 = ['AC0850/11', 'AC1715/11']

      if (newCoapDevices2.includes(model)) {
        if (value == "P") {
          this.setStateCoap("D03-12", 'Auto General', this.getSettings());
        }
        if (value == "1") {
          this.setStateCoap("D03-12", 'Gentle/Speed 1', this.getSettings());
        }  
        if (value == "2") {
          this.setStateCoap("D03-12", 'Speed 2', this.getSettings());
        }  
        if (value == "T") {
          this.setStateCoap("D03-12", 'Turbo', this.getSettings());
        }  
        if (value == "S") {
          this.setStateCoap("D03-12", 'Sleep', this.getSettings());
        }          
        return value;
      }  

      if (value == "AUTO") {
        // auto
        if (newCoapDevices.includes(model)) {
          this.setStateCoap("mode", "AG", this.getSettings());
        } else {
          this.setStateCoap("mode", "P", this.getSettings());
        }
      } else {
        if (value == "s" || value == "t") {
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
      return value;
    });

    this.registerCapabilityListener('timer', async (value) => {
      this.setStateCoap("dt", value, this.getSettings());
      return value;
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('deviceCoap has been added');
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
    this.log('deviceCoap settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('deviceCoap was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('deviceCoap has been deleted');
    this.homey.clearInterval(timer);
  }

}

module.exports = deviceCoap;
