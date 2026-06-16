const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const { InfluxDB } = require('@influxdata/influxdb-client');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ModbusRTU = require("modbus-serial");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 5000;
const INFLUX_URL = process.env.INFLUX_URL || 'http://influxdb:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'my-super-secret-auth-token';
const INFLUX_ORG = process.env.INFLUX_ORG || 'romi_org';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'romi_bucket';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// Basic health check
app.get('/', (req, res) => {
    res.send('Digital Twin Backend is running');
});

const LAST_STATE_FILE = './last_rig_state.json';
let lastEmittedData = null;

let SIMULATION_MODE = false; // Set to false for Live PLC Data Mode
let simAngle = 0; // For oscillating values

// API: Get Simulation Status
app.get('/api/simulation/status', (req, res) => {
    res.json({ enabled: SIMULATION_MODE });
});

// API: Toggle Simulation Mode
app.post('/api/simulation/toggle', (req, res) => {
    const { enabled } = req.body;
    if (enabled !== undefined) {
        SIMULATION_MODE = !!enabled;
        console.log(`Simulation Mode turned ${SIMULATION_MODE ? 'ON' : 'OFF'}`);
        res.json({ success: true, enabled: SIMULATION_MODE });
    } else {
        res.status(400).json({ error: "Missing 'enabled' boolean" });
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Load last state from disk on startup
if (fs.existsSync(LAST_STATE_FILE)) {
    try {
        lastEmittedData = JSON.parse(fs.readFileSync(LAST_STATE_FILE));
        console.log("Restored last emitted data from disk");
    } catch (e) {
        console.error("Failed to restore last state:", e);
    }
}

const saveLastState = (data) => {
    try {
        fs.writeFileSync(LAST_STATE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Failed to save last state:", e);
    }
};

// Global helper: Ensure no analytical values go below zero (except gain_loss)
// This is critical for analog sensors that might flicker negative values due to noise
const sanitizeData = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (typeof val === 'number') {
            // EXCEPTION: gain_loss is allowed to be negative
            if (key !== 'gain_loss' && val < 0) {
                obj[key] = 0;
            }
        } else if (typeof val === 'object' && val !== null) {
            sanitizeData(val);
        }
    });
};


// Socket.io connection
io.on('connection', (socket) => {
    console.log('A user connected');

    // Immediately send the last known data on connection so they don't start at 0
    if (lastEmittedData) {
        socket.emit('rig_data', lastEmittedData);
    }

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// InfluxDB Query Client & Write API
const { Point } = require('@influxdata/influxdb-client');
const queryApi = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN }).getQueryApi(INFLUX_ORG);
const writeApi = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN }).getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 's');

const writeDrillingToInflux = (wob, bitDepth, holeDepth) => {
    try {
        const point = new Point('drilling')
            .floatField('wob', Number(wob))
            .floatField('bit_depth', Number(bitDepth))
            .floatField('hole_depth', Number(holeDepth));
        writeApi.writePoint(point);
    } catch (e) {
        console.error("Failed to write drilling data to InfluxDB:", e);
    }
};

const writeSimToInflux = (payload) => {
    try {
        if (payload.drawworks) {
            const p = new Point('drawworks')
                .floatField('hook_load', payload.drawworks.hook_load)
                .floatField('block_position', payload.drawworks.block_position)
                .floatField('rpm', payload.drawworks.rpm)
                .floatField('torque', payload.drawworks.torque)
                .intField('travelling_up', payload.drawworks.travelling_up ? 0 : 1)
                .intField('travelling_down', payload.drawworks.travelling_down ? 0 : 1)
                .intField('CROWNOMATIC', payload.drawworks.crownomatic)
                .intField('FLOOROMATIC', payload.drawworks.flooromatic);
            writeApi.writePoint(p);
        }
        if (payload.engine) {
            const p = new Point('engine')
                .floatField('rpm', payload.engine.rpm)
                .floatField('torque', payload.engine.torque)
                .floatField('pressure', payload.engine.pressure)
                .floatField('coolant_temp', payload.engine.coolant_temp)
                .floatField('oil_pressure', payload.engine.oil_pressure / 6.89476)
                .floatField('fuel_level', payload.engine.fuel_level)
                .floatField('battery_voltage', payload.engine.battery_voltage);
            writeApi.writePoint(p);
        }
        if (payload.mudpump) {
            const p = new Point('mudpump')
                .floatField('spm', payload.mudpump.spm)
                .floatField('spm_2', payload.mudpump.spm_2)
                .floatField('total_spm', payload.mudpump.total_spm)
                .floatField('pressure', payload.mudpump.pressure)
                .floatField('flow_in', payload.mudpump.flow_in)
                .floatField('flow_out', payload.mudpump.flow_out)
                .floatField('flow_rate', payload.mudpump.flow_rate);
            writeApi.writePoint(p);
        }
        if (payload.fluid) {
            const p = new Point('fluid')
                .floatField('trip_tank', payload.fluid.trip_tank)
                .floatField('tank_1', payload.fluid.tank1)
                .floatField('tank_2', payload.fluid.tank2)
                .floatField('gain_loss', payload.fluid.gain_loss);
            writeApi.writePoint(p);
        }
        if (payload.well_control) {
            const p = new Point('wellcontrol')
                .floatField('annular_pressure', payload.well_control.annular_pressure)
                .floatField('manifold_pressure', payload.well_control.manifold_pressure)
                .floatField('accumulator_pressure', payload.well_control.accumulator_pressure)
                .intField('ANNULAR_OPEN', payload.well_control.annular_open ? 1 : 0)
                .intField('ANNULAR_CLOSE', payload.well_control.annular_close ? 1 : 0)
                .intField('PIPE_RAM_OPEN', payload.well_control.pipe_ram_open ? 1 : 0)
                .intField('PIPE_RAM_CLOSE', payload.well_control.pipe_ram_close ? 1 : 0)
                .intField('BLIND_RAM_OPEN', payload.well_control.blind_ram_open ? 1 : 0)
                .intField('BLIND_RAM_CLOSE', payload.well_control.blind_ram_close ? 1 : 0);
            writeApi.writePoint(p);
        }
        if (payload.system) {
            const p = new Point('system')
                .floatField('rig_air_pressure', payload.system.rig_air_pressure);
            writeApi.writePoint(p);
        }
        if (payload.allison) {
            const p = new Point('allison')
                .floatField('output_rpm', payload.allison.output_rpm)
                .floatField('input_rpm', payload.allison.input_rpm)
                .floatField('actual_gear', payload.allison.actual_gear)
                .floatField('target_gear', payload.allison.target_gear)
                .floatField('oil_temp', payload.allison.oil_temp)
                .floatField('oil_pressure', payload.allison.oil_pressure);
            writeApi.writePoint(p);
        }
    } catch (e) {
        console.error("Failed to write sim payload to InfluxDB:", e);
    }
};

// --- Drilling Physics Engine ---
const DRILLING_STATE_FILE = './drilling_state.json';
let drillingState = {
    stringWeight: 0, // kips (Tare weight)
    totalDepth: 0, // ft (Default to 0)
    bitDepth: 0, // ft (Default to 0)
    lastBlockPosition: 75, // ft (Start middle)
    travelling_up: false,
    travelling_down: false,
    torque: 0
};

