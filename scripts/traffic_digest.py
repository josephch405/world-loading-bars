#!/usr/bin/env python3
"""Traffic digest for world-loading-bars (PostHog).

Pulls the trailing N days of PostHog events for the site, separates real
visitors from headless/test traffic using user-agent + distinct-id
heuristics, and prints a Markdown report to stdout.

Usage:
    python3 scripts/traffic_digest.py [--days 7] [--min-cluster 4]

Auth (first method that works wins):
  1. POSTHOG_API_KEY env var (a PostHog personal API key -- never commit one
     to this repo).
  2. The workspace's `custom.posthog` connector via the skill-creator
     `dynamic_credentials` helper (only present on the owner's machine; the
     helper injects a short-lived surrogate, so no raw key ever touches this
     script).

Project id defaults to the world-loading-bars project; override with
POSTHOG_PROJECT_ID or --project. The query API host defaults to
https://app.posthog.com; override with POSTHOG_HOST.

Heuristics (documented, reproducible; see classify() for the exact rules):
  * bot      -- raw user agent matches a bot/headless pattern.
  * test     -- a fingerprint cluster: >= min-cluster distinct_ids sharing the
                same (UA, browser, version, OS, device, screen size), each
                with <= 3 events in the window (the classic "fresh headless
                profile per run" pattern); or a single-shot visitor with
                exactly 1 event.
  * real     -- multi-page visits, $pageleave, clicks/autocapture, survey
                interaction, or a session spanning >= 30s with >= 3 events.
  * uncertain-- everything else.

This is a traffic-quality digest, not a privacy tool: distinct_ids are
truncated in the report, and nothing is ever written back to PostHog.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

DEFAULT_PROJECT = "621439"
DEFAULT_HOST = "https://app.posthog.com"
BATCH = 1000

BOT_UA_RE = re.compile(
    r"bot|crawl|slurp|spider|mediapartners|baidu|yandex|sogou|exabot|facebot|"
    r"ia_archiver|ahrefs|semrush|mj12bot|dotbot|headless|phantomjs|puppeteer|"
    r"playwright|selenium|webdriver|lighthouse|gtmetrix|pingdom|uptimerobot|"
    r"site24x7|datadog",
    re.IGNORECASE,
)


def die(msg: str) -> "NoReturn":
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------- auth / api


def build_request(host: str, project: str, hogql: str) -> urllib.request.Request:
    url = f"{host.rstrip('/')}/api/projects/{project}/query/"
    body = json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    api_key = os.environ.get("POSTHOG_API_KEY")
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")
        return req
    # Fallback: workspace connector surrogate (no raw key involved).
    sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
    try:
        from dynamic_credentials import add_surrogate_to_request  # noqa: E402
    except ImportError:
        die("no POSTHOG_API_KEY set and no workspace connector available")
    add_surrogate_to_request(
        req, "custom.posthog", entry_name="access_token",
        allowed_hosts=[host.replace("https://", "").replace("http://", "")],
    )
    return req


def hogql_query(host: str, project: str, hogql: str) -> dict:
    req = build_request(host, project, hogql)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8", "replace")[:500]
        except Exception:
            detail = ""
        die(f"PostHog query failed: HTTP {e.code} {e.reason}: {detail}")


def fetch_events(host: str, project: str, days: int) -> list[dict]:
    # Keyset pagination: PostHog's query API rejects OFFSET on personal API
    # keys, so page on (timestamp, uuid) instead.
    events: list[dict] = []
    last_ts = "1970-01-01T00:00:00.000000Z"
    last_uuid = "00000000-0000-0000-0000-000000000000"
    while True:
        q = (
            "SELECT uuid, timestamp, event, distinct_id, properties FROM events "
            f"WHERE timestamp > now() - INTERVAL {days} DAY "
            f"AND (timestamp > toDateTime64('{last_ts}', 6) "
            f"OR (timestamp = toDateTime64('{last_ts}', 6) AND uuid > '{last_uuid}')) "
            f"ORDER BY timestamp, uuid LIMIT {BATCH}"
        )
        data = hogql_query(host, project, q)
        rows = data.get("results", [])
        for row in rows:
            props = row[4]
            if isinstance(props, str):
                try:
                    props = json.loads(props)
                except json.JSONDecodeError:
                    props = {}
            events.append(
                {
                    "uuid": row[0],
                    "timestamp": row[1],
                    "event": row[2],
                    "distinct_id": row[3],
                    "properties": props or {},
                }
            )
        if len(rows) < BATCH:
            break
        last_ts = events[-1]["timestamp"]
        last_uuid = events[-1]["uuid"]
    return events


# ---------------------------------------------------------------- classify


def fingerprint(props: dict) -> tuple:
    return (
        props.get("$raw_user_agent") or props.get("$user_agent") or "",
        props.get("$browser") or "",
        str(props.get("$browser_version") or ""),
        props.get("$os") or "",
        props.get("$device_type") or "",
        str(props.get("$screen_width") or ""),
        str(props.get("$screen_height") or ""),
    )


def short_ua(ua: str) -> str:
    m = re.search(r"(Chrome|Firefox|Safari|Edge|HeadlessChrome)/([\d.]+)", ua)
    os_m = re.search(r"\(([^;]+);", ua)
    browser = f"{m.group(1)} {m.group(2).split('.')[0]}" if m else "?"
    osname = os_m.group(1) if os_m else ""
    return f"{browser} on {osname}".strip()


def classify(visitors: dict[str, list[dict]], min_cluster: int) -> dict[str, tuple[str, str]]:
    """Return {distinct_id: (class, reason)} for class in bot/test/real/uncertain."""
    result: dict[str, tuple[str, str]] = {}

    # 1. Bot UAs first.
    for vid, evs in visitors.items():
        ua = evs[0]["properties"].get("$raw_user_agent", "") or ""
        if BOT_UA_RE.search(ua):
            result[vid] = ("bot", "bot/headless UA pattern")

    # 2. Test-burst clusters: same fingerprint across many ids. The cluster
    # rule runs before the human-like rules because one automated run that
    # happens to trigger autocapture or a survey must not torpedo the match
    # for the other ids sharing its fingerprint.
    by_fp: dict[tuple, list[str]] = defaultdict(list)
    for vid, evs in visitors.items():
        if vid in result:
            continue
        by_fp[fingerprint(evs[0]["properties"])].append(vid)
    for fp, vids in by_fp.items():
        thin = [v for v in vids if len(visitors[v]) <= 3]
        if len(vids) >= min_cluster and len(thin) / len(vids) >= 0.75:
            ua = short_ua(fp[0])
            for v in vids:
                result[v] = (
                    "test",
                    f"fingerprint cluster x{len(vids)} "
                    f"({ua}, {len(thin)}/{len(vids)} with <=3 events)",
                )

    # 3. Single-shot visitors.
    for vid, evs in visitors.items():
        if vid in result:
            continue
        if len(evs) == 1:
            result[vid] = ("test", "single-shot: 1 event in window")

    # 4. Human-like behavior.
    for vid, evs in visitors.items():
        if vid in result:
            continue
        names = {e["event"] for e in evs}
        pages = {e["properties"].get("$pathname") for e in evs if e["event"] == "$pageview"}
        pages.discard(None)
        ts = [e["timestamp"] for e in evs]
        span = (
            datetime.fromisoformat(max(ts).replace("Z", "+00:00"))
            - datetime.fromisoformat(min(ts).replace("Z", "+00:00"))
        ).total_seconds()
        interactive = {"$autocapture", "$pageleave", "survey shown", "survey dismissed",
                       "survey sent"} & names
        if len(pages) >= 2:
            result[vid] = ("real", f"{len(pages)} pages viewed")
        elif interactive:
            result[vid] = ("real", f"interactive ({', '.join(sorted(interactive))})")
        elif span >= 30 and len(evs) >= 3:
            result[vid] = ("real", f"session span {span:.0f}s, {len(evs)} events")
        else:
            result[vid] = ("uncertain", "thin session, no interaction signal")
    return result


# ---------------------------------------------------------------- report


def fmt_ts(ts: str) -> str:
    return ts.replace("T", " ")[:19] + "Z"


def vitals_summary(evs: list[dict]) -> str:
    parts = []
    for ev in evs:
        if ev["event"] != "$web_vitals":
            continue
        p = ev["properties"]
        for key, label in (
            ("$web_vitals_LCP_value", "LCP"),
            ("$web_vitals_INP_value", "INP"),
            ("$web_vitals_CLS_value", "CLS"),
            ("$web_vitals_FCP_value", "FCP"),
        ):
            v = p.get(key)
            if isinstance(v, (int, float)):
                parts.append(f"{label}={v:.0f}ms")
    return "; ".join(parts) or "no vitals recorded"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--min-cluster", type=int, default=4)
    ap.add_argument("--project", default=os.environ.get("POSTHOG_PROJECT_ID", DEFAULT_PROJECT))
    ap.add_argument("--host", default=os.environ.get("POSTHOG_HOST", DEFAULT_HOST))
    args = ap.parse_args()

    events = fetch_events(args.host, args.project, args.days)
    visitors: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        visitors[e["distinct_id"]].append(e)

    labels = classify(visitors, args.min_cluster)
    by_class: dict[str, list[str]] = defaultdict(list)
    for vid, (cls, _) in labels.items():
        by_class[cls].append(vid)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        f"# Traffic digest — world-loading-bars",
        "",
        f"Window: trailing {args.days} days, generated {now}. "
        f"PostHog project {args.project}.",
        "",
        "## Totals",
        "",
    ]
    if not events:
        lines += ["No events in window.", ""]
        print("\n".join(lines))
        return 0

    etypes: dict[str, int] = defaultdict(int)
    for e in events:
        etypes[e["event"]] += 1
    lines += [f"- Events: {len(events)} ({', '.join(f'{k} {v}' for k, v in sorted(etypes.items(), key=lambda x: -x[1]))})"]
    lines += [f"- Distinct visitors (distinct_ids): {len(visitors)}"]
    lines.append("")

    lines += ["## Real vs test split", ""]
    for cls in ("real", "test", "uncertain", "bot"):
        vids = by_class.get(cls, [])
        nev = sum(len(visitors[v]) for v in vids)
        lines.append(f"- {cls}: {len(vids)} visitors, {nev} events")
    lines.append("")

    real_vids = by_class.get("real", [])
    if real_vids:
        lines += ["## Real visitors", ""]
        lines += ["| visitor | events | span | pages | interaction | browser | geo | vitals |"]
        lines += ["|---|---|---|---|---|---|---|---|"]
        for vid in sorted(real_vids, key=lambda v: visitors[v][0]["timestamp"]):
            evs = visitors[vid]
            props0 = evs[0]["properties"]
            names = {e["event"] for e in evs}
            pages = sorted({e["properties"].get("$pathname", "?") for e in evs if e["event"] == "$pageview"})
            ts = [e["timestamp"] for e in evs]
            span_s = (
                datetime.fromisoformat(max(ts).replace("Z", "+00:00"))
                - datetime.fromisoformat(min(ts).replace("Z", "+00:00"))
            ).total_seconds()
            inter = ", ".join(sorted(names - {"$pageview", "$web_vitals"})) or "-"
            city = props0.get("$geoip_city_name", "?")
            lines.append(
                f"| `{vid[:8]}` | {len(evs)} | {fmt_ts(min(ts))} -> {fmt_ts(max(ts))} "
                f"({span_s:.0f}s) | {' '.join(p.replace('/world-loading-bars', '') or '/' for p in pages)} "
                f"| {inter} | {short_ua(props0.get('$raw_user_agent', ''))} "
                f"{props0.get('$screen_width', '')}x{props0.get('$screen_height', '')} | {city} | {vitals_summary(evs)} |"
            )
        lines.append("")

    test_vids = by_class.get("test", [])
    if test_vids:
        lines += ["## Filtered test traffic", ""]
        clusters: dict[str, list[str]] = defaultdict(list)
        for vid in test_vids:
            clusters[labels[vid][1]].append(vid)
        for reason, vids in sorted(clusters.items(), key=lambda x: -len(x[1])):
            nev = sum(len(visitors[v]) for v in vids)
            lines.append(f"- {len(vids)} visitors, {nev} events -- {reason}")
        lines.append("")

    unc_vids = by_class.get("uncertain", [])
    if unc_vids:
        lines += ["## Uncertain (needs a second look)", ""]
        for vid in unc_vids:
            evs = visitors[vid]
            lines.append(
                f"- `{vid[:8]}`: {len(evs)} events "
                f"({', '.join(sorted({e['event'] for e in evs}))}), "
                f"{short_ua(evs[0]['properties'].get('$raw_user_agent', ''))} -- {labels[vid][1]}"
            )
        lines.append("")

    # Real pageviews by page.
    real_pvs: dict[str, int] = defaultdict(int)
    refs: dict[str, int] = defaultdict(int)
    real_set = set(real_vids)
    for e in events:
        if e["event"] == "$pageview" and e["distinct_id"] in real_set:
            real_pvs[e["properties"].get("$pathname", "?")] += 1
            r = e["properties"].get("$referrer", "?")
            refs[r if r != "$direct" else "direct"] += 1
    if real_pvs:
        lines += ["## Real pageviews by page", ""]
        for p, n in sorted(real_pvs.items(), key=lambda x: -x[1]):
            lines.append(f"- {p}: {n}")
        lines.append("")
        lines += ["## Referrers (real traffic)", ""]
        for r, n in sorted(refs.items(), key=lambda x: -x[1]):
            lines.append(f"- {r}: {n}")
        lines.append("")

    lines += [
        "## Method",
        "",
        "Visitors are grouped by `distinct_id`; each visitor is fingerprinted "
        "on raw user agent + browser/version + OS + device type + screen size. "
        "A UA matching a bot/headless pattern is dropped as `bot`. When >= "
        f"`--min-cluster` (={args.min_cluster}) ids share one fingerprint and "
        ">= 75% of them have <= 3 events, the whole cluster is treated as one "
        "automated run (`test`) -- the cluster rule runs before the "
        "human-like rules so a single automated hit that triggered "
        "autocapture does not split the cluster. Single-event ids are `test`. "
        "Human-like behavior (2+ pages, "
        "$pageleave, clicks, survey interaction, or >= 30s session with >= 3 "
        "events) marks `real`; the rest is `uncertain`. Tune the knobs in "
        "classify() if the site's traffic mix changes.",
        "",
    ]
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
