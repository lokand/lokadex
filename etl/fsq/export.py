"""extract.py's parquet → NDJSON for to-sql.ts."""
import sys
import duckdb

src, dst = sys.argv[1], sys.argv[2]
duckdb.connect().execute(f"COPY (SELECT * FROM read_parquet('{src}')) TO '{dst}' (FORMAT json)")
