'use strict';

const Homey = require('homey');
const crypto = require('crypto');
const fxparser = require("fast-xml-parser");
const nodeFetch = require('node-fetch');


class ISmartGateApp extends Homey.App {
  async onInit() {
    this.cachedInfoResponse = {
      1: { obj: null, time: null, pending: null },
      2: { obj: null, time: null, pending: null },
    };

    // Register flow cards
    const toggleDoorState = this.homey.flow.getActionCard('toggle-door-state');
    toggleDoorState.registerRunListener(async (args) => {
      const hubNumber = args.device.getStoreValue('hubNumber') || 1;
      const doorNumber = args.device.getStoreValue('doorNumber');
      await this.activateDoor(hubNumber, doorNumber, 'toggle');
    });

    const openDoor = this.homey.flow.getActionCard('open-door');
    openDoor.registerRunListener(async (args) => {
      const hubNumber = args.device.getStoreValue('hubNumber') || 1;
      const doorNumber = args.device.getStoreValue('doorNumber');
      await this.activateDoor(hubNumber, doorNumber, 'open');
    });

    const closeDoor = this.homey.flow.getActionCard('close-door');
    closeDoor.registerRunListener(async (args) => {
      const hubNumber = args.device.getStoreValue('hubNumber') || 1;
      const doorNumber = args.device.getStoreValue('doorNumber');
      await this.activateDoor(hubNumber, doorNumber, 'close');
    });

    const doorIsOpen = this.homey.flow.getConditionCard('door-is-open');
    doorIsOpen.registerRunListener(async (args) => {
      const hubNumber = args.device.getStoreValue('hubNumber') || 1;
      const doorNumber = args.device.getStoreValue('doorNumber');
      let infoResponseObj = await this.getInfo(hubNumber, 1);
      return this.isDoorOpen(infoResponseObj, doorNumber);
    });

    const temperatureIsLessThan = this.homey.flow.getConditionCard('temperature-is-less-than');
    temperatureIsLessThan.registerRunListener(async (args) => {
      const hubNumber = args.device.getStoreValue('hubNumber') || 1;
      const doorNumber = args.device.getStoreValue('doorNumber');
      const {temperature} = args;
      let infoResponseObj = await this.getInfo(hubNumber, 1);
      return this.isTemperatureLessThan(infoResponseObj, doorNumber, temperature);
    });

    const batteryLevelIsLessThan = this.homey.flow.getConditionCard('battery-level-is-less-than');
    batteryLevelIsLessThan.registerRunListener(async (args) => {
      const hubNumber = args.device.getStoreValue('hubNumber') || 1;
      const doorNumber = args.device.getStoreValue('doorNumber');
      const {batteryLevel} = args;
      let infoResponseObj = await this.getInfo(hubNumber, 1);
      return this.isBatteryLevelLessThan(infoResponseObj, doorNumber, batteryLevel);
    });

    this.log('ismartgate app initialized');
  }

  getSettings(hubNumber = 1) {
    const suffix = hubNumber === 2 ? '2' : '';
    const hubLabel = hubNumber === 2 ? 'hub 2' : 'your ismartgate device';

    const udi = this.homey.settings.get(`udi${suffix}`);
    if (!udi) {
      throw new Error(`You are not logged in to ${hubLabel}. Go to settings and fill in UDI and other fields.`);
    }
    const username = this.homey.settings.get(`username${suffix}`);
    if (!username) {
      throw new Error(`You are not logged in to ${hubLabel}. Go to settings and fill in username and other fields.`);
    }
    const password = this.homey.settings.get(`password${suffix}`);
    if (!password) {
      throw new Error(`You are not logged in to ${hubLabel}. Go to settings and fill in password and other fields.`);
    }
    return { udi, username, password };
  }

  isHubConfigured(hubNumber) {
    const suffix = hubNumber === 2 ? '2' : '';
    return !!this.homey.settings.get(`udi${suffix}`);
  }

  async getInfo(hubNumber, maxCacheAgeInSeconds) {
    const cache = this.cachedInfoResponse[hubNumber];
    let cacheAgeInSeconds = Infinity;
    if (cache.time !== null) {
      cacheAgeInSeconds = ((new Date()) - cache.time) / 1000;
    }
    if (cacheAgeInSeconds < maxCacheAgeInSeconds) {
      return cache.obj;
    }
    // If a request is already in flight, return the same promise to avoid duplicate API calls
    if (cache.pending !== null) {
      return cache.pending;
    }
    const { username, password } = this.getSettings(hubNumber);
    const infoCommandStr = `["${username}", "${password}", "info", "", ""]`;
    cache.pending = this.executeRequest(infoCommandStr, hubNumber)
      .then((result) => {
        cache.obj = result;
        cache.time = new Date();
        cache.pending = null;
        return result;
      })
      .catch((err) => {
        cache.pending = null;
        throw err;
      });
    return cache.pending;
  }

  parseResponse(xmlStr) {
    let parser = new fxparser.XMLParser();
    return parser.parse(xmlStr);
  }

