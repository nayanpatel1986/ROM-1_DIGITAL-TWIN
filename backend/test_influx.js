const { InfluxDB } = require('@influxdata/influxdb-client');

const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'my-super-secret-auth-token';
const INFLUX_ORG = process.env.INFLUX_ORG || 'romi_org';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'romi_bucket';

const queryApi = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN }).getQueryApi(INFLUX_ORG);

const query = `
  import "influxdata/influxdb/schema"
  schema.measurements(bucket: "${INFLUX_BUCKET}")
`;

const query2 = `
  from(bucket: "${INFLUX_BUCKET}")
    |> range(start: -10m)
    |> last()
`;

async function run() {
    console.log("Measurements:");
    try {
        await new Promise((resolve, reject) => {
            queryApi.queryRows(query, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    console.log("Measurement:", o._value);
                },
                error(error) {
                    console.error('Error fetching measurements:', error);
                    reject(error);
                },
                complete() {
                    resolve();
                }
            });
        });

        console.log("\nLatest Data:");
        await new Promise((resolve, reject) => {
            queryApi.queryRows(query2, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    console.log(`Meas: ${o._measurement}, Field: ${o._field}, Value: ${o._value}, Tags:`, JSON.stringify(Object.keys(o).filter(k => !k.startsWith('_')).reduce((acc, k) => { acc[k] = o[k]; return acc; }, {})));
                },
                error(error) {
                    console.error('Error fetching data:', error);
                    reject(error);
                },
                complete() {
                    resolve();
                }
            });
        });
    } catch (e) {
        console.error(e);
    }
}
run();
