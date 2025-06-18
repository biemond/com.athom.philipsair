import { AirDevice } from '../air';
// sleep time expects milliseconds
function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// const RETRY_INTERVAL = 120 * 1000;
// let timer: NodeJS.Timer;

class deviceHeaterCoap extends AirDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyPhilipsAirHeaterDevice has been inited');
    this.preFilterTriggered = false;
    this.carbonFilterTriggered = false;
    this.hepaFilterTriggered = false;

    this.observerAirCoapDevice();

    this.registerCapabilityListener('light_intensity', async (value) => {
      let model = this.getCapabilityValue('product')
      let values2
      if (value == "0") {
        values2 = 0;   // off
      } else {
        values2 = 100; // on
      }
      this.setStateCoap("D03105", values2, this.getSettings());

      return value;
    });

   this.registerCapabilityListener('heater_mode', async (value) => {
      let model = this.getCapabilityValue('product')
      if (value == "AUTO") {
        await this.setStateCoap("D0310A", 3, this.getSettings());
        await this.setStateCoap("D0310C", 0, this.getSettings());        
      } 
      if (value == "HIGH") {
        await this.setStateCoap("D0310A", 3, this.getSettings());
        await this.setStateCoap("D0310C", 65, this.getSettings());             
      } 
      if (value == "LOW") {
        await this.setStateCoap("D0310A", 3, this.getSettings());
        await this.setStateCoap("D0310C", 66, this.getSettings());             
      } 
      if (value == "VENTILATION") {
        await this.setStateCoap("D0310A", 1, this.getSettings());
        await this.setStateCoap("D0310C", -127, this.getSettings());             
      }             

      return value;
    });

   this.registerCapabilityListener('heater_speed', async (value) => {
      let model = this.getCapabilityValue('product')
      if (value == "HIGH") {
        await this.setStateCoap("D0310A", 3, this.getSettings());
        await this.setStateCoap("D0310C", 65, this.getSettings());             
      } 
      if (value == "LOW") {
        await this.setStateCoap("D0310A", 3, this.getSettings());
        await this.setStateCoap("D0310C", 66, this.getSettings());             
      } 
      return value;
    });

   this.registerCapabilityListener('target_temperature', async (value) => {
      let model = this.getCapabilityValue('product')
      this.log('target_temperature ' + value);
      await this.setStateCoap("D0310A", 3, this.getSettings());
      // await this.setStateCoap("D0310C", 0, this.getSettings());   
      await this.setStateCoap("D0310E", value, this.getSettings());
      return value;
    });


    this.registerCapabilityListener('onoff', async (value) => {
      let model = this.getCapabilityValue('product')
      let values;

      if (value == true) {
        values = 1;
      } else {
        values = 0;
      }
      this.setStateCoap("D03102", values, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('beep', async (value) => {
      let model = this.getCapabilityValue('product')
      let values;

      if (value == true) {
        values = 100;
      } else {
        values = 0;
      }
      this.setStateCoap("D03130", values, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('swing', async (value) => {
      this.log('swing ' + value);
      this.setStateCoap("D0320F", Number(value), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('fan_speed', async (value) => {
      let model = this.getCapabilityValue('product')

      if (value == "1") {
        await this.setStateCoap("D0310C", 1, this.getSettings());
      }
      if (value == "2") {
        await this.setStateCoap("D0310C", 2, this.getSettings());
      }
      if (value == "s") {
        await this.setStateCoap("D0310C", 17, this.getSettings());
      }
      if (value == "AUTO") {
        await this.setStateCoap("D0310C", 0, this.getSettings());
      }
      if (value == "t") {
        await this.setStateCoap("D0310C", 18, this.getSettings());
      }
      return value;
    });

    this.registerCapabilityListener('timer', async (value) => {
      let model = this.getCapabilityValue('product')
      this.setStateCoap("D03110", Number(value), this.getSettings());
      return value;
    });

  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('deviceHeaterCoap has been added');
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
    this.log('deviceHeaterCoap settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('deviceHeaterCoap was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('deviceHeaterCoap has been deleted');
    // this.homey.clearInterval(timer);
  }

}

module.exports = deviceHeaterCoap;