// Load state from disk if exists
if (fs.existsSync(DRILLING_STATE_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(DRILLING_STATE_FILE));
        drillingState = { ...drillingState, ...saved };
    } catch (e) {
        console.error("Failed to load drilling state:", e);
    }
}

const saveDrillingState = () => {
    fs.writeFileSync(DRILLING_STATE_FILE, JSON.stringify(drillingState, null, 2));
};

// Physics Loop (Runs on data update)
const updatePhysics = (rigData) => {
    // 1. Get Inputs
    const currentHookLoad = rigData.drawworks?.hook_load || 0;

    // Read the discrete inputs for travelling block
    const travellingUp = rigData.drawworks?.travelling_up;
    const travellingDown = rigData.drawworks?.travelling_down;

    // Start with the last known block position
    let currentBlockPos = drillingState.lastBlockPosition || 0;
    const BLOCK_SPEED = 0.5; // ft per physics tick

    // The block is 0 at the floor and positive towards the crown.
    // User logic: 0 (OFF) = Moving, 1 (ON) = Idle/Stopped
    // When travellingUp is 0 (OFF), block moves UP (position increases)
    if (travellingUp === 0 || travellingUp === false) {
        currentBlockPos += BLOCK_SPEED;
    }

    // When travellingDown is 0 (OFF), block moves DOWN (position decreases)
    if (travellingDown === 0 || travellingDown === false) {
        currentBlockPos -= BLOCK_SPEED;
    }

    // Keep block position within realistic bounds (e.g., 0 ft at floor to 150 ft at crown)
    currentBlockPos = Math.max(0, Math.min(150, currentBlockPos));

    // Override the rigData block_position so the frontend visualizers show the simulated movement
    if (rigData.drawworks) {
        rigData.drawworks.block_position = Number(currentBlockPos.toFixed(2));
    }

    // 2. Calculate WOB
    // WOB is the weight of the string supported by the bottom, so StringWeight - HookLoad
    let wob = Math.max(0, drillingState.stringWeight - currentHookLoad);

    // 3. Calculate Depths
    const deltaBlock = drillingState.lastBlockPosition - currentBlockPos; // Positive = Moving Down

    // Update Bit Depth based on block movement
    let newBitDepth = drillingState.bitDepth + deltaBlock;

    // Constrain Bit Depth (Cannot be less than 0)
    newBitDepth = Math.max(0, newBitDepth);

    // Drilling Logic
    const WOB_THRESHOLD = 1.0; // kips
    if (wob > WOB_THRESHOLD) {
        // We are on bottom and applying weight -> Drilling
        drillingState.bitDepth = newBitDepth;
        // Total Depth increases if we push past it
        if (drillingState.bitDepth > drillingState.totalDepth) {
            drillingState.totalDepth = drillingState.bitDepth;
        }
    } else {
        // Off bottom - moving freely
        drillingState.bitDepth = newBitDepth;
        // Bit cannot go deeper than hole depth if we aren't drilling (simplified colission)
        drillingState.bitDepth = Math.min(drillingState.bitDepth, drillingState.totalDepth);
    }

    // Update History
    drillingState.lastBlockPosition = currentBlockPos;
    saveDrillingState();

    return {
        wob: Number(wob.toFixed(1)),
        bit_depth: Number(drillingState.bitDepth.toFixed(2)),
        hole_depth: Number(drillingState.totalDepth.toFixed(2))
    };
};

// --- APIs for Calibration ---
app.post('/api/drilling/zero-wob', (req, res) => {
    // Set String Weight to current Hook Load
    // We need the latest hook load, which we might not have direct access to here easily 
    // without querying DB or caching. For now, let's accept it from the client or use valid cached data.
    // Better: Client sends current hookload to confirm? Or we just use strict state.
    // Let's rely on the body for now to be explicit, or fetch latest.
    const { currentHookLoad } = req.body;
    if (currentHookLoad !== undefined) {
        drillingState.stringWeight = Number(currentHookLoad);
        saveDrillingState();
        res.json({ success: true, stringWeight: drillingState.stringWeight });
    } else {
        res.status(400).json({ error: "Missing currentHookLoad" });
    }
});

app.post('/api/drilling/set-depth', (req, res) => {
    const { bitDepth, holeDepth } = req.body;
    if (bitDepth !== undefined) drillingState.bitDepth = Number(bitDepth);
    if (holeDepth !== undefined) drillingState.totalDepth = Number(holeDepth);
    saveDrillingState();
    res.json({ success: true, state: drillingState });
});

app.get('/api/drilling/state', (req, res) => {
    res.json(drillingState);
});

// --- Main Socket & Data Loop ---

// Modbus Configuration API helpers
const CONFIG_PATH = process.env.TELEGRAF_CONFIG_PATH || './telegraf/telegraf.conf';
const DB_PATH = './modbus_db.json'; // Simple JSON DB for storing Modbus config

const DEFAULT_MODBUS_CONFIG = {
  "slaves": [
    {
      "id": 1771097651783,
      "name": "SCHNIEDER_M",
      "ip": "192.168.0.11",
      "port": 502,
      "slaveId": 1,
      "registers": [
        {
          "name": "HOOK_LOAD",
          "address": 104,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "BLOCK_POSITION",
          "address": 900,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "WOB",
          "address": 3,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "ROP",
          "address": 4,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TORQUE",
          "address": 122,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "PUMP_PRESSURE",
          "address": 10,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "SPM_1",
          "address": 112,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "SPM_2",
          "address": 12,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TOTAL_SPM",
          "address": 112,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "FLOW_IN",
          "address": 14,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "FLOW_OUT",
          "address": 15,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "ENGINE_RPM",
          "address": 318,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "OIL_PRESSURE",
          "address": 314,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "OIL_TEMP",
          "address": 702,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "COOLANT_TEMP",
          "address": 312,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "EXHAUST_TEMP",
          "address": 700,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "FUEL_LEVEL",
          "address": 228,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "BATTERY_VOLTAGE",
          "address": 314,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TUBING_PRESSURE",
          "address": 30,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "CASING_PRESSURE",
          "address": 31,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "BOP_PRESSURE",
          "address": 32,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "ACCUMULATOR_PRESSURE",
          "address": 418,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "MANIEFOLD_PRESSURE",
          "address": 438,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "ANNULAR_PRESSURE",
          "address": 458,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRIP_TANK",
          "address": 158,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TANK_1",
          "address": 160,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TANK_2",
          "address": 161,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "FLOW_RATE",
          "address": 163,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "GAIN_LOSS",
          "address": 164,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "RIG_AIR_PRESSURE",
          "address": 350,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "PUMP_1_RUN",
          "address": 105,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "PUMP_2_RUN",
          "address": 111,
          "type": "discrete_input",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "ENGINE_RUN",
          "address": 112,
          "type": "discrete_input",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "SCR_ASSIGNMENT",
          "address": 114,
          "type": "discrete_input",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "ANNULAR_OPEN",
          "address": 101,
          "type": "discrete_input",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "PIPE_RAM_OPEN",
          "address": 4,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "BLIND_RAM_OPEN",
          "address": 6,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "SHEAR_RAM_OPEN",
          "address": 100,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "CROWNOMATIC",
          "address": 0,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "FLOOROMATIC",
          "address": 1,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "TRAVELLING_UP",
          "address": 3,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "TRAVELLING_DOWN",
          "address": 2,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "PIPE_RAM_CLOSE",
          "address": 5,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "BLIND_RAM_CLOSE",
          "address": 7,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "ANNULARRAM_OPEN",
          "address": 8,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "ANNULARRAM_CLOSE",
          "address": 9,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        }
      ]
    },
    {
      "id": 1771097651784,
      "name": "ALLISON",
      "ip": "192.168.0.10",
      "port": 502,
      "slaveId": 1,
      "registers": [
        {
          "name": "TRANS_OUTPUT_RPM",
          "address": 0,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_INPUT_RPM",
          "address": 1,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_ACTUAL_GEAR",
          "address": 2,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_TARGET_GEAR",
          "address": 3,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_OIL_TEMP",
          "address": 4,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_OIL_PRESS",
          "address": 5,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_LOCKUP_STATUS",
          "address": 6,
          "type": "coil",
          "dataType": "BOOL",
          "scale": 1
        },
        {
          "name": "TRANS_MODE",
          "address": 7,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_FAULT_LAMP",
          "address": 8,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_FAULT_SPN",
          "address": 9,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        },
        {
          "name": "TRANS_FAULT_FMI",
          "address": 10,
          "type": "holding_register",
          "dataType": "INT16",
          "scale": 1
        }
      ]
    }
  ]
};

