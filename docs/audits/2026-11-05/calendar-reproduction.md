# Calendar integrity reproduction

Audited against `3fe1585` on November 5, 2026. Synthetic inputs; no database or provider calls. Run from the repository root. These commands demonstrate existing defects; they are not fixed by this audit.

```sh
node --import tsx --input-type=commonjs <<'JS'
const {buildSessionCalendar,resolveReleaseSession}=require('./src/services/market/sessionCalendar.ts');
const {resolveSessionMeasurements}=require('./src/services/events/reactionMeasurement.ts');
const cases=[{day:'2022-07-01',next:'2022-07-05',release:'2022-07-01T18:00:00Z'},{day:'2022-12-23',next:'2022-12-27',release:'2022-12-23T19:00:00Z'},{day:'2026-07-02',next:'2026-07-06',release:'2026-07-02T18:00:00Z'}];
for(const c of cases){const calendar=buildSessionCalendar([c.day,c.next]);console.log(JSON.stringify({case:'false_early_close',day:c.day,actualEarlyClose:calendar.isEarlyClose(c.day),expectedEarlyClose:false,actualReleaseSession:resolveReleaseSession(calendar,new Date(c.release)),expectedReleaseSession:c.day}));}
const calendar=buildSessionCalendar(['2022-06-30','2022-07-01','2022-07-05','2022-07-06']);
const result=resolveSessionMeasurements({symbol:'SPY',releaseAt:new Date('2022-07-01T18:00:00Z'),calendar,priceBasis:'SPLIT_ADJUSTED',daily:[{sessionDay:'2022-07-01',barAt:new Date('2022-07-01T13:30:00Z'),close:100},{sessionDay:'2022-07-05',barAt:new Date('2022-07-05T13:30:00Z'),close:101}]});
console.log(JSON.stringify({case:'post_release_close_accepted_as_anchor',actual:result,actualAnchorPriceAvailability:'2022-07-01T20:00:00Z',releaseAt:'2022-07-01T18:00:00Z',expected:'July 1 remains the release session; its final close must not anchor this release'}));
JS
```

Expected from the official schedules: all three dates are ordinary equity sessions, and their 14:00 ET releases remain assigned to that day. In the anchor example the July 1 close cannot be known until 20:00Z, two hours after the release.

Observed output is recorded below.

```jsonl
{"case":"false_early_close","day":"2022-07-01","actualEarlyClose":true,"expectedEarlyClose":false,"actualReleaseSession":{"status":"resolved","day":"2022-07-05","index":1},"expectedReleaseSession":"2022-07-01"}
{"case":"false_early_close","day":"2022-12-23","actualEarlyClose":true,"expectedEarlyClose":false,"actualReleaseSession":{"status":"resolved","day":"2022-12-27","index":1},"expectedReleaseSession":"2022-12-23"}
{"case":"false_early_close","day":"2026-07-02","actualEarlyClose":true,"expectedEarlyClose":false,"actualReleaseSession":{"status":"resolved","day":"2026-07-06","index":1},"expectedReleaseSession":"2026-07-02"}
{"case":"post_release_close_accepted_as_anchor","actual":{"status":"resolved","measurements":[{"measure":"RELEASE_SESSION","anchorKind":"PRIOR_SESSION_CLOSE","anchorPrice":100,"anchorBarAt":"2022-07-01T13:30:00.000Z","anchorSessionDay":"2022-07-01","endpointPrice":101,"endpointBarAt":"2022-07-05T13:30:00.000Z","endpointSessionDay":"2022-07-05","releaseSessionDay":"2022-07-05","pctChange":1,"priceBasis":"SPLIT_ADJUSTED","sessionBasis":"US_EQUITY_RTH"}]},"actualAnchorPriceAvailability":"2022-07-01T20:00:00Z","releaseAt":"2022-07-01T18:00:00Z","expected":"July 1 remains the release session; its final close must not anchor this release"}
```
