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
    const newCoapDevices = ['AC4236/10', 'AC2958/10', 'AC2939/10', 'AC3858/10', 'AC3033/10','AC3033/14','AC3036/10','AC3039/10', 'AC3059/10','AC4236/14']
    const newCoapDevices2 = ['AC0850/11', 'AC1715/11', 'AC1715/10']
    const newCoapDevices3 = ['AC3737/10', 'AMF765/10','AC3421/13','AMF870/15','AC4221/11','AC4220/12','AC3220/10','AC0950/10']  

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

    let childlockAction = this.homey.flow.getActionCard('child_lock');
    childlockAction.registerRunListener((args, state) => {
      if (coapDevices.includes(args.device.constructor.name)) {
        let model = args.device.getCapabilityValue('product')
        if (newCoapDevices3.includes(model)) {
          let values;
          if (args.mode == true) {
            values = 1;
          } else {
            values = 0;
          }
          args.device.setStateCoap("D03103", values, args.device.getSettings());
        } else {
          args.device.setStateCoap("cl", args.mode, args.device.getSettings());
        }
      } else {
        let values = { "cl": args.mode }
        args.device.setState(JSON.stringify(values), args.device.getSettings());
      }
      return Promise.resolve(true);
    })

    // this.registerCapabilityListener('child_lock', async (value) => {
    //   let model = this.getCapabilityValue('product')      
    //   const newCoapDevices2 = ['AC3737/10','AMF765/10','AC3421/13']       
    //   if (newCoapDevices2.includes(model)) {
    //     let values;
    //     if (value == true) {
    //       values = 1;
    //     } else {
    //       values = 0;
    //     }
    //     this.setStateCoap("D03103", values, this.getSettings());
    //   }  else {  
    //     this.setStateCoap("cl", value, this.getSettings());
    //   }
    //   return value;
    // });

    let fanSpeedAction = this.homey.flow.getActionCard('fan_speed');
    fanSpeedAction.registerRunListener(async (args, state) => {
      this.log('---');
      this.log(args.device.constructor.name);
      this.log(args.device.getCapabilityValue('product'));
      this.log('---');
      let model = args.device.getCapabilityValue('product')


      if (newCoapDevices2.includes(model)) {
        if (args.mode == "AUTO") {
          await args.device.setStateCoap("D03-12", 'Auto General', args.device.getSettings());
        }
        if (args.mode == "t") {
          await args.device.setStateCoap("D03-12", 'Turbo', args.device.getSettings());
        }
        if (args.mode == "s") {
          await args.device.setStateCoap("D03-12", 'Sleep', args.device.getSettings());
        }
      } else  if (newCoapDevices3.includes(model)) {
        if (args.mode == "1") {
          await args.device.setStateCoap("D0310C", 1, args.device.getSettings());
        }
        if (args.mode == "2") {
          await args.device.setStateCoap("D0310C", 2, args.device.getSettings());
        }
        if (args.mode == "s") {
          await args.device.setStateCoap("D0310C", 17, args.device.getSettings());
        }
        if (args.mode == "AUTO") {
          await args.device.setStateCoap("D0310C", 0, args.device.getSettings());
        }
        if (args.mode == "t") {
          await args.device.setStateCoap("D0310C", 18, args.device.getSettings());
        }       
      } else if (coapDevices.includes(args.device.constructor.name)) {
        if (args.mode == "AUTO") {
          // auto
          if (newCoapDevices.includes(model)) {
            await args.device.setStateCoap("mode", "AG", args.device.getSettings());
          } else {
            await args.device.setStateCoap("mode", "P", args.device.getSettings());
          }
        } else {
          if (args.mode == "s" || args.mode == "t" || args.mode == "as") {
            // turbo / sleep
            if (newCoapDevices.includes(model)) {
              await args.device.setStateCoap("mode", args.mode.toUpperCase(), args.device.getSettings());
              await args.device.setStateCoap("om", args.mode, args.device.getSettings());
            } else {
              await args.device.setStateCoap("mode", "M", args.device.getSettings());
              await args.device.setStateCoap("om", args.mode, args.device.getSettings());
            }
          } else {
            await args.device.setStateCoap("mode", "M", args.device.getSettings());
            await args.device.setStateCoap("om", args.mode, args.device.getSettings());
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

      let model = args.device.getCapabilityValue('product') 
      if (newCoapDevices3.includes(model)) {  
        let values2
        if (args.mode == "0") {
          values2 = 0;   // off
        } else {
          values2 = 100; // on
        }
        args.device.setStateCoap("D03105", values2, args.device.getSettings());
      } else if (coapDevices.includes(args.device.constructor.name)) {
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
      } else if (newCoapDevices3.includes(model)) {
        args.device.setStateCoap("D03102", 1, args.device.getSettings());
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
      } else if (newCoapDevices3.includes(model)) {
        args.device.setStateCoap("D03102", 0, args.device.getSettings());        
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