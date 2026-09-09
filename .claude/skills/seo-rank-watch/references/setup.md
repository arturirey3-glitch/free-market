# Access and execution

Search Console registration and sitemap submission do not provide API authentication. The API needs an OAuth token with `https://www.googleapis.com/auth/webmasters.readonly`.

Supported external credential JSON:
- Google service account JSON (`type: service_account`, `client_email`, `private_key`). Add its email as a user of the Search Console property; enable Search Console API in that Google Cloud project.
- OAuth authorized-user JSON (`type: authorized_user`, `client_id`, `client_secret`, `refresh_token`) issued with the readonly scope.

Store the JSON outside the repository. Set `GSC_CREDENTIALS_FILE` to its absolute path in the execution environment. A service account JSON for another project is not evidence it has access to this property. Never reuse unrelated credentials speculatively.

The verified property is `sc-domain:felikko.com`; an exact-origin page filter prevents mixing www/skill/shop performance. Country and device default to all, matching the user's Search Console view. Changing scope starts a different series and never rewrites old observations.

Commands require Node 20 or newer, no additional npm dependencies:
```
node .claude/skills/seo-rank-watch/scripts/fetch_gsc_ranks.mjs --repo . --days 7 --append
node .claude/skills/seo-rank-watch/scripts/seo_watch.mjs --repo . review
node .claude/skills/seo-rank-watch/scripts/seo_watch.mjs --repo . plan
node --test .claude/skills/seo-rank-watch/scripts/*.test.mjs
```

GSC dates use Pacific time; reporting/cooldown uses Asia/Tokyo. Default end date is three days before today in Pacific time and requests `dataState: final`. Reports keep exact dates, source and scope. The API may omit low-volume/anonymized queries and does not promise all rows; discovery is not an exhaustive keyword inventory.

Automated execution needs BOTH GSC access and an authenticated AI runner that supports web search, repository edits and tests. A scheduled measurement script alone does not perform content improvements. Do not report automation as enabled until a real first cycle and scheduler registration have been verified. Keep credentials out of task arguments, repository files and logs. Use an execution lock to prevent overlapping runs.

`scripts/run_cycle.mjs --config <EXTERNAL_JSON>` measures, reviews and commits the data. It starts `codex exec` with web search only when an eligible candidate exists, then checks for uncommitted changes. The external runner JSON contains `repo`, `credentialsFile` (path only), `codexPath`, `syncRemote` and `allowPublish`. A full-cycle lock prevents overlap. Logs go to ignored `.seo-runtime/`. Missing API access, Git errors or a dirty working tree stop the run. The first scheduled run must be verified with the same Windows user and access to the credential share. A PC-based schedule requires the PC to be on and that user logged in.

Official references:
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
