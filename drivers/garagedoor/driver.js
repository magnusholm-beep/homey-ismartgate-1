'use strict';

const Homey = require('homey');

class GarageDoorDriver extends Homey.Driver {
  async onInit() {
    this.log('GarageDoorDriver initialized');

    // Register flow trigger cards
    this._doorOpenedTrigger = this.homey.flow.getDeviceTriggerCard('door-opened');
    this._doorClosedTrigger = this.homey.flow.getDeviceTriggerCard('door-closed');
  }

  async triggerDoorOpened(device) {
    await this._doorOpenedTrigger.trigger(device).catch(this.error);
  }

  async triggerDoorClosed(device) {
    await this._doorClosedTrigger.trigger(device).catch(this.error);
  }

  async onPairListDevices() {
    const devices = [];

    try {
      const app = this.homey.app;
      const infoResponse = await app.getInfo(0);

      for (let doorNumber = 1; doorNumber <= 3; doorNumber++) {
        const door = infoResponse.response[`door${doorNumber}`];

        if (door && door.enabled === 'yes') {
          const capabilities = ['garagedoor_toggle', 'alarm_garagedoor_open'];

          if (typeof door.temperature !== 'undefined') {
            capabilities.push('measure_temperature');
          }
          if (typeof door.voltage !== 'undefined') {
            capabilities.push('measure_battery');
          }

          devices.push({
            name: door.name || `Garage Door ${doorNumber}`,
            data: {
              id: `ismartgate-door-${doorNumber}`
            },
            store: {
              doorNumber: doorNumber
            },
            capabilities: capabilities
          });
        }
      }

      if (devices.length === 0) {
        throw new Error('No enabled doors found. Please configure your ismartgate device first.');
      }

    } catch (error) {
      this.error('Pairing failed:', error.message);
      throw new Error(`Could not retrieve door list: ${error.message}`);
    }

    return devices;
  }
}

module.exports = GarageDoorDriver;