// Helper: Read/Write JSON DB
const getModbusConfig = () => {
    if (!fs.existsSync(DB_PATH)) {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_MODBUS_CONFIG, null, 2));
        } catch (e) {
            console.error("Failed to write default modbus config:", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_MODBUS_CONFIG));
    }
    try {
        const data = fs.readFileSync(DB_PATH);
        if (data && data.length > 0) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Failed to parse modbus config, falling back to default:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_MODBUS_CONFIG));
};

const saveModbusConfig = (config) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(config, null, 2));
};

// Map Modbus fields to application categories
const FIELD_MAP = {
    "HOOK_LOAD": { meas: "drawworks", field: "hook_load" },
    "BLOCK_POSITION": { meas: "drawworks", field: "block_position" },
    "ENGINE_RPM": { meas: "engine", field: "rpm" },
    "OIL_PRESSURE": { meas: "engine", field: "oil_pressure" },
    "OIL_TEMP": { meas: "engine", field: "oil_temp" },
    "COOLANT_TEMP": { meas: "engine", field: "coolant_temp" },
    "EXHAUST_TEMP": { meas: "engine", field: "exhaust_temp" },
    "FUEL_LEVEL": { meas: "engine", field: "fuel_level" },
    "BATTERY_VOLTAGE": { meas: "engine", field: "battery_voltage" },
    "SPM_1": { meas: "mudpump", field: "spm" },
    "SPM_2": { meas: "mudpump", field: "spm_2" },
    "TOTAL_SPM": { meas: "mudpump", field: "total_spm" },
    "PUMP_PRESSURE": { meas: "mudpump", field: "pressure" },
    "FLOW_IN": { meas: "mudpump", field: "flow_in" },
    "FLOW_OUT": { meas: "mudpump", field: "flow_out" },
    "TUBING_PRESSURE": { meas: "wellcontrol", field: "tubing_pressure" },
    "CASING_PRESSURE": { meas: "wellcontrol", field: "casing_pressure" },
    "BOP_PRESSURE": { meas: "wellcontrol", field: "bop_pressure" },
    "ACCUMULATOR_PRESSURE": { meas: "wellcontrol", field: "accumulator_pressure" },
    "MANIEFOLD_PRESSURE": { meas: "wellcontrol", field: "manifold_pressure" },
    "MANIFOLD_PRESSURE": { meas: "wellcontrol", field: "manifold_pressure" },
    "ANNULAR_PRESSURE": { meas: "wellcontrol", field: "annular_pressure" },
    "TRIP_TANK": { meas: "fluid", field: "trip_tank" },
    "TANK_1": { meas: "fluid", field: "tank1" },
    "TANK_2": { meas: "fluid", field: "tank2" },
    "GAIN_LOSS": { meas: "fluid", field: "gain_loss" },
    "FLOW_RATE": { meas: "mudpump", field: "flow_rate" },
    "RIG_AIR_PRESSURE": { meas: "system", field: "rig_air_pressure" },
    "CROWNOMATIC": { meas: "drawworks", field: "crownomatic" },
    "FLOOROMATIC": { meas: "drawworks", field: "flooromatic" },
    "ANNULAR_OPEN": { meas: "wellcontrol", field: "annular_open" },
    "ANNULARRAM_OPEN": { meas: "wellcontrol", field: "annular_open" },
    "ANNULARRAM_CLOSE": { meas: "wellcontrol", field: "annular_close" },
    "PIPE_RAM_OPEN": { meas: "wellcontrol", field: "pipe_ram_open" },
    "PIPE_RAM_CLOSE": { meas: "wellcontrol", field: "pipe_ram_close" },
    "BLIND_RAM_OPEN": { meas: "wellcontrol", field: "blind_ram_open" },
    "BLIND_RAM_CLOSE": { meas: "wellcontrol", field: "blind_ram_close" },
    "SHEAR_RAM_OPEN": { meas: "wellcontrol", field: "shear_ram_open" },
    "TRAVELLING_UP": { meas: "drawworks", field: "travelling_up" },
    "TRAVELLING_DOWN": { meas: "drawworks", field: "travelling_down" },
    "TRANS_OUTPUT_RPM": { meas: "allison", field: "output_rpm" },
    "TRANS_INPUT_RPM": { meas: "allison", field: "input_rpm" },
    "TRANS_ACTUAL_GEAR": { meas: "allison", field: "actual_gear" },
    "TRANS_TARGET_GEAR": { meas: "allison", field: "target_gear" },
    "TRANS_OIL_TEMP": { meas: "allison", field: "oil_temp" },
    "TRANS_OIL_PRESS": { meas: "allison", field: "oil_pressure" },
    "TRANS_LOCKUP_STATUS": { meas: "allison", field: "lockup" },
    "TRANS_MODE": { meas: "allison", field: "mode" },
    "TRANS_FAULT_LAMP": { meas: "allison", field: "fault_lamp" },
    "TRANS_FAULT_SPN": { meas: "allison", field: "fault_spn" },
    "TRANS_FAULT_FMI": { meas: "allison", field: "fault_fmi" }
};

const SPN_DESCRIPTIONS = {
    190: "Engine Speed",
    191: "Transmission Output Shaft Speed",
    161: "Transmission Input Shaft Speed",
    177: "Transmission Oil Temperature",
    513: "Actual Engine - Percent Torque",
    630: "Calibration Memory Error",
    1241: "Transmission Reverse Gear Ratio Error"
};

const FMI_DESCRIPTIONS = {
    0: "Data valid but above normal operational range",
    1: "Data valid but below normal operational range",
    2: "Data erratic, intermittent or incorrect",
    3: "Voltage above normal, or shorted to high source",
    4: "Voltage below normal, or shorted to low source",
    5: "Current below normal or open circuit",
    6: "Current above normal or grounded circuit",
    12: "Bad intelligent device or component"
};

