#!/usr/bin/env python3
"""Fetch the world-level history behind each daily question.

Writes data/question-trends.json: {question_id: [[year, value], ...]} using the
same source the question cites (World Bank API or the Our World in Data grapher
CSV). Re-run when data/daily-questions.json changes, then rebuild the pages with
scripts/build_question_pages.py.
"""

import csv
import io
import json
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'worldpercent.com trend fetch'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8')


def world_bank(indicator):
    url = (f'https://api.worldbank.org/v2/country/WLD/indicator/{indicator}'
           '?format=json&per_page=200')
    meta, rows = json.loads(get(url))
    return sorted((int(r['date']), round(r['value'], 1)) for r in rows or [] if r['value'] is not None)


def owid(slug, detail):
    text = get(f'https://ourworldindata.org/grapher/{slug}.csv?useColumnShortNames=false')
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    cols = header[3:]
    if len(cols) == 1:
        col = 3
    else:
        matches = [i for i, c in enumerate(cols) if c.lower() in detail.lower()]
        if len(matches) != 1:
            raise ValueError(f'{slug}: cannot pick a column from {cols} for "{detail}"')
        col = 3 + matches[0]
    out = []
    for row in reader:
        # OWID's long-run electricity mix before 1985 is sparse estimates; start there
        if row[0] == 'World' and row[col] and int(row[2]) >= 1985:
            out.append((int(row[2]), round(float(row[col]), 1)))
    return sorted(out)


def main():
    with open(os.path.join(ROOT, 'data', 'daily-questions.json'), encoding='utf-8') as f:
        questions = json.load(f)['questions']
    trends = {}
    for q in questions:
        url = q['url'].rstrip('/')
        slug = url.rsplit('/', 1)[-1]
        try:
            if 'worldbank.org' in url:
                series = world_bank(slug)
            elif 'ourworldindata.org' in url:
                series = owid(slug, q['source_detail'])
            else:
                series = []
        except Exception as e:  # keep going; a page without a trend still builds
            print(f'! {q["id"]}: {e}', file=sys.stderr)
            series = []
        # Some indicators are per 1,000 (e.g. under-5 mortality); the question is per 100
        if series and abs(series[-1][1] / 10 - q['answer']) < abs(series[-1][1] - q['answer']):
            series = [(y, round(v / 10, 1)) for y, v in series]
        trends[q['id']] = [list(p) for p in series]
        last = series[-1] if series else None
        print(f'{q["id"]}: {len(series)} points, latest {last}, question says {q["answer"]} ({q["year"]})')
    with open(os.path.join(ROOT, 'data', 'question-trends.json'), 'w', encoding='utf-8') as f:
        json.dump(trends, f, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    main()
