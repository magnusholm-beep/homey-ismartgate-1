'use strict';

module.exports = {
  async testConnection({ homey, body }) {
    const hubNumber = Number(body && body.hubNumber) || 1;
    try {
      await homey.app.getInfo(hubNumber, 0);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};
