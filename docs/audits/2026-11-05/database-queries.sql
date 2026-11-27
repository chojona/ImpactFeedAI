-- ImpactFeedAI V2 audit, November 5, 2026. Read-only aggregate/catalog queries.
-- Execute on the intended endpoint with credentials supplied out-of-band.
-- Result keys correspond to database-snapshot.json. No repair or migration commands.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SHOW transaction_read_only;

-- migrations (compare checksum to SHA-256 of the corresponding local migration.sql)
SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name;

-- counts
SELECT 'events' AS relation,count(*)::int AS rows FROM events UNION ALL SELECT 'data_releases',count(*)::int FROM data_releases UNION ALL SELECT 'asset_reactions_archive',count(*)::int FROM asset_reactions UNION ALL SELECT 'reaction_measurements',count(*)::int FROM reaction_measurements UNION ALL SELECT 'candles',count(*)::int FROM candles;

-- eventTypes
SELECT event_type,count(*)::int AS events,min(occurred_at) AS earliest_display,max(occurred_at) AS latest_display,min(release_at) AS earliest_release,max(release_at) AS latest_release FROM events GROUP BY 1 ORDER BY 1;

-- timing
SELECT timing_status,count(*)::int AS events,count(release_at)::int AS exact_instants,count(release_date)::int AS release_dates,count(*) FILTER(WHERE release_at IS NOT NULL AND timing_status IN ('VERIFIED','SCHEDULED') AND nullif(trim(timing_source),'') IS NOT NULL)::int AS eligible FROM events GROUP BY 1 ORDER BY 1;

-- releaseCoverage
SELECT count(*)::int AS releases,count(*) FILTER(WHERE actual_value IS NULL)::int AS missing_actual,count(*) FILTER(WHERE expected_value IS NULL)::int AS missing_forecast,count(*) FILTER(WHERE metric_key IS NULL)::int AS missing_metric_key,count(*) FILTER(WHERE reference_period_start IS NULL)::int AS missing_reference_period,count(*) FILTER(WHERE nullif(trim(actual_source),'') IS NULL OR nullif(trim(actual_source_url),'') IS NULL)::int AS incomplete_actual_provenance,count(*) FILTER(WHERE surprise_magnitude IS NOT NULL)::int AS stored_surprises FROM data_releases;

-- consensus
SELECT consensus_status,count(*)::int AS releases,count(expected_value)::int AS forecast_values,count(*) FILTER(WHERE consensus_source IS NOT NULL AND consensus_source_url IS NOT NULL AND consensus_as_of IS NOT NULL)::int AS provenance_complete FROM data_releases GROUP BY 1 ORDER BY 1;

-- metrics
SELECT metric_key,metric_name,count(*)::int AS rows,min(reference_period_start) AS first_reference,max(reference_period_start) AS last_reference FROM data_releases GROUP BY 1,2 ORDER BY 1,2;

-- measureCoverage
SELECT calculation_version,measure,count(*)::int AS rows,count(DISTINCT event_id)::int AS events,count(DISTINCT symbol)::int AS instruments FROM reaction_measurements GROUP BY 1,2 ORDER BY 1,2;

-- measureSymbols
SELECT symbol,session_basis,measure,count(*)::int AS rows FROM reaction_measurements WHERE calculation_version=3 GROUP BY 1,2,3 ORDER BY 1,3;

-- missingMeasurements
WITH eligible AS (SELECT id FROM events WHERE release_at IS NOT NULL AND timing_status IN ('VERIFIED','SCHEDULED') AND nullif(trim(timing_source),'') IS NOT NULL) SELECT count(*)::int AS eligible_events,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM reaction_measurements r WHERE r.event_id=e.id AND calculation_version=3))::int AS without_any_v3,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM reaction_measurements r WHERE r.event_id=e.id AND calculation_version=3 AND measure='INTRADAY_60M'))::int AS without_first_hour FROM eligible e;

-- measurementIntegrity
SELECT count(*) FILTER(WHERE e.release_at IS NULL OR e.timing_status NOT IN ('VERIFIED','SCHEDULED') OR nullif(trim(e.timing_source),'') IS NULL)::int AS ineligible_timing_rows,count(*) FILTER(WHERE r.anchor_price<=0 OR r.endpoint_price<=0 OR r.anchor_price::text IN ('NaN','Infinity','-Infinity') OR r.endpoint_price::text IN ('NaN','Infinity','-Infinity') OR r.pct_change::text IN ('NaN','Infinity','-Infinity'))::int AS invalid_numeric_rows,count(*) FILTER(WHERE abs(r.pct_change-((r.endpoint_price-r.anchor_price)/nullif(r.anchor_price,0)*100))>0.000001)::int AS arithmetic_mismatches,count(*) FILTER(WHERE r.measure='INTRADAY_60M' AND (r.anchor_bar_at>=e.release_at OR r.anchor_bar_at < e.release_at-interval '2 hours' OR r.endpoint_bar_at < e.release_at+interval '1 hour' OR r.endpoint_bar_at>e.release_at+interval '3 hours'))::int AS intraday_bound_violations FROM reaction_measurements r JOIN events e ON e.id=r.event_id WHERE r.calculation_version=3;

-- consensusIntegrity
SELECT count(*)::int AS invalid_verified_forecasts FROM data_releases d JOIN events e ON e.id=d.event_id WHERE d.consensus_status='VERIFIED' AND (d.expected_value IS NULL OR d.consensus_as_of IS NULL OR e.release_at IS NULL OR d.consensus_as_of>e.release_at OR nullif(trim(d.consensus_source),'') IS NULL OR nullif(trim(d.consensus_source_url),'') IS NULL);

-- candles
SELECT symbol,interval,price_basis,ingestion_version,count(*)::int AS rows,min(open_time) AS first_bar,max(open_time) AS last_bar,max(fetched_at) AS last_fetch,count(*) FILTER(WHERE volume IS NULL)::int AS null_volume FROM candles GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

-- calendarExposure
SELECT e.id,e.headline,e.release_at,count(r.id)::int AS measurements FROM events e LEFT JOIN reaction_measurements r ON r.event_id=e.id AND r.calculation_version=3 WHERE (e.release_at AT TIME ZONE 'America/New_York')::date IN ('2022-07-01','2022-12-23','2026-07-02') OR r.anchor_session_day IN ('2022-07-01','2022-12-23','2026-07-02') OR r.release_session_day IN ('2022-07-01','2022-12-23','2026-07-02') GROUP BY 1,2,3 ORDER BY 3;

-- indexes
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;

-- columns
SELECT table_name,column_name,data_type,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;

-- constraints
SELECT conrelid::regclass::text AS relation,conname,contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2;

-- supplemental actual provenance field-presence check (run after the main snapshot)
SELECT count(actual_source)::int AS actual_source_count, count(actual_source_url)::int AS actual_source_url_count, count(metric_key)::int AS metric_key_count, count(reference_period_start)::int AS reference_period_count FROM data_releases;

ROLLBACK;
