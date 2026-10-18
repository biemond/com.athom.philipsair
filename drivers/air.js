import Homey from 'homey';

const philipsair = require('./philipsair.js');
const philipsairCoap = require('./philipsairCoap.js');

const MINUTE = 60000;

// Heating status from D0313F (what the heater is actually doing): 65/67/66 = high/medium/low, -16 = idle at target, 0 = fan only
const HEATER_LEVEL_STATUS = { '65': 'heating_high', '67': 'heating_medium', '66': 'heating_low', '-16': 'idle', '0': 'fan', '-127': 'fan' };
const HEATER_STATUS_TITLES = {
    heating_high: 'Heating high', heating_medium: 'Heating medium', heating_low: 'Heating low',
    idle: 'Idle, target reached', fan: 'Fan only', off: 'Off',
};
// CX3120 ratings; the device does not report power itself
const HEATER_STATUS_WATTS = { heating_high: 2000, heating_medium: 1200, heating_low: 900, idle: 9, fan: 9, off: 1 };
// do not count energy across a gap in status updates longer than this
const ENERGY_MAX_GAP = 5 * MINUTE;

function heaterStatus(json) {
    if (json["D03102"] !== 1) return 'off';
    let level;
    if (json.hasOwnProperty('D0313F')) {
        level = json["D0313F"];
    } else {
        // older firmware without heating status: assume the selected level, auto as high
        level = json["D0310C"] === 0 ? 65 : json["D0310C"];
    }
    return HEATER_LEVEL_STATUS[level] || 'idle';
}

// Heater timer D03110 is an index: 0 = off, 1 = 30 min, 2 = 1 h, 3 = 2 h, ... (+1 h per step).
// The Homey timer capability is in whole hours.
export function heaterTimerFromHours(hours) {
    const h = Number(hours);
    return h > 0 ? h + 1 : 0;
}

function heaterTimerToHours(index) {
    // 30 minutes has no Homey option; shown as 1 hour, timer_remaining has the exact minutes
    return String(index > 1 ? index - 1 : index);
}

// D0310A = mode type (3 = heating, 1 = fan only), D0310C = heating level (0 = auto thermostat)
export const HEATER_MODES = {
    AUTO: { D0310A: 3, D0310C: 0 },
    HIGH: { D0310A: 3, D0310C: 65 },
    MEDIUM: { D0310A: 3, D0310C: 67 },
    LOW: { D0310A: 3, D0310C: 66 },
    VENTILATION: { D0310A: 1, D0310C: -127 },
};

export class AirDevice extends Homey.Device {

    async onUninit() {
        philipsairCoap.stop(this);
    }

