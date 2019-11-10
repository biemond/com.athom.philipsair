'use strict';
'use math';

const Homey = require('homey');

class deviceDriver extends Homey.Driver {
	
	onInit() {
		this.log('Device driver has been inited');
	}

	onPair(socket) {

        // this is called when the user presses save settings button in pair.html
        socket.on('get_devices', (device_data, callback) => {
			this.log("back from the pairing page")
            callback(null, device_data);
        });

        // this happens when user clicks away the pairing windows
        socket.on('disconnect', () => {
            this.log("PhilipsAir - Pairing is finished (done or aborted) ");
        })

    } // end onPair
}

module.exports = deviceDriver;