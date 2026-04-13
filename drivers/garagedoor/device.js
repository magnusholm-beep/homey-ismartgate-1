'use strict';

const Homey = require('homey');

class GarageDoorDevice extends Homey.Device {
  async onInit() {
    this.log('GarageDoorDevice initialized:', this.getName());

    const hubNumber = this.getStoreValue('hubNumber') || 1;
    const doorNumber = this.getStoreValue('doorNumber');
    this.log('Hub number:', hubNumber, 'Door number:', doorNumber);

    this.previousIsOpen = null;

    // Register listener for toggle control
    this.registerCapabilityListener('garagedoor_toggle', async (value) => {
      await this.onCapabilityToggle(value);
    });

    await this.pollDeviceStatus();

    this.startPolling();
  }

  startPolling() {
    const pollInterval = this.getSetting('poll_interval') || 30;
    this.log('Starting polling with interval:', pollInterval, 'seconds');

    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }

    this.pollInterval = this.homey.setInterval(async () => {
      await this.pollDeviceStatus();
    }, pollInterval * 1000);
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('poll_interval')) {
      this.log('Poll interval changed to:', newSettings.poll_interval);
      this.startPolling();
    }
  }

  async onCapabilityToggle(value) {
    const hubNumber = this.getStoreValue('hubNumber') || 1;
    const doorNumber = this.getStoreValue('doorNumber');
    const app = this.homey.app;

    try {
      if (value) {
        this.log('Opening door', doorNumber, 'on hub', hubNumber);
        await app.activateDoor(hubNumber, doorNumber, 'open');
      } else {
        this.log('Closing door', doorNumber, 'on hub', hubNumber);
        await app.activateDoor(hubNumber, doorNumber, 'close');
      }

      this.homey.setTimeout(async () => {
        await this.pollDeviceStatus();
      }, 5000);

    } catch (error) {
      this.error('Failed to control door:', error.message);
      throw new Error(error.message);
    }
  }

  async pollDeviceStatus() {
    if (this.deleted) return;

    const hubNumber = this.getStoreValue('hubNumber') || 1;
    const doorNumber = this.getStoreValue('doorNumber');

    try {
      const app = this.homey.app;
      const infoResponse = await app.getInfo(hubNumber, 1);

      const door = infoResponse.response[`door${doorNumber}`];

      if (!door || door.enabled !== 'yes') {
        if (!this.deleted) {
          await this.setUnavailable('Door is not enabled on ismartgate device');
        }
        return;
      }

      const isOpen = door.status === 'opened';

      // Check if status changed and trigger flow
      if (this.previousIsOpen !== null && this.previousIsOpen !== isOpen) {
        if (isOpen) {
          this.log('Door opened - triggering flow');
          await this.driver.triggerDoorOpened(this);
        } else {
          this.log('Door closed - triggering flow');
          await this.driver.triggerDoorClosed(this);
        }
      }
      this.previousIsOpen = isOpen;

      // Update both capabilities
      await this.setCapabilityValue('alarm_garagedoor_open', isOpen);
      await this.setCapabilityValue('garagedoor_toggle', isOpen);

      if (this.hasCapability('measure_temperature') && typeof door.temperature !== 'undefined') {
        await this.setCapabilityValue('measure_temperature', door.temperature);
      }

      if (this.hasCapability('measure_battery') && typeof door.voltage !== 'undefined') {
        // ismartgate returns battery level as a value 0-100 (not actual voltage)
        const batteryPercent = Math.min(100, Math.max(0, door.voltage));
        await this.setCapabilityValue('measure_battery', batteryPercent);
      }

      if (!this.deleted && !this.getAvailable()) {
        await this.setAvailable();
      }

    } catch (error) {
      this.error('Poll failed:', error.message);
      if (!this.deleted) {
        await this.setUnavailable(error.message);
      }
    }
  }

  async onDeleted() {
    this.log('GarageDoorDevice deleted');
    this.deleted = true;
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

module.exports = GarageDoorDevice;
