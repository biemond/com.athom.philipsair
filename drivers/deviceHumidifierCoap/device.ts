import { AirDevice } from '../air';

// Philips 1000 series humidifiers (HU1510/03, HU1509/00) on the CoAP "D03xxx" protocol.
// Key mapping verified against kongo09/philips-airpurifier-coap (PhilipsHU1509 / PhilipsHU1510).

// D0310C: humidification speed
const MODE_TO_DEVICE: { [key: string]: number } = { AUTO: 0, SLEEP: 17, MEDIUM: 19, HIGH: 65 };
const DEVICE_TO_MODE: { [key: number]: string } = { 0: 'AUTO', 17: 'SLEEP', 19: 'MEDIUM', 65: 'HIGH' };

// D03240 error code: bit 8 set means the water tank is empty / removed
const ERROR_NO_WATER_BIT = 1 << 8;

// D03110 timer: 0 = off, 2 = 1h ... 13 = 12h (the value 1 is not used by this model)
function timerHoursToDevice(hours: number): number {
  return hours <= 0 ? 0 : hours + 1;
}
function timerDeviceToHours(value: number): number {
  return value <= 1 ? 0 : value - 1;
}

class deviceHumidifierCoap extends AirDevice {

  private lastHumidity: number | undefined;

  async onInit() {
    this.log('deviceHumidifierCoap has been initialized');

    for (const cap of ['humidifier_mode', 'standby_sensors', 'error', 'water_level']) {
      if (this.hasCapability(cap) === false) {
        await this.addCapability(cap);
      }
    }

    this.observerAirCoapDevice();

    const onoffCondition = this.homey.flow.getConditionCard('on_off');
    onoffCondition.registerRunListener(async (args) => {
      return Number(await args.device.getCapabilityValue('onoff')) === Number(args.argument_main);
    });

    this.registerCapabilityListener('onoff', async (value) => {
      await this.setStateCoap('D03102', value ? 1 : 0, this.getSettings());
      this.homey.flow.getDeviceTriggerCard('onoff').trigger(this, { onoff: value }).catch(this.error);
      return value;
    });

    this.registerCapabilityListener('humidifier_mode', async (value) => {
      await this.setHumidifierMode(value);
      return value;
    });

    this.registerCapabilityListener('target_humidity', async (value) => {
      await this.setStateCoap('D03128', Number(value), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('light_intensity', async (value) => {
      // 0 = off, 115 = low, 123 = bright
      const allowed = [0, 115, 123];
      const brightness = allowed.includes(Number(value)) ? Number(value) : 123;
      await this.setStateCoap('D03105', brightness, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('light_mode', async (value) => {
      await this.setStateCoap('D03135', Number(value), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('light_ambient_mode', async (value) => {
      await this.setStateCoap('D03137', Number(value), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('timer', async (value) => {
      await this.setStateCoap('D03110', timerHoursToDevice(Number(value)), this.getSettings());
      return value;
    });

    this.registerCapabilityListener('beep', async (value) => {
      await this.setStateCoap('D03130', value ? 100 : 0, this.getSettings());
      return value;
    });

    this.registerCapabilityListener('standby_sensors', async (value) => {
      await this.setStateCoap('D03134', value ? 1 : 0, this.getSettings());
      return value;
    });
  }

  async setHumidifierMode(mode: string) {
    const deviceValue = MODE_TO_DEVICE[mode];
    if (deviceValue === undefined) throw new Error(`Unknown humidifier mode ${mode}`);
    // selecting a mode also switches the device on
    await this.setStateCoap('D03102', 1, this.getSettings());
    await this.setStateCoap('D0310C', deviceValue, this.getSettings());
  }

  async setTargetHumidity(value: number) {
    await this.setStateCoap('D03128', Number(value), this.getSettings());
  }

  /**
   * The shared parser in air.js interprets a few keys differently for other models
   * (timer, error code). Handle those here and pass the rest on.
   */
  handleDeviceStatus(json: any, settings: any) {
    if (json == null) return;
    const shared = { ...json };
    delete shared.D03110; // timer, offset encoding on this model
    delete shared.D03240; // error code, bit field on this model
    delete shared.D0310C; // speed, handled as humidifier_mode
    super.handleDeviceStatus(shared, settings);

    this.updateCapability('measure_humidity_trigger', json.D03125);

    if (json.hasOwnProperty('D0310C')) {
      const mode = DEVICE_TO_MODE[json.D0310C];
      if (mode) this.updateCapability('humidifier_mode', mode);
      else this.log(`Unknown humidifier speed D0310C=${json.D0310C}`);
    }

    if (json.hasOwnProperty('D03110')) {
      this.updateCapability('timer', timerDeviceToHours(Number(json.D03110)).toString());
    }

    if (json.hasOwnProperty('D03134')) {
      this.updateCapability('standby_sensors', json.D03134 == 1);
    }

    if (json.hasOwnProperty('D03224') && this.hasCapability('measure_temperature') === false) {
      // only some firmware versions report a temperature
      this.addCapability('measure_temperature')
        .then(() => this.setCapabilityValue('measure_temperature', json.D03224 / 10))
        .catch(this.error);
    }

    if (json.hasOwnProperty('D03240')) {
      const code = Number(json.D03240);
      const noWater = (code & ERROR_NO_WATER_BIT) !== 0;
      this.updateCapability('water_level', noWater ? 'Empty' : 'Ok');
      let error = '-';
      if (noWater) error = 'no water';
      else if (code !== 0) error = `error ${code}`;
      this.updateCapability('error', error);
    }
  }

  /** Set a capability only when it changed, firing the matching flow triggers. */
  updateCapability(capability: string, value: any) {
    if (value === undefined || value === null) return;

    if (capability === 'measure_humidity_trigger') {
      // measure_humidity itself is set by the shared parser; this only fires the trigger
      if (this.lastHumidity !== value) {
        this.lastHumidity = value;
        this.homey.flow.getDeviceTriggerCard('measure_humidity_changed')
          .trigger(this, { measure_humidity: Number(value) }).catch(this.error);
      }
      return;
    }

    if (!this.hasCapability(capability)) return;
    if (this.getCapabilityValue(capability) === value) return;
    this.setCapabilityValue(capability, value).catch(this.error);

    if (capability === 'water_level') {
      this.homey.flow.getDeviceTriggerCard('water_level_changed')
        .trigger(this, { water_level: value }).catch(this.error);
    }
  }

  async onAdded() {
    this.log('deviceHumidifierCoap has been added');
  }

  async onSettings({ oldSettings: { }, newSettings: { }, changedKeys: { } }): Promise<string | void> {
    this.log('deviceHumidifierCoap settings were changed');
  }

  async onRenamed(name: string) {
    this.log('deviceHumidifierCoap was renamed');
  }

  async onDeleted() {
    this.stopAirCoapDevice();
    this.log('deviceHumidifierCoap has been deleted');
  }

}

module.exports = deviceHumidifierCoap;
