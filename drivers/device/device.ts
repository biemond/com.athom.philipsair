const philipsair = require('../philipsair.js');

import { AirDevice } from '../air';
// sleep time expects milliseconds
function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

const RETRY_INTERVAL = 55 * 1000;
let timer: NodeJS.Timer;

class device extends AirDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('device has been initialized');

    this.preFilterTriggered = false;
    this.carbonFilterTriggered = false;
    this.hepaFilterTriggered = false;
    this.log('MyPhilipsAirDevice has been inited');
    let settings = this.getSettings();

    let secretKey = "-";
    philipsair.getInitData(settings).then((data: string) => {
      secretKey = data;
      if (secretKey != "ERROR") {
        let name = this.getData().id;
        this.log("name " + name + " key " + secretKey);
        let cronName = this.getData().id.toLowerCase();
        this.setStoreValue('secretKey' + cronName, secretKey);

        this.pollAirDevice();

        timer = this.homey.setInterval(() => {
          // poll device state from invertor
          this.pollAirDevice();
        }, RETRY_INTERVAL);
    
      } else {
        this.log('failed  to get the shared secret key');
        this.setUnavailable("Not able to get the shared secret key, please re-add the device and check if the IP address exists")
      }
    })

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
      let values = { "aqil": value };
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('button_lights', async (value) => {
      let values = { "uil": value };
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('purifier_mode', async (value) => {
      let values = { "mode": value };
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('display_mode', async (value) => {
      let values = { "ddp": value };
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('onoff', async (value) => {
      let values;
      if (value == true) {
        values = { "pwr": "1" }
      } else {
        values = { "pwr": "0" }
      }
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('child_lock', async (value) => {
      let values = { "cl": value }
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('fan_speed', async (value) => {
      let values = { "mode": "M" };
      this.setState(JSON.stringify(values), this.getSettings());
      sleep(2000).then(() => {
        let values = { "om": value }
        this.setState(JSON.stringify(values), this.getSettings());
      });
      return value;
    });

    this.registerCapabilityListener('timer', async (value) => {
      let values = { "dt": value }
      this.setState(JSON.stringify(values), this.getSettings());
      return value;
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('device has been added');
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
    this.log('device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('device has been deleted');
    this.homey.clearInterval(timer);
  }

}

module.exports = device;
