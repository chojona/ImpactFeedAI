"""Regenerate the synthetic NQ parquet fixtures used by tests/nqArchiveParquet.test.ts.

Every value is invented; nothing comes from the licensed archive.
Run from the repo root:  python3 tests/fixtures/nqArchive/make_parquet_fixtures.py
Requires pyarrow (developer machine only; the test suite reads the committed files).
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path(__file__).parent / "parquet"
BASE = datetime(2024, 6, 12, 12, 0, tzinfo=timezone.utc)
NS_PER_MINUTE = 60 * 1_000_000_000


def epoch_ns(dt: datetime) -> int:
    return int(dt.timestamp()) * 1_000_000_000


def rows(contract: str, minutes: range, day_offset: int = 0) -> list[dict]:
    out = []
    for m in minutes:
        open_at = BASE + timedelta(days=day_offset, minutes=m)
        px = 15_000 + m * 0.25
        out.append(
            {
                "ts_event_ns": epoch_ns(open_at),
                "timestamp_utc": epoch_ns(open_at),
                "trading_date": open_at.strftime("%Y-%m-%d"),
                "contract": contract,
                "open": px,
                "high": px + 0.5,
                "low": px - 0.25,
                "close": px + 0.25,
                "volume": 5,
            }
        )
    return out


def schema(ts_type: pa.DataType) -> pa.Schema:
    return pa.schema(
        [
            ("ts_event_ns", pa.int64()),
            ("timestamp_utc", ts_type),
            ("trading_date", pa.string()),
            ("contract", pa.string()),
            ("open", pa.float64()),
            ("high", pa.float64()),
            ("low", pa.float64()),
            ("close", pa.float64()),
            ("volume", pa.int64()),
        ]
    )


NS_UTC = pa.timestamp("ns", tz="UTC")


def write(name: str, records: list[dict], ts_type: pa.DataType = NS_UTC, convert=None) -> None:
    columns = {key: [r[key] for r in records] for key in records[0]}
    if convert is not None:
        columns["timestamp_utc"] = convert(columns["timestamp_utc"])
    table = pa.table(columns, schema=schema(ts_type))
    pq.write_table(table, OUT / name, row_group_size=5, compression="snappy")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    good = rows("NQM24", range(10)) + rows("NQU24", range(10)) + rows("NQM24", range(5), day_offset=1)
    write("bars_ok.parquet", good)
    write(
        "bars_ms.parquet",
        rows("NQM24", range(3)),
        pa.timestamp("ms", tz="UTC"),
        lambda ns: [v // 1_000_000 for v in ns],
    )

    sub_ns = rows("NQM24", range(3))
    sub_ns[1]["timestamp_utc"] += 1
    sub_ns[1]["ts_event_ns"] += 1
    write("bars_sub_ns.parquet", sub_ns)

    sub_us = rows("NQM24", range(3))
    sub_us[1]["timestamp_utc"] += 1_000
    write(
        "bars_sub_us.parquet",
        sub_us,
        pa.timestamp("us", tz="UTC"),
        lambda ns: [v // 1_000 for v in ns],
    )

    conflict = rows("NQM24", range(3))
    # timestamp_utc one minute later than the provider's bar-open ts_event_ns.
    conflict[1]["ts_event_ns"] -= NS_PER_MINUTE
    write("bars_ts_conflict.parquet", conflict)

    write(
        "bars_raw_int64.parquet",
        rows("NQM24", range(3)),
        pa.int64(),
        lambda ns: [v // 1_000 for v in ns],
    )
    write(
        "bars_string_ts.parquet",
        rows("NQM24", range(3)),
        pa.string(),
        lambda ns: [
            datetime.fromtimestamp(v / 1e9, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            for v in ns
        ],
    )
    write("bars_naive_ts.parquet", rows("NQM24", range(3)), pa.timestamp("ns"))

    null_ts = rows("NQM24", range(3))
    null_ts[2]["timestamp_utc"] = None
    write("bars_null_ts.parquet", null_ts)

    null_contract = rows("NQM24", range(3))
    null_contract[1]["contract"] = None
    write("bars_null_contract.parquet", null_contract)


if __name__ == "__main__":
    main()
