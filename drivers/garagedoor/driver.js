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
    const app = this.homey.app;

    for (let hubNumber = 1; hubNumber <= 2; hubNumber++) {
      // Hub 2 is optional — skip if not configured
      if (hubNumber === 2 && !app.isHubConfigured(2)) {
        this.log('Hub 2 not configured, skipping');
        continue;
      }

      try {
        const infoResponse = await app.getInfo(hubNumber, 0);

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

            const hubPrefix = hubNumber === 2 ? 'Hub 2: ' : '';
            devices.push({
              name: `${hubPrefix}${door.name || `Garage Door ${doorNumber}`}`,
              data: {
                id: `ismartgate-hub${hubNumber}-door${doorNumber}`
              },
              store: {
                hubNumber: hubNumber,
                doorNumber: doorNumber
              },
              capabilities: capabilities
            });
          }
        }
      } catch (error) {
        if (hubNumber === 1) {
          this.error('Pairing failed for hub 1:', error.message);
          throw new Error(`Could not retrieve door list: ${error.message}`);
        } else {
          // Hub 2 errors are non-fatal during pairing
          this.log('Could not connect to hub 2 during pairing:', error.message);
        }
      }
    }

    if (devices.length === 0) {
      throw new Error('No enabled doors found. Please configure your ismartgate device first.');
    }

    return devices;
  }
}

module.exports = GarageDoorDriver;