  assertDoorEnabled(infoResponseObj, doorNumber) {
    const door = infoResponseObj.response[`door${doorNumber}`];
    if (!door || door.enabled !== 'yes') {
      let errorMessage = `Door ${doorNumber} is not enabled.`;

      let enabledDoorNumbers = [];
      for (let candidateDoorNumber = 1; candidateDoorNumber < 4; candidateDoorNumber++) {
        let candidateDoor = infoResponseObj.response[`door${candidateDoorNumber}`];
        if (!!candidateDoor && candidateDoor.enabled === 'yes') {
          enabledDoorNumbers.push(candidateDoorNumber);
        }
      }
      if (enabledDoorNumbers.length === 1) {
        errorMessage += ` Door ${enabledDoorNumbers[0]} is the only enabled door.`;
      } else if (enabledDoorNumbers.length === 0) {
        errorMessage += ` Your ismartgate device does not have any enabled doors at this time. Please configure it.`;
      }

      throw new Error(errorMessage);
    }
  }

  isDoorOpen(infoResponseObj, doorNumber) {
    const door = infoResponseObj.response[`door${doorNumber}`];
    this.assertDoorEnabled(infoResponseObj, doorNumber);
    return door.status === 'opened';
  }

  isTemperatureLessThan(infoResponseObj, doorNumber, temperature) {
    const door = infoResponseObj.response[`door${doorNumber}`];
    this.assertDoorEnabled(infoResponseObj, doorNumber);
    if (typeof door.temperature === 'undefined') {
      throw new Error('Temperature data is not available. Check if your ismartgate sensor type supports temperature.');
    }
    return door.temperature < temperature;
  }

  isBatteryLevelLessThan(infoResponseObj, doorNumber, batteryLevel) {
    const door = infoResponseObj.response[`door${doorNumber}`];
    this.assertDoorEnabled(infoResponseObj, doorNumber);
    if (typeof door.voltage === 'undefined') {
      throw new Error('Battery voltage data is not available. Check if your ismartgate sensor has a battery.');
    }
    return door.voltage < batteryLevel;
  }

  async executeRequest(commandStr, hubNumber = 1) {
    const { udi, username, password } = this.getSettings(hubNumber);
    const aesBlockSize = 16;

    const rawToken = `${username.toLowerCase()}@ismartgate`

    let sha1 = function(input) {
      return crypto.createHash('sha1').update(input).digest('hex')
    }
    const hashedToken = sha1(rawToken);

    const sha1HexStr = sha1(username.toLowerCase() + password)

    const apiCipherKey = `${sha1HexStr.slice(32, 36)}a${sha1HexStr.slice(7, 10)}!${sha1HexStr.slice(18, 21)}*#${sha1HexStr.slice(24, 26)}`

    // Generate a random 16-byte IV expressed as 16 hex chars (as expected by the API protocol)
    const initVectorBytes = crypto.randomBytes(8).toString('hex');

    let encryptAES128CBC = ((val) => {
      let cipher = crypto.createCipheriv('aes-128-cbc', apiCipherKey, initVectorBytes);
      let encrypted = cipher.update(val, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return encrypted;
    });

    const encryptedCommandStr = initVectorBytes + encryptAES128CBC(commandStr);

    const t = (1 + 99999999 * (Math.random() | 0)).toString();

    const params = {
      data: encryptedCommandStr,
      t: t,
      token: hashedToken
    };
    const apiUrl = `https://${udi}.isgaccess.com/api.php?` + new URLSearchParams(params);

    const that = this;
    function decrypt(text) {
      let initialVector = text.slice(0, aesBlockSize);
      let encryptedBytes = text.slice(aesBlockSize);
      let decipher = crypto.createDecipheriv('aes-128-cbc', apiCipherKey, initialVector);
      let decrypted = decipher.update(encryptedBytes, 'base64', 'utf8');
      return (decrypted + decipher.final('utf8'));
    }

    let text;
    try {
      const response = await nodeFetch(apiUrl);
      text = await response.text();
    } catch (err) {
      throw new Error('Failed to reach your ismartgate device. The connection may be broken, or the UDI in the ismartgate settings page may be incorrect.');
    }

    if (text.includes('Error: invalid login or password')) {
      throw new Error('Invalid ismartgate username or password. Go to ismartgate settings and make sure your credentials are correct.');
    }

    const decryptedXml = decrypt(text);
    return that.parseResponse(decryptedXml);
  }

  async activateDoor(hubNumber, doorNumber, direction, maxCacheAgeInSeconds = null, allowRetry = true) {
    if (maxCacheAgeInSeconds === null) {
      maxCacheAgeInSeconds = 200;
      if (direction === 'open' || direction === 'close') {
        maxCacheAgeInSeconds = 2.5;
      }
    }
    let infoResponseObj = await this.getInfo(hubNumber, maxCacheAgeInSeconds);
    if (this.isDoorOpen(infoResponseObj, doorNumber)) {
      if (direction === 'open') {
        // Door is already open. Do nothing.
        return;
      }
    } else {
      if (direction === 'close') {
        // Door is already closed. Do nothing.
        return;
      }
    }
    const { username, password } = this.getSettings(hubNumber);
    let apiCode = infoResponseObj.response[`door${doorNumber}`].apicode;
    const activateCommandStr = `["${username}", "${password}", "activate", "${doorNumber}", "${apiCode}"]`;
    let activateResponseObj = await this.executeRequest(activateCommandStr, hubNumber);
    if (allowRetry && activateResponseObj.response.error && activateResponseObj.response.error.errormsg === 'Error: invalid API code') {
      // API code expired. Fetch new API code and retry.
      return await this.activateDoor(hubNumber, doorNumber, direction, 0, false);
    } else if (activateResponseObj.response.result !== 'OK') {
      throw new Error(`Failed to ${direction} garage door`);
    }
  }
}

module.exports = ISmartGateApp;
