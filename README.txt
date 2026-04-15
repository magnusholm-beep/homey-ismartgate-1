With this app you can control your garage door or gate with the help of an ismartgate PRO, LITE or MINI.

Getting started:

1. In your Homey app, go to Settings → ismartgate and fill in your UDI, username and password.
   Note: remote access must be enabled on your ismartgate device.
2. Go to Devices and add your garage door(s). Each enabled door on your ismartgate hub will appear as a separate device in Homey.
3. Use the device tile to open or close the door directly, or build flows using the cards below.

Flow cards:

When (triggers):
- Garage door opened
- Garage door closed

And (conditions):
- Door is open/closed
- Temperature is less than / greater than (requires sensor with temperature support)
- Battery level is less than / greater than (requires sensor with battery)

Then (actions):
- Open door
- Close door
- Toggle door state

Two hubs:
If you have two ismartgate devices, you can add credentials for a second hub under Settings → ismartgate (Hub 2). Doors from both hubs will appear as devices.