    // Homey apps run in UTC; show the time in the Homey's own timezone.
    formatRetrievalTime() {
        const now = new Date();
        try {
            return now.toLocaleTimeString('en-GB', { timeZone: this.homey.clock.getTimezone(), hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            return now.toISOString().substring(11, 16);
        }
    }

    // Sets a capability only when present and changed; never throws.
    updateCapability(capability, value) {
        if (!this.hasCapability(capability) || value === undefined || value === null) return;
        if (this.getCapabilityValue(capability) === value) return;
        this.setCapabilityValue(capability, value).catch((error) => this.error(`${capability}:`, error.message));
    }

    updateHeaterPower(json) {
        if (!this.hasCapability('measure_power') || !this.hasCapability('heater_mode')) return;
        const status = heaterStatus(json);
        const watts = HEATER_STATUS_WATTS[status];
        this.addHeaterEnergy(watts);
        this.updateCapability('measure_power', watts);
        this.updateHeaterStatus(status);
    }

    // Integrates the estimated power into meter_power (kWh).
    addHeaterEnergy(watts) {
        if (!this.hasCapability('meter_power')) return;
        const now = Date.now();
        if (this.energyKwh === undefined) {
            this.energyKwh = this.getCapabilityValue('meter_power') || 0;
        }
        if (this.lastPowerAt && now - this.lastPowerAt <= ENERGY_MAX_GAP) {
            this.energyKwh += this.lastWatts * (now - this.lastPowerAt) / 3600000 / 1000;
        }
        this.lastPowerAt = now;
        this.lastWatts = watts;
        this.updateCapability('meter_power', Math.round(this.energyKwh * 100) / 100);
    }

    updateHeaterStatus(status) {
        if (!this.hasCapability('heater_status')) return;
        const previous = this.getCapabilityValue('heater_status');
        if (previous === status) return;
        this.updateCapability('heater_status', status);
        if (!previous) return; // first value, nothing changed from the user's point of view

        const heating = status.startsWith('heating');
        const wasHeating = previous.startsWith('heating');
        const trigger = (id, tokens) => this.homey.flow.getDeviceTriggerCard(id).trigger(this, tokens)
            .catch((error) => this.error(`${id}:`, error.message));
        trigger('heater_status_changed', { status: HEATER_STATUS_TITLES[status], heating });
        if (heating && !wasHeating) trigger('heater_started_heating', {});
        if (status === 'idle' && wasHeating) trigger('heater_reached_target', {});
    }

    // flow triggers
    flowTriggerFilterReplaceClean(tokens, state) {
        this.log("trigger fired");
        this.homey.flow.getDeviceTriggerCard('filter_replace_clean').trigger(this, tokens, state)
            .then(this.log("flowTriggerFilterReplaceClean"))
            .catch(this.error)
        return this;
    }

    setState(value, settings) {
        this.log('setState:', value);
        //   let settings = this.getSettings();
        this.log(settings);

        let deviceSecret = this.getStoreValue('secretKey' + settings.id);
        // this.log(this);
        this.log(deviceSecret);
        settings.secretkey = deviceSecret;
        this.log(settings)

        philipsair.setValueAirData(value, settings).then(data => {
            this.log("-setValueAirData-begin-");
            this.log(data);
            this.handleDeviceStatus(data);
            this.log("-setValueAirData-end-");
            return value
        })
    }

    // Legacy single-key send used by the purifier drivers, often without await: logs failures instead of rejecting.
    setStateCoap(key, value, settings) {
        return this.setStateCoapValues({ [key]: value })
            .then(() => true)
            .catch((error) => {
                this.error(`setStateCoap ${key} failed:`, error.message);
                return false;
            });
    }

    // Sends several keys in a single message; resolves once the device has answered, rejects on failure.
    setStateCoapValues(values) {
        return philipsairCoap.setValues(this, values);
    }

    observerAirCoapDevice() {
        philipsairCoap.start(this);
    }

    stopObservingCoapDevice() {
        philipsairCoap.stop(this);
    }

    restartObservingCoapDevice() {
        philipsairCoap.restart(this);
    }

    conditionScoreIaqlToString(index) {
        if (index > 9) {
            return 'verypoor';
        } else if (index > 6) {
            return 'poor';
        } else if (index > 3) {
            return 'fair';
        } else {
            return 'good';
        }
    }

    conditionScorePm25lToString(index) {
        if (index > 55) {
            return 'verypoor';
        } else if (index > 35) {
            return 'poor';
        } else if (index > 12) {
            return 'fair';
        } else {
            return 'good';
        }
    }



    handleDeviceStatus(json, settings) {
        if (json != null) {
            this.updateCapability('latest_retrieval_date', this.formatRetrievalTime());

            if (json.hasOwnProperty('pwr')) {
                if (json.pwr == '1') {
                    this.updateCapability('onoff', true);
                } else {
                    this.updateCapability('onoff', false);
                }
            }
            if (json.hasOwnProperty('D03-02')) {
                if (json["D03-02"] == 'ON') {
                    this.updateCapability('onoff', true);
                } else {
                    this.updateCapability('onoff', false);
                }
            }
            if (json.hasOwnProperty("D03102")) {
                // let oldValue = 0;
                // if (this.getCapabilityValue('onoff')){
                //     oldValue = 1;
                // }
                if (json["D03102"] == 1) {
                    this.updateCapability('onoff', true);
                } else {
                    this.updateCapability('onoff', false);
                }
                // // if (oldValue != json["D03102"]) {
                // const tokens = {
                //     'onoff': json["D03102"] == 1 ? true : false
                // };
                // this.homey.flow.getDeviceTriggerCard('onoff').trigger(this, tokens);  
            }


            if (json.hasOwnProperty('pm25')) {
                if (this.hasCapability('measure_pm25')) {
                    this.updateCapability('measure_pm25', json.pm25);
                }
            }

            if (json.hasOwnProperty('D03-33')) {
                if (this.hasCapability('measure_pm25')) {
                    this.updateCapability('measure_pm25', json["D03-33"]);
                }
            }

            if (json.hasOwnProperty('D03221')) {
                if (this.hasCapability('measure_pm25')) {
                    this.updateCapability('measure_pm25', json["D03221"]);
                }
            }


            if (json.hasOwnProperty('tvoc')) {
                if (this.hasCapability('measure_tvoc')) {
                    this.updateCapability('measure_tvoc', json.tvoc);
                }
            }

            if (json.hasOwnProperty('D03122')) {
                if (this.hasCapability('measure_tvoc')) {
                    this.updateCapability('measure_tvoc', json["D03122"]);
                }
            }


            if (json.hasOwnProperty('rh')) {
                if (this.hasCapability('measure_humidity')) {
                    this.updateCapability('measure_humidity', json.rh);
                }
            }
            if (json.hasOwnProperty('D03125')) {
                if (this.hasCapability('measure_humidity')) {
                    this.updateCapability('measure_humidity', json["D03125"]);
                }
            }

            if (json.hasOwnProperty('D03130')) {
                if (this.hasCapability('beep')) {
                    if (json["D03130"] == 100) {
                        this.updateCapability('beep', true);
                    } else {
                        this.updateCapability('beep', false);
                    }
                }
            }
            if (json.hasOwnProperty('D03138')) {
            }

            // Auto QuickDry Mode (D03138):
            // On: "D03138": 1
            // Off: "D03138": 0

            if (json.hasOwnProperty('D03134')) {
            }
            // Sensors Monitor in Standby (D03134):
            // On: "D03134": 1
            // Off: "D03134": 0            

            if (json.hasOwnProperty('D0310C')) {
                const heaterModes = { '0': "AUTO", '65': "HIGH", '67': "MEDIUM", '66': "LOW", '-127': "VENTILATION" };
                const heaterSpeeds = { '65': "HIGH", '67': "MEDIUM", '66': "LOW" };
                this.updateCapability('heater_mode', heaterModes[json["D0310C"]]);
                this.updateCapability('heater_speed', heaterSpeeds[json["D0310C"]]);
                this.updateHeaterPower(json);
            }

            if (json.hasOwnProperty('D0320F')) {
                if (this.hasCapability('swing')) {
                    this.updateCapability('swing', json["D0320F"].toString());
                }
            }

            if (json.hasOwnProperty('rhset')) {
                if (this.hasCapability('target_humidity')) {
                    this.updateCapability('target_humidity', json.rhset.toString());
                }
            }

            if (json.hasOwnProperty('D03128')) {
                if (this.hasCapability('target_humidity')) {
                    this.updateCapability('target_humidity', json["D03128"].toString());
                }
            }


            if (json.hasOwnProperty('D0310E')) {
                if (this.hasCapability('target_temperature')) {
                    this.updateCapability('target_temperature', json["D0310E"]);
                }
            }

            if (json.hasOwnProperty('iaql')) {
                if (this.hasCapability('measure_iaql')) {
                    this.updateCapability('measure_iaql', json.iaql);
                }
            }
            if (json.hasOwnProperty('D03-32')) {
                if (this.hasCapability('measure_iaql')) {
                    this.updateCapability('measure_iaql', json["D03-32"]);
                }
            }
            if (json.hasOwnProperty('D03120')) {
                if (this.hasCapability('measure_iaql')) {
                    this.updateCapability('measure_iaql', json["D03120"]);
                }
            }


            if (json.hasOwnProperty('temp')) {
                if (this.hasCapability('measure_temperature')) {
                    this.updateCapability('measure_temperature', json.temp);
                }
            }
            if (json.hasOwnProperty('D03224')) {
                if (this.hasCapability('measure_temperature')) {
                    this.updateCapability('measure_temperature', json["D03224"] / 10);
                }
            }


            if (json.hasOwnProperty('func')) {
                // P or PH
                if (this.hasCapability('func_mode')) {
                    if (json.func == 'P') {
                        this.updateCapability('func_mode', false);
                    } else {
                        this.updateCapability('func_mode', true);
                    }
                }
            }

            try {

                if (json.hasOwnProperty('mode')) {
                    let mode_str = { 'P': 'auto', 'AG': 'auto', 'A': 'allergen', 'S': 'sleep', 'AS': 'sleep allergy', 'M': 'manual', 'B': 'bacteria', 'N': 'night' }
                    this.updateCapability('purifier_mode', json.mode);
                    if (json.mode == 'P' || json.mode == 'AG') {
                        this.updateCapability('fan_speed', 'AUTO');
                    } else {
                        if (json.hasOwnProperty('om')) {
                            let om_str = { '1': 'speed 1', '2': 'speed 2', '3': 'speed 3', 'P': 'AUTO', 'AG': 'AUTO', 'as': 'sleep allergy', 's': 'silent/sleep', 't': 'turbo' }
                            this.updateCapability('fan_speed', json.om);
                        }
                    }
                }
                if (json.hasOwnProperty('D03-12')) {
                    let mode_str = { 'Auto General': 'AUTO', 'Gentle/Speed 1': '1', 'Speed 2': '2', 'Turbo': 't', 'Sleep': 's' }
                    let fan = mode_str[json["D03-12"]];
                    if (fan) {
                        this.updateCapability('fan_speed', fan);
                    }
                }

                if (json.hasOwnProperty('D0310C')) {
                    if (this.hasCapability('fan_speed')) {
                        let mode_str = { '0': 'AUTO', '1': '1', '2': '2', '18': 't', '17': 's', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10', '17': '17', '19': '19', '65': '65' }
                        let fan = mode_str[json["D0310C"]];
                        if (fan) {
                            this.updateCapability('fan_speed', fan);
                        }
                    }
                }
            }
            catch (error) {
            }

            try {
                if (json.hasOwnProperty('aqil')) {
                    this.updateCapability('light_intensity', json.aqil.toString());
                }
                if (json.hasOwnProperty('D03105')) {
                    this.updateCapability('light_intensity', json["D03105"].toString());
                }
            }
            catch (error) {
            }

            if (json.hasOwnProperty('D03135')) {
                if (this.hasCapability('light_mode')) {
                    this.updateCapability('light_mode', json["D03135"].toString());
                }
                
            }

            if (json.hasOwnProperty('D03137')) {
                if (this.hasCapability('light_ambient_mode')) {
                    this.updateCapability('light_ambient_mode', json["D03137"].toString());
                }
                
            }

            if (json.hasOwnProperty('uil')) {
                let uil_str = { '1': 'ON', '0': 'OFF', '2': 'FIXED' };
                this.updateCapability('button_lights', json.uil.toString());
            }
            if (json.hasOwnProperty('D03-05')) {
                if (json["D03-05"] == 100) {
                    this.updateCapability('button_lights', '1');
                } else {
                    this.updateCapability('button_lights', '0');
                }
            }

            if (json.hasOwnProperty('ddp')) {
                let ddp_str = { '1': 'PM2.5', '0': 'IAI', '3': 'Humidity' };
                if (this.hasCapability('display_mode')) {
                    this.updateCapability('display_mode', json.ddp);
                }
                if (this.hasCapability('display_mode_ph')) {
                    this.updateCapability('display_mode_ph', json.ddp);
                }
            }
            if (json.hasOwnProperty('D03-42')) {
                let ddp_str = { 'PM2.5': '1', 'IAI': '0' };
                if (this.hasCapability('display_mode')) {
                    this.updateCapability('display_mode', ddp_str[json["D03-42"]]);
                }
            }
            if (json.hasOwnProperty('D0312A')) {
                if (this.hasCapability('display_mode')) {
                    if (json["D0312A"] == 0 || json["D0312A"] == 1 || json["D0312A"] == 2 || json["D0312A"] == 3) {
                        this.updateCapability('display_mode', json["D0312A"].toString());
                    }
                }
                if (this.hasCapability('display_mode_ph')) {
                    if (json["D0312A"] == 0 || json["D0312A"] == 1 || json["D0312A"] == 2 || json["D0312A"] == 3 || json["D0312A"] == 6) {
                        this.updateCapability('display_mode_ph', json["D0312A"].toString());
                    }
                }
            }

            if (json.hasOwnProperty('cl')) {
                if (this.hasCapability('child_lock')) {
                    this.updateCapability('child_lock', json.cl);
                }
            }

            if (json.hasOwnProperty('D03103')) {
                if (this.hasCapability('child_lock')) {
                    if (json["D03103"] == 1) {
                        this.updateCapability('child_lock', true);
                    } else {
                        this.updateCapability('child_lock', false);
                    }
                }
            }


            if (json.hasOwnProperty('wl')) {
                if (this.hasCapability('water_level')) {
                    if (json.wl == 100) {
                        this.updateCapability('water_level', "Ok");
                    } else {
                        this.updateCapability('water_level', "Empty");
                    }
                }
            }
            if (json.hasOwnProperty('dt')) {
                if (this.hasCapability('timer')) {
                    this.updateCapability('timer', json.dt.toString());
                }
            }


            if (json.hasOwnProperty('D03110')) {
                if (this.hasCapability('heater_mode')) {
                    this.updateCapability('timer', heaterTimerToHours(json["D03110"]));
                } else if (this.hasCapability('timer')) {
                    this.updateCapability('timer', json["D03110"].toString());
                }
            }
            if (json.hasOwnProperty('D03211')) {
                this.updateCapability('timer_remaining', json["D03211"]);
            }
            if (json.hasOwnProperty('dtrs')) {
                if (this.hasCapability('timer_remaining')) {
                    this.updateCapability('timer_remaining', json.dtrs);
                }
            }

            try {

                if (json.hasOwnProperty('err')) {
                    if (json.err != 0) {
                        let err_str = { 49408: 'no water', 32768: 'water tank open', 49153: "pre-filter must be cleaned", 49155: "pre-filter must be cleaned" };
                    } {
                    }
                }

                if (json.hasOwnProperty('D03240')) {
                    if (json["D03240"] != 0) {
                        let err_str = { 49408: 'no water', 32768: 'water tank open', 49153: "pre-filter must be cleaned", 49155: "pre-filter must be cleaned" };
                        if (this.hasCapability('water_level')) {
                            if (json["D03240"] == 49408) {
                                this.updateCapability('water_level', "Empty");
                            }
                        }
                        let errorValue = err_str[json["D03240"]];
                        if (errorValue) {
                            if (this.hasCapability('error')) {
                                this.updateCapability('error', errorValue);
                            }
                        }
                    } else {
                        if (this.hasCapability('water_level')) {
                            if (json["D03240"] != 49408) {
                                this.updateCapability('water_level', "Ok");
                            }
                        }
                        if (this.hasCapability('error')) {
                            this.updateCapability('error', "-");
                        }
                    }
                }
            }
            catch (error) {
            }
            if (json.hasOwnProperty('modelid')) {
                this.updateCapability('product', `${json.modelid}`);
            }
            if (json.hasOwnProperty('D01-05')) {
                this.updateCapability('product', `${json["D01-05"]}`);
            }
            if (json.hasOwnProperty("D01S05")) {
                this.updateCapability('product', `${json["D01S05"]}`);
            }


            // if 'wicksts' in filters:
            // print('Wick filter: replace in {} hours'.format(filters['wicksts']))
            if (json.hasOwnProperty('fltsts0')) {
                if (this.hasCapability('pre_filter_clean')) {
                    this.updateCapability('pre_filter_clean', json.fltsts0);
                    let tokens = {
                        "hours": json.fltsts0,
                        "filter": "pre_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "pre_filter"
                    };
                    if (this.preFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.preFilterTriggered = true;
                        this.homey.setTimeout(() => {
                            this.preFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
            }
            if (json.hasOwnProperty('D05-13')) {
                if (this.hasCapability('pre_filter_clean')) {
                    this.updateCapability('pre_filter_clean', json["D05-13"]);
                    let tokens = {
                        "hours": json["D05-13"],
                        "filter": "pre_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "pre_filter"
                    };
                    if (this.preFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.preFilterTriggered = true;
                        this.homey.setTimeout(() => {
                            this.preFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }

            }

            if (json.hasOwnProperty('D0520D')) {
                if (this.hasCapability('pre_filter_clean')) {
                    this.updateCapability('pre_filter_clean', json["D0520D"]);
                    let tokens = {
                        "hours": json["D0520D"],
                        "filter": "pre_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "pre_filter"
                    };
                    if (this.preFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.preFilterTriggered = true;
                        this.homey.setTimeout(() => {
                            this.preFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
            }

            if (json.hasOwnProperty('fltsts2')) {
                this.updateCapability('carbon_filter_replace', json.fltsts2);
                let tokens = {
                    "hours": json.fltsts2,
                    "filter": "carbon_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "carbon_filter"
                };

                if (this.carbonFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.carbonFilterTriggered = true;
                    this.homey.setTimeout(() => {
                        this.carbonFilterTriggered = false;
                    }, 60 * MINUTE);
                }

            }
            if (json.hasOwnProperty('fltsts1')) {
                this.updateCapability('hepa_filter_replace', json.fltsts1);
                let tokens = {
                    "hours": json.fltsts1,
                    "filter": "hepa_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "hepa_filter"
                };

                if (this.hepaFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.hepaFilterTriggered = true;
                    this.homey.setTimeout(() => {
                        this.hepaFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }
            if (json.hasOwnProperty('D05-14')) {
                this.updateCapability('hepa_filter_replace', json['D05-14']);
                let tokens = {
                    "hours": json['D05-14'],
                    "filter": "hepa_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "hepa_filter"
                };

                if (this.hepaFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.hepaFilterTriggered = true;
                    this.homey.setTimeout(() => {
                        this.hepaFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }

            if (json.hasOwnProperty('D05213')) {
                this.updateCapability('hepa_filter_replace', json['D05213']);
                let tokens = {
                    "hours": json['D05213'],
                    "filter": "hepa_filter",
                    "device": this.getName()
                };
                let state = {
                    "which": "hepa_filter"
                };

                if (this.hepaFilterTriggered == false) {
                    this.flowTriggerFilterReplaceClean(tokens, state);
                    this.hepaFilterTriggered = true;
                    this.homey.setTimeout(() => {
                        this.hepaFilterTriggered = false;
                    }, 60 * MINUTE);
                }
            }

        }
    }

    pollAirDevice() {
        this.log("pollAirDevice");
        let settings = this.getSettings();
        this.log(settings);
        // this.log(JSON.stringify(settings));
        let deviceSecret = this.getStoreValue('secretKey' + settings.id);
        // this.log(this);
        this.log(deviceSecret);
        settings.secretkey = deviceSecret;
        this.log(settings);
        this.log("getCurrentStatusData");
        philipsair.getCurrentStatusData(settings).then(data => {

            this.log("pollAirDevice: " + JSON.stringify(data));
            if (data.error != null) {
                this.setCapabilityValue('product', data.error);
                philipsair.getInitData(settings).then(data => {
                    let secretKey = data;
                    if (secretKey != "ERROR") {
                        this.log('refresh key');
                        this.log('old key: ' + deviceSecret);
                        this.log('new key: ' + secretKey);
                        this.setStoreValue('secretKey', secretKey);
                    } else {
                        this.log('failed  to get the shared secret key');
                    }
                })
            }
            if (data.firmware != null) {
                this.log(`Product: ${data.firmware.name} version ${data.firmware.version} upgrade ${data.firmware.upgrade != '' ? data.firmware.upgrade : "-"} status ${data.firmware.statusmsg != '' ? data.firmware.statusmsg : "-"}`)
                this.setCapabilityValue('product', `${data.firmware.name} ${data.firmware.version}`);
            }
            if (data.filter != null) {
                // if 'wicksts' in filters:
                // print('Wick filter: replace in {} hours'.format(filters['wicksts']))
                if (data.filter.hasOwnProperty('fltsts0')) {
                    this.log(`Pre-filter: clean in ${data.filter.fltsts0} hours`);
                    this.setCapabilityValue('pre_filter_clean', data.filter.fltsts0);
                    let tokens = {
                        "hours": data.filter.fltsts0,
                        "filter": "pre_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "pre_filter"
                    };
                    this.log("preFilterTriggered: " + this.preFilterTriggered)
                    if (this.preFilterTriggered == false) {
                        this.log("is preFilterTriggered ");
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.preFilterTriggered = true;
                        this.homey.setTimeout(() => {
                            this.preFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
                if (data.filter.hasOwnProperty('fltsts2')) {
                    this.log(`Active Carbon ${data.filter.fltt2} filter: replace in ${data.filter.fltsts2} hours`);
                    this.setCapabilityValue('carbon_filter_replace', data.filter.fltsts2);
                    let tokens = {
                        "hours": data.filter.fltsts2,
                        "filter": "carbon_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "carbon_filter"
                    };
                    if (this.carbonFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.carbonFilterTriggered = true;
                        this.homey.setTimeout(() => {
                            this.carbonFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
                if (data.filter.hasOwnProperty('fltsts1')) {
                    this.log(`HEPA ${data.filter.fltt1} filter: replace in ${data.filter.fltsts1} hours`);
                    this.setCapabilityValue('hepa_filter_replace', data.filter.fltsts1);
                    let tokens = {
                        "hours": data.filter.fltsts1,
                        "filter": "hepa_filter",
                        "device": this.getName()
                    };
                    let state = {
                        "which": "hepa_filter"
                    };
                    if (this.hepaFilterTriggered == false) {
                        this.flowTriggerFilterReplaceClean(tokens, state);
                        this.hepaFilterTriggered = true;
                        this.homey.setTimeout(() => {
                            this.hepaFilterTriggered = false;
                        }, 60 * MINUTE);
                    }
                }
            }
            this.handleDeviceStatus(data.status, settings);
        })
    }
}

// module.exports = AirDevice;