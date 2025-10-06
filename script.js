
const connectBtn = document.getElementById("connectBtn");
const statusDiv = document.getElementById("connection-status");
const bpmEl = document.getElementById("bpm");
const stepsEl = document.getElementById("steps");
const latEl = document.getElementById("lat");
const lonEl = document.getElementById("lon");
const mapLink = document.getElementById("mapLink");

// Fall Popup
const fallPopup = document.getElementById("fallPopup");
const countdownEl = document.getElementById("countdown");
const cancelBtn = document.getElementById("cancelBtn");

// Caregiver Form
const caregiverNameInput = document.getElementById("caregiverName");
const caregiverMobileInput = document.getElementById("caregiverMobile");
const caregiverEmailInput = document.getElementById("caregiverEmail");
const saveCaregiverBtn = document.getElementById("saveCaregiverBtn");
const saveStatus = document.getElementById("saveStatus");

// App State
let bleDevice;
let bleCharacteristic;
let countdownInterval;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.bluetooth) {
        alert("Web Bluetooth API is not available on this browser. Please use Chrome or Edge.");
        connectBtn.disabled = true;
    }
    // Event Listeners
    connectBtn.addEventListener("click", toggleBluetoothConnection);
    cancelBtn.addEventListener("click", cancelFallAlert);
    saveCaregiverBtn.addEventListener("click", saveCaregiverDetails);
    
    // Load saved caregiver info on start
    loadCaregiverDetails();
});

// --- BLUETOOTH LOGIC ---
async function toggleBluetoothConnection() {
    if (bleDevice && bleDevice.gatt.connected) {
        disconnectFromBand();
    } else {
        await connectToBand();
    }
}

async function connectToBand() {
    console.log("Requesting Bluetooth device...");
    updateStatus("Connecting...", false);
    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: config.DEVICE_NAME }],
            optionalServices: [config.BLE_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(config.BLE_SERVICE_UUID);
        bleCharacteristic = await service.getCharacteristic(config.BLE_CHARACTERISTIC_UUID);

        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', handleData);
        
        updateStatus("Connected", true);
    } catch (error) {
        console.error("Connection failed:", error);
        updateStatus(`Error: ${error.message.split('.')[0]}`, false);
    }
}

function onDisconnected() {
    console.log("Device disconnected.");
    updateStatus("Disconnected", false);
    bleDevice = null;
    resetMetrics();
}

function disconnectFromBand() {
    if (!bleDevice || !bleDevice.gatt.connected) return;
    bleDevice.gatt.disconnect();
}

// --- DATA HANDLING ---
function handleData(event) {
    const value = new TextDecoder().decode(event.target.value);
    try {
        const data = JSON.parse(value);
        
        bpmEl.textContent = data.bpm ?? '--';
        stepsEl.textContent = data.steps ?? '--';
        latEl.textContent = data.lat ?? '--';
        lonEl.textContent = data.lon ?? '--';

        if (data.lat && data.lon) {
            mapLink.href = `https://www.google.com/maps?q=${data.lat},${data.lon}`;
            mapLink.classList.remove('map-link-hidden');
        }

        if (data.fall === true) {
            triggerFallPopup(data);
        }
    } catch (e) {
        console.error("Invalid JSON received:", value);
    }
}

// --- FALL DETECTION LOGIC ---
function triggerFallPopup(data) {
    if (fallPopup.classList.contains('show')) return;

    fallPopup.classList.add('show');
    let countdown = 7;
    countdownEl.textContent = countdown;

    countdownInterval = setInterval(() => {
        countdown -= 1;
        countdownEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            sendFallAlert(data);
            fallPopup.classList.remove('show');
        }
    }, 1000);
}

function cancelFallAlert() {
    clearInterval(countdownInterval);
    fallPopup.classList.remove('show');
}

async function sendFallAlert(data) {
    // Get caregiver details from localStorage
    const savedInfo = localStorage.getItem('caregiverInfo');
    const caregiverInfo = savedInfo ? JSON.parse(savedInfo) : {};

    // Combine sensor data with caregiver info into a single payload
    const payload = {
        ...data, // sensor data (bpm, steps, lat, lon, fall)
        caregiver: { // nested caregiver object
            name: caregiverInfo.name || 'Not Provided',
            mobile: caregiverInfo.mobile || 'Not Provided',
            email: caregiverInfo.email || 'Not Provided'
        },
        timestamp: new Date().toISOString() // Add a timestamp for better logging
    };

    console.log("Sending fall alert payload to webhook:", payload);
    try {
        const response = await fetch(config.N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        console.log("Webhook sent, status:", response.status);
    } catch (err) {
        console.error("Failed to send webhook:", err);
    }
}

// --- CAREGIVER LOGIC ---
function saveCaregiverDetails() {
    const caregiverInfo = {
        name: caregiverNameInput.value.trim(),
        mobile: caregiverMobileInput.value.trim(),
        email: caregiverEmailInput.value.trim()
    };
    localStorage.setItem('caregiverInfo', JSON.stringify(caregiverInfo));
    
    saveStatus.textContent = 'Saved!';
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
}

function loadCaregiverDetails() {
    const savedInfo = localStorage.getItem('caregiverInfo');
    if (savedInfo) {
        const caregiverInfo = JSON.parse(savedInfo);
        caregiverNameInput.value = caregiverInfo.name || '';
        caregiverMobileInput.value = caregiverInfo.mobile || '';
        caregiverEmailInput.value = caregiverInfo.email || '';
    }
}

// --- UI HELPERS ---
function updateStatus(message, isConnected) {
    statusDiv.textContent = `Status: ${message}`;
    statusDiv.className = isConnected ? 'status-connected' : 'status-disconnected';
    connectBtn.textContent = isConnected ? 'Disconnect' : 'Connect to Band';
}

function resetMetrics() {
    bpmEl.textContent = '--';
    stepsEl.textContent = '--';
    latEl.textContent = '--';
    lonEl.textContent = '--';
    mapLink.classList.add('map-link-hidden');

}
