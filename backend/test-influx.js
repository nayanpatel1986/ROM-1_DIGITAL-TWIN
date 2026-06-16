const { InfluxDB } = require('@influxdata/influxdb-client');

const url = 'http://influxdb:8086'; // Adjust if needed
const token = 'my-super-secret-auth-token';
const org = 'romi_org';
const bucket = 'romi_bucket';

const queryApi = new InfluxDB({ url, token }).getQueryApi(org);

const fluxQuery = `
from(bucket: "${bucket}")
    |> range(start: -30s)
    |> filter(fn: (r) => r._measurement == "modbus")
    |> filter(fn: (r) => r._field == "BLIND_RAM_CLOSE")
`;

const data = [];
queryApi.queryRows(fluxQuery, {
    next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        data.push({ time: o._time, value: o._value });
    },
    error(error) {
        console.error('InfluxDB Query Error:', error);
    },
    complete() {
        console.log("RAW MODBUS MEASUREMENT INFLUXDB RESPONSE:");
        console.log(JSON.stringify(data, null, 2));
    },
});
