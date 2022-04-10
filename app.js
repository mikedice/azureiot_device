const fsPromises = require('fs').promises;
const execFile = require('child_process').execFile;

// Use factory function from MQTT package to create an MQTT client
var clientFromConnectionString = require('azure-iot-device-mqtt').clientFromConnectionString;

// MQTT client object from connection string. Connection string
// is used to authenticate to Azure IoT hub
var client = clientFromConnectionString(process.env.HubConnectionString);

// Send an Azure IoT Message object
var Message = require('azure-iot-device').Message;

async function runApp() {
    // Open a client connection
    try{
        await client.open();
    }
    catch(error){
        console.log(`${Date.now()} error opening MQTT client ${error}`);
	return;
    }

    try{
         // reports metadata properties about this device
          await reportDeviceDetails(client)     
    }
    catch(error){
        console.log(`${Date.now()} error reporting device details ${error}`);
        return;
    }


    while (true){
        var sensors = null;

	// read sensor data
	try{
            sensors = await readSensors();
	    console.log(`${Date.now()} success reading sensor data`);
	}
	catch(error){
	    console.log(`${Date.now()} error reading sensors ${error}`);
	}

        if (sensors){
            var body = {
                messageTimestamp: Date.now(),
                ...sensors
            };

            // report sensor data as a JSON object
            var message = new Message(JSON.stringify(body));
            message.contentEncoding = 'utf-8';
            message.contentType = 'application/json';

	    try
	    {
	        result = await client.sendEvent(message);
	        console.log(`${Date.now()} sent message to hub`);
            }
	    catch(error){
                console.log(`${Date.now()} error sending message ${error}`);
	    }
	}
	
	const timeoutMs = 1000 * 60 * 5; // 5 minutes
        await new Promise(resolve => setTimeout(resolve, timeoutMs));
    }
}

// Create an instance of a Python process that will
// read the bmp180 sensor and write the result as JSON string to
// stdout. On promise completion the promise contains
// the returned JSON or the error if one occurred.
function readSensors() {
    var promise = new Promise((resolve, reject) => {

        const pathToPython271 = '/usr/bin/python2.7'
        const pathToScript = '/home/pi/code/python/readbmp180/readbmp180.py'
        execFile(pathToPython271, [pathToScript], (error, stdout, stderr) => {
            if (error) {
                console.log('error reading sensors', error);
            }
            // resolve the promise either way to keep the app going
            resolve(JSON.parse(stdout));
        });
    });
    return promise;
}

async function reportDeviceDetails(client) {
    var twin = await client.getTwin();
    const sysinfo = await getSystemInfo();
    var deviceDetails = {
        deviceDetails: sysinfo
    };

    return new Promise((resolve) => {
        twin.properties.reported.update(deviceDetails, (err) => {
            if (err) {
                console.log('twin update error', err);
            }

            // resolve the promise either way to keep the app going
            resolve();
        });
    });

}

// This Raspberry Pi specific function loads sysem information and reports
// it as a JSON string.
async function getSystemInfo() {
    var sysinfo = {};
    filecontents = await fsPromises.readFile('/proc/cpuinfo', 'utf-8')
    const allLines = filecontents.split(/\r\n|\n/);

    // Reading line by line
    allLines.forEach((line) => {
        if (line.indexOf('model name') >= 0) {
            var segs = line.split(':');
            sysinfo.processorType = segs[1].trim();
        }
        else if (line.indexOf('Model') >= 0) {
            var segs = line.split(':');
            sysinfo.platform = segs[1].trim();
        }
        else if (line.indexOf('Hardware') >= 0) {
            var segs = line.split(':');
            sysinfo.processorModel = segs[1].trim();
        }

    });
    return sysinfo;
}


async function clearDeviceDetails(client) {
    // Clear properties in the twin by setting them to null
    var twin = await client.getTwin();
    await twin.properties.reported.update({
        deviceDetails: null,
    });

    return new Promise((resolve) => {
        twin.properties.reported.update({
            deviceDetails: null,
        }, (err) => {
            if (err) {
                console.log('twin update error', err);
            }

            // resolve the promise either way to keep the app going
            resolve();
        });
    });
}

runApp()
    .finally(() => {
        client.close();
        console.log('goodbye');
    });
