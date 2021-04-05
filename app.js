'use strict';

const Homey = require('homey');
const philipsair = require('./drivers/philipsair.js');
const AirDevice = require('./drivers/air');

// sleep time expects milliseconds
function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

class MyApp extends Homey.App {
	
	onInit() {
		this.log('philipsair is running...');
		const coapDevices = [ 'deviceCoap', 'deviceCoap2']

        let purifierModeAction = new Homey.FlowCardAction('purifier_mode');
        purifierModeAction.register().registerRunListener(( args, state ) => {
			if(coapDevices.includes( args.device.constructor.name ) ) {
				args.device.setStateCoap("mode", args.mode, args.device.getSettings());
			} else {
				let values = { "mode": args.mode}
				args.device.setState(JSON.stringify(values), args.device.getSettings());
			}
            return Promise.resolve( true );
        })

        let fanSpeedAction = new Homey.FlowCardAction('fan_speed');
        fanSpeedAction.register().registerRunListener(( args, state ) => {
			this.log('---');
            this.log(args.device.constructor.name);
			this.log('---');
			if(coapDevices.includes( args.device.constructor.name ) ) {
				args.device.setStateCoap( "om", args.mode, args.device.getSettings());
			} else {
				let values = { "mode": "M"};
				args.device.setState(JSON.stringify(values), args.device.getSettings());
				sleep(2000).then(() => {
				   let values = { "om": args.mode}
				   args.device.setState(JSON.stringify(values), args.device.getSettings());
				});				
			}
            return Promise.resolve( true );
        })

        let onAction = new Homey.FlowCardAction('on');
        onAction.register().registerRunListener(( args, state ) => {
			if(coapDevices.includes( args.device.constructor.name ) ) {
				args.device.setStateCoap( "pwr", "1", args.device.getSettings());
			} else {
				let values = { "pwr": "1"}
				args.device.setState(JSON.stringify(values), args.device.getSettings());
			}
            return Promise.resolve( true );
        })
        
        let offAction = new Homey.FlowCardAction('off');
        offAction.register().registerRunListener(( args, state ) => {
			if(coapDevices.includes( args.device.constructor.name ) ) {
				args.device.setStateCoap("pwr", "0", args.device.getSettings());
			} else {
				let values = { "pwr": "0"}
				args.device.setState(JSON.stringify(values), args.device.getSettings());
			}
            return Promise.resolve( true );
        })

        let funcModeOnAction = new Homey.FlowCardAction('func_mode_on');
        funcModeOnAction.register().registerRunListener(( args, state ) => {
			if(coapDevices.includes( args.device.constructor.name ) ) {
				args.device.setStateCoap( "func", "PH", args.device.getSettings());
			} else {
				let values = { "func": "PH"}
				args.device.setState(JSON.stringify(values), args.device.getSettings());
			}
            return Promise.resolve( true );
        })
        
        let funcModeOffAction = new Homey.FlowCardAction('func_mode_off');
        funcModeOffAction.register().registerRunListener(( args, state ) => {
			if(coapDevices.includes( args.device.constructor.name ) ) {
				args.device.setStateCoap("func", "P", args.device.getSettings());
			} else {
				let values = { "func": "P"}
				args.device.setState(JSON.stringify(values), args.device.getSettings());
			}
            return Promise.resolve( true );
        })

	}


}

module.exports = MyApp;