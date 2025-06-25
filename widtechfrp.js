let port, writer, reader;

async function connectSerial() {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        writer = textEncoder.writable.getWriter();

        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        reader = textDecoder.readable.getReader();

        logToBox('- Connecting: ', 'white', false);
        logToBox('[OK]\n', 'white', true);
    } catch (err) {
        logToBox('Serial Connection Failed: ' + err.message, 'red');
    }
}

async function readDeviceInfo() {
    clearLogBox();
    try {
        logToBox('- Reading info: ', 'white', false);
        logToBox('[OK]\n', 'white', true);

        // Send AT commands to retrieve device info
        await writer.write("AT+DEVCONINFO\r\n");
        const response = await readResponse(3500);
        parseDeviceInfo(response);

        

    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}


async function getAndroidVersion() {
    clearLogBox();
    try {
        // Send AT command AT+VERSNAME=3,2,3
        logToBox('- Getting Android Version: ', 'white', false);
        await writer.write("AT+VERSNAME=3,2,3\r\n");
        const versnameResponse = await readResponse(1000);
        const lastPart = extractLastPart(versnameResponse);
        logToBox(`${lastPart}\n`, 'white');
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

async function getSimLockStatus() {
    clearLogBox();
    try {
        // Send AT command AT+SVCIFPGM=1,4
        logToBox('- Checking SIM Lock Status: ', 'white', false);
        await writer.write("AT+SVCIFPGM=1,4\r\n");
        const svcifpgmResponse = await readResponse(1000);
        const svcifpgmResult = extractAfterSecondComma(svcifpgmResponse);
        logToBox(`${svcifpgmResult}\n`, 'white');
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

async function getChipset() {
    clearLogBox();
    try {
        logToBox('- Checking Chipset: ', 'white', false);

        // Prepare the device by setting the appropriate configuration
        await writer.write("AT+SWATD=1\r\n");
        await delay(500);  // A small delay to ensure the command is processed

        // Send the command to get the chipset information
        await writer.write("AT+VERSNAME=1,3,0\r\n");
        const chipsetResponse = await readResponse(1500);

        // Extract the chipset information after the first comma
        const chipsetResult = extractChipset(chipsetResponse);

        // Output the result
        logToBox(chipsetResult ? `${chipsetResult}\n` : "Can't identify chip\n", 'yellow');

    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

function extractChipset(input) {
    const regex = /\+VERSNAME:1,([^,]+)/; // Regular expression to extract the value after the first comma
    const match = regex.exec(input);
    return match ? match[1].trim() : null; // Return the part after the comma or null if not found
}
function extractCarrierID(input) {
    const regex = /\+RFBYCODE:1,([^,]+)/; // Regular expression to extract the value after the first comma
    const match = regex.exec(input);
    return match ? match[1].trim() : null; // Return the part after the comma or null if not found
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCarrierID() {
    clearLogBox();
    try {
        logToBox('- Checking CarrierID: ', 'white', false);

        // Prepare the device by setting the appropriate configuration
        await writer.write("AT+SWATD=1\r\n");
        await delay(500);  // A small delay to ensure the command is processed

        // Send the command to get the CarrierID information
        await writer.write("AT+RFBYCODE=1,1,0\r\n");
        const carrierIDResponse = await readResponse(1500);

        // Extract the CarrierID information after the first comma
        const carrierIDResult = extractCarrierID(carrierIDResponse);

        // Output the result
        logToBox(carrierIDResult ? `${carrierIDResult}\n` : "Unknown\n", 'white');

    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}



function extractAfterSecondComma(input) {
    const regex = /\+SVCIFPGM:[^,]+,[^,]+,([^,]+)/; // Regular expression to extract the value after the second comma
    const match = regex.exec(input);
    if (match) {
        return match[1]; // Return the part after the second comma
    }
    return 'UNKNOWN';
}

function extractLastPart(input) {
    const regex = /\+VERSNAME:[^,]+,(\d+)/; // Regular expression to extract the last part after the comma
    const match = regex.exec(input);
    if (match) {
        return match[1]; // Return the part after the comma
    }
    return 'UNKNOWN';
}

async function checkFRP() {
    clearLogBox();
    try {
        logToBox('- Setting ATD: ', 'white', false);

        await writer.write("AT+SWATD=0\r\n");
        await new Promise(resolve => setTimeout(resolve, 1000));

        await writer.write("AT+ACTIVATE=0,0,0\r\n");
        await new Promise(resolve => setTimeout(resolve, 1000));

        await writer.write("AT+SWATD=1\r\n");
        await new Promise(resolve => setTimeout(resolve, 1000));

        logToBox('[OK]\n', 'white', true);

        logToBox('- FRP Status: ', 'white', false);
        await writer.write("AT+REACTIVE=1,0,0\r");
        const frpResponse = await readResponse(3500);
        parseFRPStatus(frpResponse);
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

async function readResponse(timeout) {
    let response = '';
    try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ done: true }), timeout));
        while (true) {
            const { value, done } = await Promise.race([reader.read(), timeoutPromise]);
            if (done || !value) break;
            response += value;
        }
    } catch (err) {
        logToBox(`Error reading from device: ${err.message}`, 'red');
    }
    return response;
}

function parseDeviceInfo(response) {
    const model = extractValue(response, 'MN');
    const versionAndBaseband = extractFirstPart(response, 'VER'); // Extract the first part of VER
    const csc = extractValue(response, 'PRD');
    const sn = extractValue(response, 'SN');
    const imei = extractValue(response, 'IMEI');
    const un = extractValue(response, 'UN');

    logToBox(`- Model: ${model}\n`, 'white');
    logToBox(`- Software: ${versionAndBaseband}\n`, 'white');  // Use for software version
    logToBox(`- Sales Code: ${csc}\n`, 'white');
    logToBox(`- SN: ${sn}\n`, 'white');
    logToBox(`- IMEI: ${imei}\n`, 'white');
    logToBox(`- UN: ${un}\n`, 'white');

    const securityPatch = getSecurityPatchFromBaseband(versionAndBaseband);
    if (securityPatch) {
        logToBox(`- Security Patch: ${securityPatch}\n`, 'white');
    } else {
        logToBox('Invalid security patch data\n', 'red');
    }
}

function extractFirstPart(input, key) {
    const regex = new RegExp(`${key}\\((.*?)\\)`);
    const match = regex.exec(input);
    if (match) {
        const value = match[1];
        // Extract the first part of the value before the first '/'
        const firstPart = value.split('/')[0];
        return firstPart;
    }
    return 'UNKNOWN';
}


function parseFRPStatus(input) {
    const status = /REACTIVE:1,(.*)\r\n/.exec(input)?.[1]?.trim();
    const frpStatusOptions = ["UNLOCK", "LOCK", "TRIGGERED", "TRIGGER"];
    if (status && frpStatusOptions.includes(status)) {
        const color = ["TRIGGER", "TRIGGERED"].includes(status) ? 'darkred' : 'white';
        logToBox(`${status}`, color, true);
    } else {
        logToBox(" FRP Status: FAIL N/A", 'red');
    }
}

function extractValue(input, key) {
    const regex = new RegExp(`${key}\\((.*?)\\)`);
    const match = regex.exec(input);
    return match ? match[1] : 'UNKNOWN';
}

function getSecurityPatchFromBaseband(baseband) {
    if (baseband === "UNKNOWN" || baseband.length < 3) return null;

    const lastThree = baseband.slice(-3);
    const year = interpretYear(lastThree[0]);
    const month = interpretMonth(lastThree[1]);

    return year !== -1 && month ? `${month} ${year}` : null;
}

function logToBox(message, color = 'white', addNewline = true) {
    const logBox = document.getElementById('logBox');
    const span = document.createElement('span');
    span.style.color = color;
    span.textContent = message;
    logBox.appendChild(span);

    if (addNewline) {
        logBox.appendChild(document.createElement('br'));
    }

    logBox.scrollTop = logBox.scrollHeight;
}

function clearLogBox() {
    const logBox = document.getElementById('logBox');
    logBox.innerHTML = '';
}

function interpretYear(char) {
    const baseYear = 2001;
    const offset = char.charCodeAt(0) - 'A'.charCodeAt(0);
    if (char < 'A' || char > 'X') return -1;
    return baseYear + offset;
}

function interpretMonth(char) {
    if (char < 'A' || char > 'L') return null;
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    return months[char.charCodeAt(0) - 'A'.charCodeAt(0)];
}

async function rebootDownloadMode() {
    clearLogBox();
    try {
        logToBox('- Rebooting to Download Mode\n', 'white');

        await writer.write("AT+SUDDLMOD=0,0\r\n");
        await new Promise(resolve => setTimeout(resolve, 500));

        logToBox('- Rebooting device into download mode... [OK]\n', 'white');

        if (port) {
            port.close();
        }
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
        if (port && port.isOpen) {
            port.close();
        }
    }
}

async function restartDevice() {
    clearLogBox();
    try {
        if (!port) {
            logToBox('No device connected.\n', 'red');
            return;
        }

        logToBox('- Restarting Device\n', 'white');
        await writer.write("AT+CFUN=1,1\r\n");
        logToBox('- Device Restarted. [OK]\n', 'white');

        if (port) {
            port.close();
        }
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
        if (port && port.isOpen) {
            port.close();
        }
    }
}

async function enableADB2022() {
    clearLogBox();
    try {
        if (!port) {
            logToBox('No device connected.\n', 'red');
            return;
        }

        logToBox('- Setting debug state: ', 'white');

        await writer.write("AT+KSTRINGB=0,3\r\n");
        alert("Go to emergency call and dial *#0*#, then press OK.");
        await delay(1000);

        await writer.write("AT+DUMPCTRL=1,0\r\n");
        await delay(1000);

        await writer.write("AT+DEBUGLVC=0,5\r\n");
        await delay(1000);

        await writer.write("AT+SWATD=0\r\n");
        await delay(1000);

        await writer.write("AT+ACTIVATE=0,0,0\r\n");
        await delay(1000);

        await writer.write("AT+SWATD=1\r\n");
        await delay(1000);

        await writer.write("AT+DEBUGLVC=0,5\r\n");

        logToBox('[OK]\n', 'white');
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

async function enableADB2023() {
    clearLogBox();
    try {
        if (!port) {
            logToBox('No device connected.\n', 'red');
            return;
        }

        logToBox('- Setting debug state: ', 'white');

        await writer.write("AT+KSTRINGB=0,3\r\n");
        alert("Go to emergency call and dial *#0*#, then press OK.");
        await delay(1000);

        await writer.write("AT+SWATD=0\r\n");
        await delay(1000);

        await writer.write("AT+ACTIVATE=0,0,0\r\n");
        await delay(1000);

        await writer.write("AT+SWATD=1\r\n");
        await delay(1000);

        await writer.write("AT+PARALLEL=2,0,00000;AT+DEBUGLVC=0,5\r\n");

        logToBox('[OK]\n', 'white');
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function readInfoDownload() {
    clearLogBox();
    try {
        logToBox('\nReading device info...', 'white', false);

        await writer.write('DVIF\r\n');

        const response = await readResponse(2500); // Wait to ensure the full response is received

        const parsedInfo = parseDeviceInfoDownload(response);

        if (parsedInfo.length === 0) {
            logToBox('Failed', 'red');
        } else {
            logToBox('OK', 'white');
            parsedInfo.forEach(info => {
                logToBox(info.label + ': ', 'white', false);
                logToBox(info.value, 'white');
            });
        }
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

function parseDeviceInfoDownload(response) {
    const parsedInfo = [];
    
    const cleanedResponse = response.replace(/^@#/, '').replace(/@#$/, '');
    
    const infoPairs = cleanedResponse.split(';');

    infoPairs.forEach(pair => {
        const [key, value] = pair.split('=').map(s => s.trim());

        switch (key.toLowerCase()) {
            case 'model':
                parsedInfo.push({ label: 'Model', value });
                break;
            case 'vendor':
                parsedInfo.push({ label: 'Manufacturer', value });
                break;
            case 'sales':
                parsedInfo.push({ label: 'Sales Code', value });
                break;
            case 'ver':
                parsedInfo.push({ label: 'Software Version', value });
                break;
                case 'did':
                    parsedInfo.push({ label: 'DID', value: value.toUpperCase() }); // Convert DID value to uppercase
                    break;
                case 'un':
                    parsedInfo.push({ label: 'Device ID', value });
                    break;
                case 'capa':
                    parsedInfo.push({ label: 'Capacity', value: `${value} GB` }); // Add 'GB' after the value
                    break;
                case 'fwver':
                    parsedInfo.push({ label: 'Firmware Version', value });
                    break;
            
        
        }
    });

    return parsedInfo;
}

async function resetFRPUSA() {
    clearLogBox();
    try {
        logToBox('- Starting FRP Reset (USA)...\n', 'white');

        // Processing Step 1
        logToBox('- Processing step 1...\n', 'white');
        await writer.write("AT+SWATD=0\r\n");
        await delay(1000);
        await writer.write("AT+ACTIVATE=0,0,0\r\n");
        await delay(1000);
        await writer.write("AT+SWATD=1\r\n");
        await delay(1000);
        await writer.write("AT+PRECONFG=2,VZW\r\n");
        await delay(1000);
        await writer.write("AT+SWATD=0\r\n");
        await delay(1000);
        logToBox('- Processing step 1... [OK]\n', 'white');

        // Device Restart (Step 2)
        logToBox('- Restarting device...\n', 'white');
        await writer.write("AT+CFUN=1,1\r\n");
        await delay(10000); // Wait for the device to restart

        // Reconnect after device restart
        logToBox('- Waiting for device to reconnect...\n', 'white');
        await delay(15000); // Allow time for the device to reconnect twice
        await connectSerial(); // Reconnect to the device

        // Processing Step 2 after reconnecting
        logToBox('- Processing step 2...\n', 'white');
        await writer.write("AT+SWATD=0\r\n");
        await delay(1000);
        await writer.write("AT+ACTIVATE=0,0,0\r\n");
        await delay(1000);
        await writer.write("AT+SWATD=1\r\n");
        await delay(1000);
        await writer.write("AT+PRECONFG=2,TMB\r\n");
        await delay(1000);
        await writer.write("AT+SWATD=0\r\n");
        await delay(1000);

        logToBox('- FRP Done\n', 'lime');
    } catch (err) {
        logToBox(`Error: ${err.message}`, 'red');
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}