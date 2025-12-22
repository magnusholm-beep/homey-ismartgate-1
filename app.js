'use strict';

const Homey = require('homey');
const uuid = require('uuid')
const crypto = require('crypto');
const fxparser = require("fast-xml-parser");
const nodeFetch = require('node-fetch');


class ISmartGateApp extends Homey.App {
  async onInit() {
    this.cachedInfoResponseObj = null;
    this.cachedInfoResponseTime = null;

    // Register flow cards
    const toggleDoorState = this.homey.flow.getActionCard('toggle-door-state');
    toggleDoorState.registerRunListener(async (args) => {
      const {doorNumber} = args;
      await this.activateDoor(doorNumber, 'toggle');
    });

    const openDoor = this.homey.flow.getActionCard('open-door');
    openDoor.registerRunListener(async (args) => {
      const {doorNumber} = args;
      await this.activateDoor(doorNumber, 'open');
    });

    const closeDoor = this.homey.flow.getActionCard('close-door');
    closeDoor.registerRunListener(async (args) => {
      const {doorNumber} = args;
      await this.activateDoor(doorNumber, 'close');
    });

    const doorIsOpen = this.homey.flow.getConditionCard('door-is-open');
    doorIsOpen.registerRunListener(async (args) => {
      const {doorNumber} = args;
      let infoResponseObj = await this.getInfo(1);
      return this.isDoorOpen(infoResponseObj, doorNumber);
    });

    const temperatureIsLessThan = this.homey.flow.getConditionCard('temperature-is-less-than');
    temperatureIsLessThan.registerRunListener(async (args) => {
      const {doorNumber, temperature} = args;
      let infoResponseObj = await this.getInfo(1);
      return this.isTemperatureLessThan(infoResponseObj, doorNumber, temperature);
    });

    const batteryLevelIsLessThan = this.homey.flow.getConditionCard('battery-level-is-less-than');
    batteryLevelIsLessThan.registerRunListener(async (args) => {
      const {doorNumber, batteryLevel} = args;
      let infoResponseObj = await this.getInfo(1);
      return this.isBatteryLevelLessThan(infoResponseObj, doorNumber, batteryLevel);
    });

    this.log('ismartgate app initialized');
  }

  getSettings() {
    const udi = this.homey.settings.get('udi');
    if (!udi) {
      throw new Error("You are not logged in to your ismartgate device. Go to settings and fill in UDI and other fields.");
    }
    const username = this.homey.settings.get('username');
    if (!username) {
      throw new Error("You are not logged in to your ismartgate device. Go to settings and fill in username and other fields.");
    }
    const password = this.homey.settings.get('password');
    if (!password) {
      throw new Error("You are not logged in to your ismartgate device. Go to settings and fill in password and other fields.");
    }
    return { udi, username, password };
  }

  async getInfo(maxCacheAgeInSeconds) {
    let cacheAgeInSeconds = Infinity;
    if (null !== this.cachedInfoResponseTime) {
      cacheAgeInSeconds = ((new Date()) - this.cachedInfoResponseTime) / 1000;
    }
    if (cacheAgeInSeconds < maxCacheAgeInSeconds) {
      return this.cachedInfoResponseObj;
    }
    const { username, password } = this.getSettings();
    const infoCommandStr = `["${username}", "${password}", "info", "", ""]`;
    this.cachedInfoResponseObj = await this.executeRequest(infoCommandStr);
    this.cachedInfoResponseTime = new Date();
    return this.cachedInfoResponseObj;
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

  async executeRequest(commandStr) {
    const { udi, username, password } = this.getSettings();
    const aesBlockSize = 16;

    const rawToken = `${username.toLowerCase()}@ismartgate`

    let sha1 = function(input) {
      return crypto.createHash('sha1').update(input).digest('hex')
    }
    const hashedToken = sha1(rawToken);

    const sha1HexStr = sha1(username.toLowerCase() + password)

    const apiCipherKey = `${sha1HexStr.slice(32, 36)}a${sha1HexStr.slice(7, 10)}!${sha1HexStr.slice(18, 21)}*#${sha1HexStr.slice(24, 26)}`

    const buffer = Buffer.alloc(16);
    uuid.v4({}, buffer);
    let initVector = buffer.toString('hex');

    const initVectorBytes = initVector.slice(0, aesBlockSize);

    let encryptAES256CBC = ((val) => {
      let cipher = crypto.createCipheriv('aes-128-cbc', apiCipherKey, initVectorBytes);
      let encrypted = cipher.update(val, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return encrypted;
    });

    const encryptedCommandStr = initVectorBytes + encryptAES256CBC(commandStr);

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

    return await nodeFetch(apiUrl)
      .then((response) => {
        return response.text()
      }).then((text) => {
        if (text.includes('Error: invalid login or password')) {
          throw new Error('Invalid ismartgate username or password. Go to ismartgate settings and make sure your credentials are correct.')
        } else {
          const decryptedXml = decrypt(text);
          return that.parseResponse(decryptedXml);
        }
      }).catch(function() {
        throw new Error('Failed to reach your ismartgate device. The connection may be broken, or the UDI in the ismartgate settings page may be incorrect.')
      });
  }

  async activateDoor(doorNumber, direction, maxCacheAgeInSeconds = null, allowRetry = true) {
    if (maxCacheAgeInSeconds === null) {
      maxCacheAgeInSeconds = 200;
      if (direction === 'open' || direction === 'close') {
        maxCacheAgeInSeconds = 2.5;
      }
    }
    let infoResponseObj = await this.getInfo(maxCacheAgeInSeconds);
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
    const { username, password } = this.getSettings();
    let apiCode = infoResponseObj.response[`door${doorNumber}`].apicode;
    const activateCommandStr = `["${username}", "${password}", "activate", "${doorNumber}", "${apiCode}"]`;
    let activateResponseObj = await this.executeRequest(activateCommandStr);
    if (allowRetry && activateResponseObj.response.error && activateResponseObj.response.error.errormsg === 'Error: invalid API code') {
      // API code expired. Fetch new API code and retry.
      return await this.activateDoor(doorNumber, direction, 0, false);
    } else if (activateResponseObj.response.result !== 'OK') {
      throw new Error(`Failed to ${direction} garage door`);
    }
  }
}

module.exports = ISmartGateApp;
