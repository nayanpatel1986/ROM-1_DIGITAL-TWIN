require('dotenv').config();
const { InfluxDB } = require('@influxdata/influxdb-client');

const client = new InfluxDB({
    url: process.env.INFLUX_URL || 'http://localhost:8086',
    token: process.env.INFLUX_TOKEN || 'my-super-secret-auth-token'
});
const queryApi = client.getQueryApi(process.env.INFLUX_ORG || 'romi_org');

const fluxQuery = `
    import "influxdata/influxdb/schema"
    schema.measurements(bucket: "${process.env.INFLUX_BUCKET || 'romi_bucket'}")
`;

console.log("Querying...");
queryApi.queryRows(fluxQuery, {
    next(row, tableMeta) {
        console.log('Row:', tableMeta.toObject(row));
    },
    error(error) {
        console.error('Error:', error);
    },
    complete() {
        console.log('Complete');
    }
});
