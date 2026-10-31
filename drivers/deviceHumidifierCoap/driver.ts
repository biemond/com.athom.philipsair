import Homey from 'homey';

const coapclass = require('node-coap-client');
const origin = require('node-coap-client/build/lib/Origin');

const DEFAULT_NAME = 'Philips humidifier';
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

class deviceHumidifierCoapDriver extends Homey.Driver {

  async onInit() {
    this.log('deviceHumidifierCoapDriver has been initialized');
  }

  /**
   * Pairing: "configure" (IP address + name) -> list_devices -> add_devices.
   */
  async onPair(session: any) {
    let ipkey = '';
    let name = DEFAULT_NAME;

    session.setHandler('configure', async (data: { ipkey: string, name: string }) => {
      const ip = String(data.ipkey || '').trim();
      if (!IPV4.test(ip)) {
        throw new Error(this.homey.__('pair.start.invalidIp'));
      }
      const alreadyAdded = this.getDevices().some((device) => device.getSettings().ipkey === ip);
      if (alreadyAdded) {
        throw new Error(this.homey.__('pair.start.alreadyAdded'));
      }
      await this.checkReachable(ip);

      ipkey = ip;
      name = String(data.name || '').trim() || DEFAULT_NAME;
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!ipkey) return [];
      return [{
        name,
        data: {
          id: Math.random().toString(36).substr(2, 5).toLowerCase(),
          ipkey,
        },
        settings: {
          ipkey,
        },
      }];
    });
  }

  async checkReachable(ip: string) {
    const target = new origin.Origin('coap:', ip, 5683);
    const coap = coapclass.CoapClient;
    try {
      const result = await coap.tryToConnect(target);
      if (result !== true) {
        throw new Error(String(result));
      }
    } catch (error) {
      this.error(`Humidifier at ${ip} not reachable`, error);
      throw new Error(this.homey.__('pair.start.unreachable', { ip }));
    } finally {
      coap.reset(target);
    }
  }

}

module.exports = deviceHumidifierCoapDriver;
