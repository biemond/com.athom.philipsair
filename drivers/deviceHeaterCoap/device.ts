import { AirDevice, HEATER_MODES, heaterTimerFromHours } from '../air';

class deviceHeaterCoap extends AirDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyPhilipsAirHeaterDevice has been inited');

    if (this.hasCapability('measure_power') === false) {
      await this.addCapability('measure_power');
    }

    if (this.hasCapability('child_lock') === false) {
      await this.addCapability('child_lock');
    }

    if (this.hasCapability('timer_remaining') === false) {
      await this.addCapability('timer_remaining');
    }

    if (this.hasCapability('meter_power') === false) {
      await this.addCapability('meter_power');
    }

    if (this.hasCapability('heater_status') === false) {
      await this.addCapability('heater_status');
    }

    // the CX3 heaters have no display backlight (D03105), so this control did nothing
    if (this.hasCapability('light_intensity')) {
      await this.removeCapability('light_intensity');
    }

    if (this.getClass() !== 'heater') {
      await this.setClass('heater').catch(this.error);
    }

    this.preFilterTriggered = false;
    this.carbonFilterTriggered = false;
    this.hepaFilterTriggered = false;

    this.observerAirCoapDevice();

    this.registerCapabilityListener('heater_mode', async (value) => {
      await this.setStateCoapValues(HEATER_MODES[value as keyof typeof HEATER_MODES]);
    });

    this.registerCapabilityListener('heater_speed', async (value) => {
      await this.setStateCoapValues(HEATER_MODES[value as keyof typeof HEATER_MODES]);
    });

    this.registerCapabilityListener('target_temperature', async (value) => {
      await this.setStateCoapValues({ D0310A: 3, D0310E: value });
    });

    // on/off state condition
    const onoffCondition = this.homey.flow.getConditionCard('on_off');
    onoffCondition.registerRunListener(async (args, state) => {
      return Number(await args.device.getCapabilityValue('onoff')) === Number(args.argument_main);
    });

    this.registerCapabilityListener('onoff', async (value) => {
      await this.setStateCoapValues({ D03102: value ? 1 : 0 });
      this.homey.flow.getDeviceTriggerCard('onoff').trigger(this, { 'onoff': value }).catch(this.error);
    });

    this.registerCapabilityListener('beep', async (value) => {
      await this.setStateCoapValues({ D03130: value ? 100 : 0 });
    });

    this.registerCapabilityListener('swing', async (value) => {
      await this.setStateCoapValues({ D0320F: Number(value) });
    });

    this.registerCapabilityListener('child_lock', async (value) => {
      await this.setStateCoapValues({ D03103: value ? 1 : 0 });
    });

    this.registerCapabilityListener('timer', async (value) => {
      await this.setStateCoapValues({ D03110: heaterTimerFromHours(value) });
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
  async onSettings({ changedKeys }: { oldSettings: object, newSettings: object, changedKeys: string[] }): Promise<string | void> {
    this.log('deviceHeaterCoap settings where changed');
    if (changedKeys.includes('ipkey')) {
      // new settings are stored after this returns
      this.homey.setTimeout(() => this.restartObservingCoapDevice(), 1000);
    }
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
    this.stopObservingCoapDevice();
  }

}

module.exports = deviceHeaterCoap;
