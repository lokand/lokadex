"""Extract one metro's places from Foursquare OS Places (Apache-2.0).

    python3 etl/fsq/extract.py istanbul 2026-10-15

Reads only the matching rows straight from Hugging Face (needs a token for
the gated dataset; the session proxy injects it) and writes
etl/out/fsq-<metro>-<release>.parquet. Keeps open places refreshed in the
last three years, in food & drink and personal-care categories.
"""
import os
import sys
import time

import duckdb

METROS = {
    "istanbul": (40.8, 41.35, 28.4, 29.45),
}

CATEGORY_PREFIXES = [
    "Dining and Drinking",
    "Business and Professional Services > Health and Beauty Service",
]

BASE = "https://huggingface.co/datasets/foursquare/fsq-os-places/resolve/main/release/dt={release}/places/parquet"


def connect():
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        con.execute(f"SET http_proxy='{proxy.replace('http://', '').rstrip('/')}'")
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        con.execute(f"SET ca_cert_file='{ca}'")
    return con


def main(metro: str, release: str, files: int = 100) -> None:
    lat_lo, lat_hi, lng_lo, lng_hi = METROS[metro]
    con = connect()
    urls = [f"{BASE.format(release=release)}/places_{i:06d}.parquet" for i in range(files)]
    cats = " OR ".join(f"starts_with(lbl, '{p}')" for p in CATEGORY_PREFIXES)
    out_dir = os.path.join(os.path.dirname(__file__), "..", "out")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"fsq-{metro}-{release}.parquet")
    t = time.time()
    con.execute(
        f"""
        COPY (
          SELECT fsq_place_id, name, latitude, longitude, address, locality, region, postcode,
                 country, tel, website, instagram, fsq_category_labels, date_refreshed
          FROM read_parquet({urls!r})
          WHERE latitude BETWEEN {lat_lo} AND {lat_hi}
            AND longitude BETWEEN {lng_lo} AND {lng_hi}
            AND date_closed IS NULL
            AND try_cast(date_refreshed AS DATE) >= current_date - INTERVAL 3 YEAR
            AND len(list_filter(fsq_category_labels, lambda lbl: {cats})) > 0
        ) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
        """
    )
    n = con.execute(f"SELECT count(*) FROM read_parquet('{out}')").fetchone()[0]
    print(f"{metro}: {n} places -> {out} ({time.time() - t:.0f}s)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
