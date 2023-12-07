import Homey from 'homey';

const philipsair = require('./drivers/philipsair');
const AirDevice = require('./drivers/air');

// sleep time expects milliseconds
function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}


class MyApp extends Homey.App {

  async onInit() {
    this.log('philipsair is running...');
    const coapDevices = ['deviceCoap', 'deviceCoap2']
    const newCoapDevices = ['AC4236/10', 'AC2958/10', 'AC2939/10', 'AC3858/10', 'AC3033/10', 'AC3059/10']
    const newCoapDevices2 = ['AC0850/11', 'AC1715/11']
    const newCoapDevices3 = ['AC3737/10']

    let purifierModeAction = this.homey.flow.getActionCard('purifier_mode');
    purifierModeAction.registerRunListener((args, state) => {
      if (coapDevices.includes(args.device.constructor.name)) {
        args.device.setStateCoap("mode", args.mode, args.device.getSettings());
      } else {
        let values = { "mode": args.mode }
        args.device.setState(JSON.stringify(values), args.device.getSettings());
      }
      return Promise.resolve(true);
    })

    let fanSpeedAction = this.homey.flow.getActionCard('fan_speed');
    fanSpeedAction.registerRunListener((args, state) => {
      this.log('---');
      this.log(args.device.constructor.name);
      this.log(args.device.getCapabilityValue('product'));
      this.log('---');
      let model = args.device.getCapabilityValue('product')


      if (newCoapDevices2.includes(model)) {
        if (args.mode == "AUTO") {
          args.device.setStateCoap("D03-12", 'Auto General', args.device.getSettings());
        }
        if (args.mode == "t") {
          args.device.setStateCoap("D03-12", 'Turbo', args.device.getSettings());
        }
        if (args.mode == "s") {
          args.device.setStateCoap("D03-12", 'Sleep', args.device.getSettings());
        }
      } else if (coapDevices.includes(args.device.constructor.name)) {
        if (args.mode == "AUTO") {
          // auto
          if (newCoapDevices.includes(model)) {
            args.device.setStateCoap("mode", "AG", args.device.getSettings());
          } else {
            args.device.setStateCoap("mode", "P", args.device.getSettings());
          }
        } else {
          if (args.mode == "s" || args.mode == "t") {
            // turbo / sleep
            if (newCoapDevices.includes(model)) {
              args.device.setStateCoap("mode", args.mode.toUpperCase(), args.device.getSettings());
              sleep(2000).then(() => {
                args.device.setStateCoap("om", args.mode, args.device.getSettings());
              });
            } else {
              args.device.setStateCoap("mode", "M", args.device.getSettings());
              sleep(2000).then(() => {
                args.device.setStateCoap("om", args.mode, args.device.getSettings());
              });
            }
          } else {
            args.device.setStateCoap("mode", "M", args.device.getSettings());
            sleep(2000).then(() => {
              args.device.setStateCoap("om", args.mode, args.device.getSettings());
            });
          }
        }
      } else {
        let values = { "mode": "M" };
        args.device.setState(JSON.stringify(values), args.device.getSettings());
        sleep(2000).then(() => {
          let values = { "om": args.mode }
          args.device.setState(JSON.stringify(values), args.device.getSettings());
        });
      }
      return Promise.resolve(true);
    })

    let lightIntensityAction = this.homey.flow.getActionCard('light_intensity');
    lightIntensityAction.registerRunListener((args, state) => {
      this.log('---');
      this.log(args.device.constructor.name);
      this.log('---');
      if (coapDevices.includes(args.device.constructor.name)) {
        args.device.setStateCoap("aqil", parseInt(args.mode), args.device.getSettings());
      } else {
        let values = { "aqil": 50 };
        args.device.setState(JSON.stringify(values), args.device.getSettings());
        sleep(2000).then(() => {
          let values = { "aqil": parseInt(args.mode) };
          args.device.setState(JSON.stringify(values), args.device.getSettings());
        });
      }
      return Promise.resolve(true);
    })

    let onAction = this.homey.flow.getActionCard('on');
    onAction.registerRunListener((args, state) => {
      let model = args.device.getCapabilityValue('product')
      if (newCoapDevices2.includes(model)) {
        args.device.setStateCoap("D03-02", "ON", args.device.getSettings());
      } else if (newCoapDevices3.includes(args.device.constructor.name)) {
        args.device.setStateCoap("D03102", "1", args.device.getSettings());
      } else if (coapDevices.includes(args.device.constructor.name)) {
        args.device.setStateCoap("pwr", "1", args.device.getSettings());
      } else {
        let values = { "pwr": "1" }
        args.device.setState(JSON.stringify(values), args.device.getSettings());
      }
      return Promise.resolve(true);
    })

    let offAction = this.homey.flow.getActionCard('off');
    offAction.registerRunListener((args, state) => {
      let model = args.device.getCapabilityValue('product')
      if (newCoapDevices2.includes(model)) {
        args.device.setStateCoap("D03-02", "OFF", args.device.getSettings());
      } else if (newCoapDevices3.includes(args.device.constructor.name)) {
        args.device.setStateCoap("D03102", "0", args.device.getSettings());        
      } else if (coapDevices.includes(args.device.constructor.name)) {
        args.device.setStateCoap("pwr", "0", args.device.getSettings());
      } else {
        let values = { "pwr": "0" }
        args.device.setState(JSON.stringify(values), args.device.getSettings());
      }
      return Promise.resolve(true);
    })

    let funcModeOnAction = this.homey.flow.getActionCard('func_mode_on');
    funcModeOnAction.registerRunListener((args, state) => {
      if (coapDevices.includes(args.device.constructor.name)) {
        args.device.setStateCoap("func", "PH", args.device.getSettings());
      } else {
        let values = { "func": "PH" }
        args.device.setState(JSON.stringify(values), args.device.getSettings());
      }
      return Promise.resolve(true);
    })

    let funcModeOffAction = this.homey.flow.getActionCard('func_mode_off');
    funcModeOffAction.registerRunListener((args, state) => {
      if (coapDevices.includes(args.device.constructor.name)) {
        args.device.setStateCoap("func", "P", args.device.getSettings());
      } else {
        let values = { "func": "P" }
        args.device.setState(JSON.stringify(values), args.device.getSettings());
      }
      return Promise.resolve(true);
    })
  }
}

module.exports = MyApp;