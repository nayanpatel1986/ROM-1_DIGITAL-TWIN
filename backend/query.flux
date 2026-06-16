from(bucket: "romi_bucket") |> range(start: 0) |> keep(columns: ["_measurement", "_field"]) |> distinct(column: "_field")