const queryData = async () => {
    // Query for latest values
    const measurements = ['drawworks', 'engine', 'mudpump', 'wellcontrol', 'modbus', 'allison'];
    const measurementFilter = measurements.map(m => `r["_measurement"] == "${m}"`).join(' or ');

    const fluxQuery = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -10s)
      |> filter(fn: (r) => ${measurementFilter})
      |> last()
  `;

    try {
        const data = {};
        await new Promise((resolve, reject) => {
            queryApi.queryRows(fluxQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    let meas = o._measurement;
                    let f = o._field;

                    if (FIELD_MAP[f]) {
                        meas = FIELD_MAP[f].meas;
                        f = FIELD_MAP[f].field;
                    }

                    if (!data[meas]) data[meas] = {};
                    data[meas][f] = o._value;
                },
                error(error) {
                    // console.error('InfluxDB Query Error:', error);
                    reject(error);
                },
                complete() {
                    resolve();
                },
            });
        });

        // --- Fresh Data Only (No Sticky State) ---
        const mergedData = {};
        Object.keys(data).forEach(meas => {
            mergedData[meas] = { ...data[meas] };
        });

        if (mergedData.drawworks || mergedData.engine || mergedData.mudpump) {
            // Pre-sanitize data (fix negative Hook Load etc.) before physics calculations
            sanitizeData(mergedData);

            // Run Physics Engine
            const physicsData = updatePhysics(mergedData);
            mergedData.drilling = physicsData;

            // Write drilling physics to InfluxDB so history tracks it
            writeDrillingToInflux(physicsData.wob, physicsData.bit_depth, physicsData.hole_depth);
        } else {
            // No Sensor Data (PLC Disconnected) -> Use explicit zeros
            mergedData.drilling = {
                wob: 0,
                bit_depth: 0,
                hole_depth: 0
            };
            writeDrillingToInflux(0, 0, 0);
        }

        const wcReal = mergedData.wellcontrol || {};
        mergedData.well_control = {
            annular_pressure: wcReal.annular_pressure || 0,
            manifold_pressure: wcReal.manifold_pressure || 0,
            accumulator_pressure: wcReal.accumulator_pressure || 0,
            annular_open: !!wcReal.annular_open,
            annular_close: !!wcReal.annular_close,
            pipe_ram_open: !!wcReal.pipe_ram_open,
            pipe_ram_close: !!wcReal.pipe_ram_close,
            blind_ram_open: !!wcReal.blind_ram_open,
            blind_ram_close: !!wcReal.blind_ram_close,
            shear_ram_open: !!wcReal.shear_ram_open
        };
        delete mergedData.wellcontrol;

        if (mergedData.engine && mergedData.engine.oil_pressure !== undefined) {
            mergedData.engine.oil_pressure = Number((mergedData.engine.oil_pressure * 6.89476).toFixed(1));
        }

        // If we have actual fresh data from InfluxDB and NOT in sim mode, emit it
        const hasFreshData = Object.keys(data).length > 0;

        let payloadToEmit;
        if (hasFreshData && !SIMULATION_MODE) {
            payloadToEmit = mergedData;
        } else if (SIMULATION_MODE) {
            // Generate Realistic Simulation Data
            simAngle += 0.2; // Speed up oscillation
            const osc = (base, amp) => base + Math.sin(simAngle) * amp + (Math.random() - 0.5) * (amp * 0.1);

            // Cycle through drilling states in simulation
            const cyclePhase = (simAngle * 0.5) % (Math.PI * 2); // Faster cycle
            if (cyclePhase < Math.PI * 0.8) {
                // Moving Down (Tripping In)
                drillingState.travelling_up = false;
                drillingState.travelling_down = true;
            } else if (cyclePhase < Math.PI * 1.0) {
                // Stopped at bottom
                drillingState.travelling_up = false;
                drillingState.travelling_down = false;
            } else if (cyclePhase < Math.PI * 1.8) {
                // Moving Up (Tripping Out)
                drillingState.travelling_up = true;
                drillingState.travelling_down = false;
            } else {
                // Stopped at top
                drillingState.travelling_up = false;
                drillingState.travelling_down = false;
            }

            // Simulate block movement based on flags
            const BLOCK_SPEED_SIM = 1.2; // Faster movement
            let currentBlockPos = drillingState.lastBlockPosition;
            if (drillingState.travelling_up) currentBlockPos = Math.min(145, currentBlockPos + BLOCK_SPEED_SIM);
            if (drillingState.travelling_down) currentBlockPos = Math.max(5, currentBlockPos - BLOCK_SPEED_SIM);
            
            // Trigger Saver Popups in Simulation
            const crownomatic = currentBlockPos > 140;
            const flooromatic = currentBlockPos < 5;

            const deltaBlock = (drillingState.lastBlockPosition || 0) - currentBlockPos;
            drillingState.lastBlockPosition = currentBlockPos;
            
            // Update Bit Depth & Hole Depth
            drillingState.bitDepth = Math.max(0, drillingState.bitDepth + deltaBlock);
            if (drillingState.bitDepth > drillingState.totalDepth) {
                drillingState.totalDepth = drillingState.bitDepth;
            }

            payloadToEmit = {
                drawworks: { 
                    hook_load: Number(osc(45, 5).toFixed(2)), 
                    block_position: Number(currentBlockPos.toFixed(2)), 
                    rpm: Number(osc(60, 10).toFixed(1)),
                    torque: Number(osc(1500, 200).toFixed(0)), // Added Torque
                    travelling_up: drillingState.travelling_up,
                    travelling_down: drillingState.travelling_down,
                    crownomatic: crownomatic ? 0 : 1,
                    flooromatic: flooromatic ? 0 : 1
                },
                engine: { 
                    rpm: Number(osc(1200, 100).toFixed(0)), 
                    torque: Number(osc(1800, 150).toFixed(0)), // Added Torque
                    pressure: Number(osc(60, 5).toFixed(1)), 
                    coolant_temp: Number(osc(85, 2).toFixed(1)), 
                    oil_pressure: Number(osc(450, 20).toFixed(1)),
                    fuel_level: 85,
                    battery_voltage: Number(osc(24.5, 0.5).toFixed(1))
                },
                mudpump: { 
                    spm: Number(osc(60, 5).toFixed(0)), 
                    spm_2: Number(osc(58, 4).toFixed(0)), 
                    total_spm: 118,
                    total_strokes: 15420, // Added Strokes
                    pressure: Number(osc(2500, 200).toFixed(0)), 
                    flow_in: Number(osc(400, 20).toFixed(1)), 
                    flow_out: Number(osc(395, 25).toFixed(1)),
                    flow_rate: Number(osc(405, 15).toFixed(1))
                },
                fluid: {
                    trip_tank: Number(osc(45, 2).toFixed(1)),
                    tank1: Number(osc(420, 10).toFixed(1)),
                    tank2: Number(osc(380, 8).toFixed(1)),
                    tank3: Number(osc(450, 12).toFixed(1)),
                    gain_loss: Number(osc(-2, 0.5).toFixed(1))
                },
                well_control: {
                    annular_pressure: Number(osc(1200, 50).toFixed(0)), 
                    manifold_pressure: Number(osc(800, 30).toFixed(0)), 
                    accumulator_pressure: Number(osc(3000, 100).toFixed(0)),
                    annular_open: cyclePhase < Math.PI,
                    annular_close: cyclePhase >= Math.PI,
                    pipe_ram_open: cyclePhase < Math.PI * 0.5 || cyclePhase > Math.PI * 1.5,
                    pipe_ram_close: cyclePhase >= Math.PI * 0.5 && cyclePhase <= Math.PI * 1.5,
                    blind_ram_open: cyclePhase < Math.PI * 1.2,
                    blind_ram_close: cyclePhase >= Math.PI * 1.2
                },
                system: { rig_air_pressure: Number(osc(110, 5).toFixed(1)) },
                drilling: {
                    wob: (cyclePhase < Math.PI && drillingState.travelling_down) ? Number(osc(15, 5).toFixed(1)) : 0,
                    bit_depth: Number(drillingState.bitDepth.toFixed(2)),
                    hole_depth: Number(drillingState.totalDepth.toFixed(2))
                },
                allison: {
                    output_rpm: Number(osc(1200, 100).toFixed(0)),
                    input_rpm: Number(osc(1250, 80).toFixed(0)),
                    actual_gear: Math.floor(osc(4, 1)),
                    target_gear: Math.floor(osc(4, 1)),
                    oil_temp: Number(osc(85, 5).toFixed(1)),
                    oil_pressure: Number(osc(220, 15).toFixed(1)),
                    lockup: Math.random() > 0.5,
                    mode: SIMULATION_MODE ? (global.allison_desired_mode !== undefined ? global.allison_desired_mode : (cyclePhase < Math.PI ? 1 : 0)) : 0,
                    fault_lamp: cyclePhase > Math.PI * 1.8 ? 1 : 0, // Rare amber lamp
                    fault_spn: cyclePhase > Math.PI * 1.8 ? 191 : 0,
                    fault_fmi: cyclePhase > Math.PI * 1.8 ? 2 : 0
                }
            };
            writeDrillingToInflux(payloadToEmit.drilling.wob, payloadToEmit.drilling.bit_depth, payloadToEmit.drilling.hole_depth);
            writeSimToInflux(payloadToEmit);
        } else {
            // No PLC Data and No Simulation: Emit explicit zeros
            payloadToEmit = {
                drawworks: { hook_load: 0, block_position: 0, rpm: 0 },
                engine: { rpm: 0, pressure: 0, coolant_temp: 0, oil_pressure: 0 },
                mudpump: { spm: 0, spm_2: 0, pressure: 0, flow_in: 0, flow_out: 0 },
                well_control: {
                    annular_pressure: 0, manifold_pressure: 0, accumulator_pressure: 0,
                    annular_open: false, annular_close: false, pipe_ram_open: false,
                    pipe_ram_close: false, blind_ram_open: false, blind_ram_close: false,
                    shear_ram_open: false
                },
                system: { rig_air_pressure: 0 },
                drilling: {
                    wob: 0,
                    bit_depth: 0,
                    hole_depth: 0
                }
            };
        }

        if (payloadToEmit.allison) {
            const spn = payloadToEmit.allison.fault_spn;
            const fmi = payloadToEmit.allison.fault_fmi;
            payloadToEmit.allison.spn_desc = SPN_DESCRIPTIONS[spn] || (spn > 0 ? "Unknown Fault Code" : "");
            payloadToEmit.allison.fmi_desc = FMI_DESCRIPTIONS[fmi] || (fmi > 0 ? "Unknown Error Mode" : "");
        }

        // Final safety check: no negative values except gain_loss (e.g. -162 Hook Load fix)
        sanitizeData(payloadToEmit);

        lastEmittedData = payloadToEmit;
        saveLastState(payloadToEmit);
        
        io.emit('rig_data', payloadToEmit);

    } catch (err) {
        // Fallback if Influx is completely down
        // console.error("Error querying InfluxDB:", err.message || err);
        if (SIMULATION_MODE) {
            // Re-run simulation logic for fallback
            // (Same as above but simplified for error path)
            simAngle += 0.05;
            const osc = (base, amp) => base + Math.sin(simAngle) * amp + (Math.random() - 0.5) * (amp * 0.1);
            
            let currentBlockPos = drillingState.lastBlockPosition || 0;
            const cyclePhase = (simAngle * 0.1) % (Math.PI * 2);
            if (cyclePhase < Math.PI) currentBlockPos = Math.max(0, currentBlockPos - 0.5);
            else currentBlockPos = Math.min(150, currentBlockPos + 0.5);
            
            drillingState.lastBlockPosition = currentBlockPos;

            const payload = {
                drawworks: { block_position: Number(currentBlockPos.toFixed(2)), hook_load: 45, travelling_up: cyclePhase >= Math.PI, travelling_down: cyclePhase < Math.PI },
                engine: { rpm: 1200, oil_pressure: 450 },
                mudpump: { spm: 60, pressure: 2500 },
                well_control: { annular_pressure: 1200, manifold_pressure: 800, accumulator_pressure: 3000 },
                drilling: { bit_depth: Number(drillingState.bitDepth.toFixed(2)), hole_depth: Number(drillingState.totalDepth.toFixed(2)), wob: 12 }
            };
            sanitizeData(payload);
            io.emit('rig_data', payload);
        }
    }
};

// Poll InfluxDB every second
setInterval(queryData, 1000);

// API: Get Historical Data
// API: Get Historical Data
app.get('/api/history', async (req, res) => {
    const { range, start, stop } = req.query;

    // Build range filter
    let rangeFilter = '';
    let windowPeriod = '5s';

    if (start && stop) {
        rangeFilter = `|> range(start: ${start}, stop: ${stop})`;

        // Calculate window dynamically based on duration
        const durationMs = new Date(stop).getTime() - new Date(start).getTime();
        const hours = durationMs / (1000 * 60 * 60);

        if (hours > 24 * 30 * 6) windowPeriod = '24h';
        else if (hours > 24 * 30) windowPeriod = '6h';
        else if (hours > 24 * 7) windowPeriod = '1h';
        else if (hours > 24) windowPeriod = '15m';
        else if (hours > 1) windowPeriod = '1m';
    } else {
        rangeFilter = `|> range(start: ${range || '-30s'})`;

        if (range?.includes('mo'))  windowPeriod = '24h';
        else if (range?.includes('30d')) windowPeriod = '6h';
        else if (range?.includes('7d'))  windowPeriod = '2h';
        else if (range?.includes('3d'))  windowPeriod = '30m';
        else if (range?.includes('24h')) windowPeriod = '15m';
        else if (range?.includes('12h')) windowPeriod = '5m';
        else if (range?.includes('6h'))  windowPeriod = '2m';
        else if (range?.includes('1h'))  windowPeriod = '30s';
        else if (range?.includes('15m')) windowPeriod = '5s';
        else if (range?.includes('10m')) windowPeriod = '5s';
        else if (range?.includes('5m'))  windowPeriod = '2s';
        else if (range?.includes('1m'))  windowPeriod = '1s';
    }

    // Determine if we need date in the time label
    const needsDate = range?.includes('24h') || range?.includes('3d') || range?.includes('7d') || range?.includes('30d') || range?.includes('mo') || (start && stop);

    const measurements = ['drawworks', 'engine', 'mudpump', 'wellcontrol', 'modbus', 'drilling'];
    const measurementFilter = measurements.map(m => `r["_measurement"] == "${m}"`).join(' or ');

    const fluxQuery = `
    import "types"
    from(bucket: "${INFLUX_BUCKET}")
      ${rangeFilter}
      |> filter(fn: (r) => ${measurementFilter})
      |> filter(fn: (r) => types.isType(v: r._value, type: "float") or types.isType(v: r._value, type: "int") or types.isType(v: r._value, type: "uint"))
      |> aggregateWindow(every: ${windowPeriod}, fn: mean, createEmpty: false)
      |> yield(name: "mean")
  `;

    try {
        const history = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(fluxQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    let meas = o._measurement;
                    let f = o._field;

                    if (FIELD_MAP[f]) {
                        meas = FIELD_MAP[f].meas;
                        f = FIELD_MAP[f].field;
                    }

                    let finalValue = o._value;
                    if (typeof finalValue === 'number' && f !== 'gain_loss' && finalValue < 0) {
                        finalValue = 0;
                    }
                    history.push({
                        time: o._time,
                        measurement: meas,
                        field: f,
                        value: finalValue
                    });
                },
                error(error) {
                    console.error(error);
                    reject(error);
                },
                complete() {
                    resolve();
                }
            });
        });

        // Group by timestamp for the chart
        const grouped = {};
        history.forEach(pt => {
            const t = new Date(pt.time).getTime(); // Use numeric timestamp as key
            if (!grouped[t]) {
                const d = new Date(pt.time);
                let label;
                if (needsDate) {
                    label = d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                } else {
                    label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                }
                grouped[t] = { name: label, timestamp: t };
            }
            grouped[t][`${pt.measurement}.${pt.field}`] = pt.value;
        });

        // Sort by numeric timestamp (not string)
        res.json(Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modbus Configuration API

// Helper: Generate Telegraf TOML
const generateTelegrafConfig = (config) => {
    let toml = '';
    config.slaves.forEach(slave => {
        toml += `[[inputs.modbus]]\n`;
        toml += `  name = "${slave.name}"\n`;
        toml += `  slave_id = ${slave.slaveId}\n`;
        toml += `  timeout = "1s"\n`;
        toml += `  controller = "tcp://${slave.ip}:${slave.port}"\n`;

        toml += `  configuration_type = "register"\n`;
        toml += `  optimization = "none"\n\n`;

        // Discrete Inputs
        const discretes = slave.registers.filter(r => r.type === 'discrete_input' && r.address !== null && r.address !== undefined && r.address !== "");
        if (discretes.length > 0) {
            toml += `  discrete_inputs = [\n`;
            discretes.forEach(r => {
                toml += `    { name = "${r.name}", address = [${r.address}] },\n`;
            });
            toml += `  ]\n`;
        }

        // Coils
        const coils = slave.registers.filter(r => r.type === 'coil' && r.address !== null && r.address !== undefined && r.address !== "");
        if (coils.length > 0) {
            toml += `  coils = [\n`;
            coils.forEach(r => {
                toml += `    { name = "${r.name}", address = [${r.address}] },\n`;
            });
            toml += `  ]\n`;
        }

        // Holding Registers (INT16, FLOAT32, etc.)
        const holding = slave.registers.filter(r => (r.type === 'holding_register' || r.type === 'input_register') && r.address !== null && r.address !== undefined && r.address !== "");
        if (holding.length > 0) {
            toml += `  holding_registers = [\n`;
            holding.forEach(r => {
                let scaleVal = r.scale !== undefined && r.scale !== null && r.scale !== "" ? Number(r.scale) : 1.0;
                let scaleStr = Number.isInteger(scaleVal) ? scaleVal.toFixed(1) : String(scaleVal);
                // Use AB for 16-bit, ABCD for 32-bit (assuming Big Endian default)
                const byteOrder = (r.dataType === 'INT16' || r.dataType === 'UINT16') ? 'AB' : 'ABCD';
                toml += `    { name = "${r.name}", byte_order = "${byteOrder}", data_type = "${r.dataType}", scale = ${scaleStr}, address = [${r.address}] },\n`;
            });
            toml += `  ]\n`;
        }
        toml += `\n`;
    });
    return toml;
};

// API: Set Allison Mode
app.post('/api/allison/mode', async (req, res) => {
    const { mode } = req.body; // 0 for Roading, 1 for Hoisting
    console.log(`[ALLISON] Setting mode to ${mode === 1 ? 'HOISTING' : 'ROADING'}`);

    if (SIMULATION_MODE) {
        global.allison_desired_mode = mode;
        return res.json({ success: true, message: "Mode set in simulation" });
    }

    try {
        const modbusDb = getModbusConfig();
        const allisonDevice = modbusDb.slaves.find(s => s.name === "ALLISON");
        if (!allisonDevice) throw new Error("Allison device not found in config");

        const client = new ModbusRTU();
        await client.connectTCP(allisonDevice.ip, { port: allisonDevice.port || 502 });
        await client.setID(allisonDevice.slaveId || 1);
        
        // Write to register 7
        await client.writeRegister(7, mode);
        client.close();

        res.json({ success: true });
    } catch (err) {
        console.error("[ALLISON] Modbus write failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Get Modbus Config
app.get('/api/modbus', (req, res) => {
    res.json(getModbusConfig());
});

// API: Save Modbus Config
app.post('/api/modbus', (req, res) => {
    try {
        const config = req.body; // Expect { slaves: [...] }
        saveModbusConfig(config);

        // Update Telegraf.conf
        // 1. Read existing file
        let content = fs.readFileSync(CONFIG_PATH, 'utf8');

        // 2. Find markers
        const startMarker = '# MODBUS_CONFIG_START';
        const endMarker = '# MODBUS_CONFIG_END';
        const startIndex = content.indexOf(startMarker);
        const endIndex = content.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error("Telegraf configuration file is missing markers.");
        }

        // 3. Generate new section
        const newSection = generateTelegrafConfig(config);

        // 4. Replace content
        const before = content.substring(0, startIndex + startMarker.length);
        const after = content.substring(endIndex);
        const newContent = `${before}\n${newSection}\n${after}`;
        fs.writeFileSync(CONFIG_PATH, newContent);
        // 5. Restart Telegraf Container via Docker Socket API (Native Node)
        const options = {
            socketPath: '/var/run/docker.sock',
            path: '/containers/romi_telegraf/restart',
            method: 'POST'
        };

        const dockerReq = http.request(options, (dockerRes) => {
            if (dockerRes.statusCode === 204 || dockerRes.statusCode === 200) {
                console.log("Telegraf container restarted successfully via Docker API.");
                res.json({ success: true, message: "Configuration saved and Telegraf restarted successfully." });
            } else {
                console.error("Docker API error restarting telegraf:", dockerRes.statusCode);
                res.status(500).json({ success: false, error: 'Config saved, but failed to restart Telegraf. Docker status: ' + dockerRes.statusCode });
            }
        });

        dockerReq.on('error', (err) => {
            console.error("Failed to connect to Docker socket:", err);
            res.status(500).json({ success: false, error: 'Config saved, but Docker socket connection failed: ' + err.message });
        });

        dockerReq.end();

    } catch (err) {
        console.error("Error saving modbus config:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- User Management ---
const USERS_FILE = './users.json';
let users = [];

const DEFAULT_USERS = [
  {
    "id": 1771434240021,
    "username": "Digital_Twin",
    "password": "ongc123",
    "role": "admin",
    "status": "active"
  },
  {
    "id": 1778483409392,
    "username": "Rtdmm_ROMI",
    "password": "Ongc@123",
    "role": "viewer",
    "status": "active"
  }
];

// Load users
const loadUsers = () => {
    if (fs.existsSync(USERS_FILE)) {
        try {
            users = JSON.parse(fs.readFileSync(USERS_FILE));
        } catch (e) {
            console.error("Failed to load users:", e);
            users = JSON.parse(JSON.stringify(DEFAULT_USERS));
        }
    } else {
        users = JSON.parse(JSON.stringify(DEFAULT_USERS));
        saveUsers();
    }
};

const saveUsers = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

loadUsers();

// API: List Users
app.get('/api/users', (req, res) => {
    // Return users without passwords
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
});

// API: Add User
app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: "Username already exists" });
    }

    const newUser = {
        id: Date.now(),
        username,
        password, // In prod, hash this!
        role: role || 'operator',
        status: 'active'
    };
    users.push(newUser);
    saveUsers();
    res.json({ success: true, user: { ...newUser, password: undefined } });
});

// API: Update User
app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { username, password, role, status } = req.body;

    const index = users.findIndex(u => u.id == id);
    if (index === -1) return res.status(404).json({ error: "User not found" });

    // Update fields
    if (username) users[index].username = username;
    if (password) users[index].password = password; // In prod, hash!
    if (role) users[index].role = role;
    if (status) users[index].status = status;

    saveUsers();
    res.json({ success: true, user: { ...users[index], password: undefined } });
});

// API: Delete User
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const initialLength = users.length;
    users = users.filter(u => u.id != id);

    if (users.length < initialLength) {
        saveUsers();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// --- Dashboard Persistence ---
const DASHBOARD_FULL_CONFIG_FILE = './dashboard_layout.json';

// Default Layout (Fallback)
// Default Layout (Fallback)
const DEFAULT_DASHBOARD_CONFIG = {
  "pages": {
    "dashboard": {
      "gauges": [
        {
          "id": "rig_vis",
          "type": "rig_visualizer",
          "gridWidth": 2,
          "height": 411,
          "label": "RIG VISUALIZER",
          "x": 0,
          "y": 0,
          "w": 210,
          "h": 520
        },
        {
          "id": "d1",
          "label": "HOOK LOAD",
          "dataKey": "hook_load",
          "min": 0,
          "max": 100,
          "unit": "ton",
          "color": "#38bdf8",
          "gridWidth": 3,
          "size": 220,
          "majorTicks": 10,
          "minorTicks": 4,
          "height": 289,
          "x": 220,
          "y": 0,
          "w": 300,
          "h": 369
        },
        {
          "id": "v_allison",
          "type": "allison_panel",
          "label": "ALLISON TRANS",
          "x": 220,
          "y": 380,
          "w": 300,
          "h": 311
        },
        {
          "id": "v_params",
          "type": "stats_panel",
          "panelId": "key_params",
          "defaultTitle": "KEY PARAMETERS",
          "gridWidth": 3,
          "height": 167,
          "x": 0,
          "y": 530,
          "w": 212,
          "h": 165
        },
        {
          "id": "v_engine",
          "type": "stats_panel",
          "panelId": "engine",
          "defaultTitle": "CAT ENGINE",
          "gridWidth": 4,
          "height": 283,
          "x": 530,
          "y": 0,
          "w": 420,
          "h": 366
        },
        {
          "id": "v_bop",
          "type": "stats_panel",
          "panelId": "bop",
          "defaultTitle": "BOP STATUS",
          "gridWidth": 4,
          "height": 286,
          "x": 530,
          "y": 380,
          "w": 420,
          "h": 310
        },
        {
          "id": "v_mudvol",
          "type": "mud_volume_panel",
          "gridWidth": 6,
          "height": 300,
          "x": 960,
          "y": 380,
          "w": 260,
          "h": 308
        },
        {
          "id": "v_mudpump",
          "type": "mud_pump_panel",
          "gridWidth": 6,
          "height": 300,
          "x": 960,
          "y": 0,
          "w": 262,
          "h": 367
        }
      ],
      "sideStats": [
        {
          "key": "pump_pressure",
          "label": "Pump Pressure",
          "unit": "psi",
          "min": 0,
          "max": 5000
        },
        {
          "key": "torque",
          "label": "Rotary Torque",
          "unit": "ft-lbs",
          "min": 0,
          "max": 20000
        }
      ],
      "units": {
        "wob": "tonnes",
        "depth": "m"
      },
      "page": "dashboard"
    },
    "engine": {
      "layout": [
        {
          "id": "engine_gauges",
          "type": "gauges",
          "gridWidth": 12
        },
        {
          "id": "maintenance",
          "type": "maintenance",
          "gridWidth": 12
        },
        {
          "id": "load",
          "type": "metric",
          "title": "ENGINE TORQUE",
          "dataKey": "torque",
          "unit": "ft-lbs",
          "iconName": "Activity",
          "color": "#a78bfa",
          "gridWidth": 4
        },
        {
          "id": "fuel",
          "type": "metric",
          "title": "FUEL LEVEL",
          "dataKey": "fuel_level",
          "unit": "%",
          "iconName": "Droplets",
          "color": "#3b82f6",
          "gridWidth": 4
        },
        {
          "id": "battery",
          "type": "metric",
          "title": "BATTERY VOLTAGE",
          "dataKey": "battery_voltage",
          "unit": "V",
          "iconName": "Battery",
          "color": "#eab308",
          "gridWidth": 4
        }
      ]
    },
    "mudpump": {
      "layout": [
        {
          "id": "spm",
          "type": "metric",
          "title": "PUMP SPM",
          "dataKey": "spm",
          "unit": "SPM",
          "iconName": "Activity",
          "color": "#ec4899",
          "gridWidth": 3
        },
        {
          "id": "pressure",
          "type": "metric",
          "title": "PRESSURE",
          "dataKey": "pressure",
          "unit": "psi",
          "iconName": "Gauge",
          "color": "#ef4444"
        },
        {
          "id": "flow_in",
          "type": "metric",
          "title": "FLOW IN",
          "dataKey": "flow_in",
          "unit": "GPM",
          "iconName": "Droplets",
          "color": "#3b82f6",
          "gridWidth": 3
        },
        {
          "id": "flow_out",
          "type": "metric",
          "title": "FLOW OUT",
          "dataKey": "flow_out",
          "unit": "GPM",
          "iconName": "Waves",
          "color": "#22c55e",
          "gridWidth": 3
        },
        {
          "id": "total_strokes",
          "type": "metric",
          "title": "TOTAL STROKES",
          "dataKey": "total_spm",
          "unit": "Strokes",
          "iconName": "Activity",
          "color": "#f59e0b",
          "gridWidth": null
        },
        {
          "id": "trend",
          "type": "trend",
          "gridWidth": null
        }
      ]
    },
    "wellcontrol": {
      "layout": [
        {
          "id": "well_stats",
          "type": "stats",
          "gridWidth": 12
        },
        {
          "id": "bop_stack",
          "type": "bop_stack",
          "gridWidth": 4
        },
        {
          "id": "killsheet",
          "type": "killsheet",
          "gridWidth": 8
        }
      ]
    },
    "edr": {
      "layout": [
        {
          "id": "track_0",
          "type": "track",
          "trackIndex": 0
        },
        {
          "id": "track_1",
          "type": "track",
          "trackIndex": 1
        },
        {
          "id": "track_2",
          "type": "track",
          "trackIndex": 2
        }
      ],
      "tracks": [
        {
          "left": {
            "metric": "drawworks.hook_load",
            "min": 90,
            "max": 150
          },
          "right": {
            "metric": "mudpump.pressure",
            "min": 9,
            "max": 21
          }
        },
        {
          "left": {
            "metric": "allison.input_rpm",
            "min": 12,
            "max": 20
          },
          "right": {
            "metric": "engine.oil_pressure",
            "min": 110,
            "max": 130
          }
        },
        {
          "left": {
            "metric": "mudpump.pressure",
            "min": 2000,
            "max": 3000
          },
          "right": {
            "metric": "fluid.gain_loss",
            "min": -6,
            "max": 6
          }
        }
      ]
    },
    "fishing": {
      "layout": [
        {
          "id": "overpull_gauge",
          "type": "overpull_gauge",
          "gridWidth": 5
        },
        {
          "id": "hook_load",
          "type": "metric",
          "label": "Actual Hook Load",
          "dataKey": "hookLoad",
          "color": "#38bdf8",
          "gridWidth": 3
        },
        {
          "id": "settings",
          "type": "settings",
          "gridWidth": 4
        },
        {
          "id": "analytics",
          "type": "analytics",
          "gridWidth": 6
        },
        {
          "id": "overpull_hist",
          "type": "overpull_hist",
          "gridWidth": 6
        },
        {
          "id": "depth_pos",
          "type": "depth_pos",
          "gridWidth": 3
        },
        {
          "id": "jarring",
          "type": "jarring",
          "gridWidth": 3
        },
        {
          "id": "pressure",
          "type": "pressure",
          "gridWidth": 3
        },
        {
          "id": "torque",
          "type": "metric",
          "label": "Rotary Torque",
          "dataKey": "torque",
          "color": "#a78bfa",
          "unit": "ft-lbs",
          "gridWidth": 3
        }
      ]
    }
  },
  "units": {
    "wob": "tonnes",
    "depth": "m"
  },
  "wellInfo": {
    "well": "ABCD",
    "rig": "ROM-I"
  },
  "page": "dashboard",
  "gauges": [
    {
      "id": "rig_vis",
      "type": "rig_visualizer",
      "gridWidth": 2,
      "height": 411,
      "label": "RIG VISUALIZER",
      "x": 0,
      "y": 0,
      "w": 210,
      "h": 520
    },
    {
      "id": "d1",
      "label": "HOOK LOAD",
      "dataKey": "hook_load",
      "min": 0,
      "max": 100,
      "unit": "ton",
      "color": "#38bdf8",
      "gridWidth": 3,
      "size": 220,
      "majorTicks": 10,
      "minorTicks": 4,
      "height": 289,
      "x": 220,
      "y": 0,
      "w": 300,
      "h": 369
    },
    {
      "id": "v_allison",
      "type": "allison_panel",
      "label": "ALLISON TRANS",
      "x": 220,
      "y": 380,
      "w": 300,
      "h": 311
    },
    {
      "id": "v_params",
      "type": "stats_panel",
      "panelId": "key_params",
      "defaultTitle": "KEY PARAMETERS",
      "gridWidth": 3,
      "height": 167,
      "x": 0,
      "y": 530,
      "w": 212,
      "h": 165
    },
    {
      "id": "v_engine",
      "type": "stats_panel",
      "panelId": "engine",
      "defaultTitle": "CAT ENGINE",
      "gridWidth": 4,
      "height": 283,
      "x": 530,
      "y": 0,
      "w": 420,
      "h": 366
    },
    {
      "id": "v_bop",
      "type": "stats_panel",
      "panelId": "bop",
      "defaultTitle": "BOP STATUS",
      "gridWidth": 4,
      "height": 286,
      "x": 530,
      "y": 380,
      "w": 420,
      "h": 310
    },
    {
      "id": "v_mudvol",
      "type": "mud_volume_panel",
      "gridWidth": 6,
      "height": 300,
      "x": 960,
      "y": 380,
      "w": 260,
      "h": 308
    },
    {
      "id": "v_mudpump",
      "type": "mud_pump_panel",
      "gridWidth": 6,
      "height": 300,
      "x": 960,
      "y": 0,
      "w": 262,
      "h": 367
    }
  ]
};

const getDashboardConfig = () => {
    let config = null;
    if (fs.existsSync(DASHBOARD_FULL_CONFIG_FILE)) {
        try {
            const data = fs.readFileSync(DASHBOARD_FULL_CONFIG_FILE, 'utf8');
            if (data && data.trim()) {
                config = JSON.parse(data);
            }
        } catch (e) {
            console.error("Failed to load dashboard config:", e);
        }
    }
    
    // If no config found or error, use default and save it
    if (!config) {
        config = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_CONFIG));
        saveDashboardConfig(config);
    }
    return JSON.parse(JSON.stringify(config));
};

const saveDashboardConfig = (config) => {
    fs.writeFileSync(DASHBOARD_FULL_CONFIG_FILE, JSON.stringify(config, null, 2));
};

// API: Get Dashboard Layout (Multi-page support)
app.get('/api/dashboard/layout', (req, res) => {
    const pageId = req.query.page;
    const config = getDashboardConfig();
    
    if (pageId && config.pages && config.pages[pageId]) {
        // Return page-specific layout merged with global units/wellInfo
        return res.json({
            ...config.pages[pageId],
            units: config.units,
            wellInfo: config.wellInfo
        });
    }
    
    res.json(config);
});

// API: Save Dashboard Layout (Multi-page support)
app.post('/api/dashboard/layout', (req, res) => {
    const pageId = req.query.page || req.body.page;
    const incomingUpdate = req.body;
    let config = getDashboardConfig();

    if (pageId) {
        // Update specific page layout
        if (!config.pages) config.pages = {};
        config.pages[pageId] = {
            ...config.pages[pageId],
            ...incomingUpdate
        };
        // Also update legacy top-level gauges if updating the main dashboard
        if (pageId === 'dashboard' && incomingUpdate.gauges) {
            config.gauges = incomingUpdate.gauges;
        }
    } else {
        // Global update (units, wellInfo, or legacy gauges)
        config = {
            ...config,
            ...incomingUpdate
        };
    }

    saveDashboardConfig(config);

    // Broadcast targeted update for the specific page
    const broadcastData = pageId ? { 
        ...config.pages[pageId], 
        units: config.units,
        wellInfo: config.wellInfo,
        page: pageId 
    } : config;

    io.emit('dashboard_layout_update', broadcastData);
    res.json({ success: true, config });
});

// --- Authentication API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username && u.password === password && u.status !== 'inactive');

    if (user) {
        // Return mock token and user info (excluding password)
        const { password, ...safeUser } = user;
        res.json({
            success: true,
            token: `mock-jwt-token-romii-${user.role}`,
            user: safeUser
        });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials or account inactive' });
    }
});
