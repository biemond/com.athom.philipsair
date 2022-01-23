Transform the air quality in your home, they can remove ultra-fine particles, take care of the airborne allergens plus has real-time air quality monitoring

Added support for Philip AIR purifiers with or without humidifiers, it should work for all the Philips air devices (also the new 2020 devices with COAP protocol) 
Verified on 
- AC5659/10 Air purifier 2019 model
- AC3259/10 Air purifier 2019 model
- AC3829/10 Humidifier and air purifier 2019 model
- AC2889/10 Air purifier 2020 model
- AC4236/10 purifier model

Purifier ( + Humidifier ) Device
For adding the device you need to provide Philips device ip address plus Homey has to be on the same network as your purifier. 

For the 2019 air devices When there is a powerloss or the purifier was restarted then also the device need to be re-added in the homey app, this is because the shared key between the purifier and homey is added only once.

Every 2 minutes the app device will poll for the latest purifer status.

the app supports 
- a lot of actions to control your devices like you can with the Air Matters app
- has sensors which you can use with insights

flow support
- triggers for the air sensors or for a filter which need to be replaced
- sensor conditions which you can use in combination with other triggers
- actions so you can do something on the device.
