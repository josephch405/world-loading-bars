#!/usr/bin/env python3
"""Build one static, guess-first page per daily question, plus an index.

Reads data/daily-questions.json and data/question-trends.json (see
scripts/fetch_trends.py) and writes q/<slug>.html, q/index.html and
sitemap.xml. Re-run after changing either data file; the output is committed
because the site is plain GitHub Pages.
"""

import glob
import html
import json
import os
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = 'https://worldpercent.com/'
BRAND = 'World Loading Bars'
TODAY = date.today().isoformat()

TOPICS = {
    'tech': 'Technology', 'money': 'Money', 'energy': 'Energy', 'health': 'Health',
    'education': 'Education', 'living': 'Living', 'people': 'People', 'work': 'Work',
    'nature': 'Nature',
}

with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
    _home = f.read()
# Reuse the exact analytics snippet from the home page
POSTHOG = _home[_home.index('    <script>\n        !function(t,e)'):_home.index('</script>', _home.index('!function(t,e)')) + len('</script>')]

e = html.escape


def fmt(n):
    return str(int(n)) if float(n).is_integer() else f'{n:.1f}'


def answer_sentence(q):
    """'Out of every 100 people, how many use the internet?' -> '... 73.6 use the internet.'"""
    text = q['question'].rstrip('?')
    value = ('$' if '$100' in text else '') + fmt(q['answer'])
    for phrase in ('how many ', 'how much '):
        if phrase in text:
            return text.replace(phrase, value + ' ', 1) + '.'
    return f'{text}: {value}.'


def trend_note(series, q):
    if len(series) < 3:
        return ''
    y0, v0 = series[0]
    if abs(v0 - q['answer']) < 0.5:
        return f'About the same as in {y0}.'
    word = 'up' if q['answer'] > v0 else 'down'
    return f'{word.capitalize()} from {fmt(v0)} in {y0}.'


def chart(series, q):
    """Inline SVG line chart in the site's ink colours; no JS needed."""
    if len(series) < 3:
        return ''
    w, h, pl, pr, pt, pb = 640, 220, 8, 56, 16, 28
    years = [y for y, _ in series]
    vals = [v for _, v in series]
    top = max(vals + [q['answer']])
    ymax = 100 if top > 60 else (50 if top > 25 else (25 if top > 10 else 10))
    x0, x1 = min(years), max(years)

    def X(y):
        return pl + (y - x0) / max(1, x1 - x0) * (w - pl - pr)

    def Y(v):
        return pt + (1 - v / ymax) * (h - pt - pb)

    pts = ' '.join(f'{X(y):.1f},{Y(v):.1f}' for y, v in series)
    grid = ''.join(
        f'<line x1="{pl}" x2="{w - pr}" y1="{Y(g):.1f}" y2="{Y(g):.1f}" class="q-grid"/>'
        f'<text x="{w - pr + 8}" y="{Y(g) + 4:.1f}" class="q-axis">{g}</text>'
        for g in (0, ymax / 2, ymax))
    grid = grid.replace('.0<', '<')
    last_y, last_v = series[-1]
    first_y, first_v = series[0]
    label = f'Line chart, world, {first_y} to {last_y}: from {fmt(first_v)} to {fmt(last_v)} out of 100.'
    return f'''<figure class="q-chart">
                <svg viewBox="0 0 {w} {h}" role="img" aria-label="{e(label)}">
                    {grid}
                    <polyline points="{pts}" class="q-line"/>
                    <circle cx="{X(last_y):.1f}" cy="{Y(last_v):.1f}" r="4" class="q-dot"/>
                    <text x="{pl}" y="{h - 6}" class="q-axis">{first_y}</text>
                    <text x="{w - pr}" y="{h - 6}" class="q-axis" text-anchor="end">{last_y}</text>
                </svg>
            </figure>'''


def head(title, description, canonical, og_type='article'):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#f6f4ee">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg">
    <title>{e(title)}</title>
    <script>document.documentElement.classList.add('js-q');</script>
    <meta name="description" content="{e(description)}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:title" content="{e(title)}">
    <meta property="og:description" content="{e(description)}">
    <meta property="og:url" content="{canonical}">
    <meta property="og:type" content="{og_type}">
    <meta property="og:image" content="{SITE}og-daily.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="{SITE}og-daily.png">
    <meta name="twitter:title" content="{e(title)}">
    <meta name="twitter:description" content="{e(description)}">
{POSTHOG}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../home.css?v=2.9">
    <link rel="stylesheet" href="q.css?v=1">
</head>'''


PLAY = '''<section class="q-play">
            <p class="q-play-text">Three questions like this every day, the same for everyone.</p>
            <a class="q-play-btn" href="../#daily">Play today&rsquo;s round</a>
        </section>'''


def question_page(q, series, others):
    url = f'{SITE}q/{q["slug"]}.html'
    sentence = answer_sentence(q)
    note = trend_note(series, q)
    desc = f'{sentence} {note} ({q["source"]}, {q["year"]}.) Guess first, then see how you did.'.replace('  ', ' ')
    title = f'{q["title"]} ({fmt(q["answer"])}% in {q["year"]}) · {BRAND}'
    related = sorted(others, key=lambda o: (o['topic'] != q['topic'], o['title']))[:6]
    related_html = '\n'.join(
        f'                <li><a href="{o["slug"]}.html">{e(o["title"])}</a></li>' for o in related)
    ld = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': BRAND, 'item': SITE},
            {'@type': 'ListItem', 'position': 2, 'name': 'Questions', 'item': f'{SITE}q/'},
            {'@type': 'ListItem', 'position': 3, 'name': q['title'], 'item': url},
        ],
    }
    return f'''{head(title, desc, url)}
<body>
    <div class="page q-page">
        <header class="q-head">
            <p class="wordmark"><a href="../">{BRAND}</a> · <a href="./">Questions</a> · {e(TOPICS.get(q['topic'], q['topic']))}</p>
            <h1 class="q-title">{e(q['title'])}</h1>
            <p class="q-ask">{e(q['question'])}</p>
        </header>

        <main id="mainContent" data-qid="{e(q['id'])}" data-answer="{q['answer']}">
            <div class="q-guess" hidden>
                <p class="q-guess-label">Your guess, out of 100</p>
                <div class="daily-q-row">
                    <div class="progress-bar guess-bar" role="slider" tabindex="0" aria-label="Your guess"
                         aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50">
                        <span class="guess-fill"></span>
                        <span class="progress-fill"></span>
                        <span class="guess-mark"></span>
                    </div>
                    <span class="percentage daily-q-value">50</span>
                    <button class="daily-submit" type="button">Reveal</button>
                </div>
                <p class="q-result" aria-live="polite"></p>
            </div>

            <section class="q-answer">
                <p class="q-big">{fmt(q['answer'])}<span>/100</span></p>
                <p class="q-sentence">{e(sentence)} {e(note)}</p>
                {chart(series, q)}
                <p class="q-source">Source: <a href="{e(q['url'])}" rel="noopener">{e(q['source'])}</a>, {e(q['source_detail'])}, {q['year']}.</p>
            </section>
        </main>

        {PLAY}

        <section class="q-more">
            <h2 class="record-sub">More questions</h2>
            <ul class="q-list">
{related_html}
            </ul>
            <p class="q-all"><a href="./">All {len(others) + 1} questions</a></p>
        </section>
    </div>
    <script type="application/ld+json">{json.dumps(ld)}</script>
    <script src="q.js?v=1"></script>
</body>
</html>
'''


def index_page(questions):
    url = f'{SITE}q/'
    title = f'The world in 100: {len(questions)} questions with real answers · {BRAND}'
    desc = ('Out of every 100 people, how many use the internet, live on less than $3 a day, '
            'or are over 65? Guess first, then see the answer from the World Bank and Our World in Data.')
    groups = {}
    for q in questions:
        groups.setdefault(q['topic'], []).append(q)
    sections = []
    for topic in TOPICS:
        if topic not in groups:
            continue
        items = '\n'.join(
            f'                <li><a href="{q["slug"]}.html">{e(q["title"])}</a></li>'
            for q in sorted(groups[topic], key=lambda q: q['title']))
        sections.append(f'''        <section class="q-group">
            <h2 class="record-sub">{TOPICS[topic]}</h2>
            <ul class="q-list">
{items}
            </ul>
        </section>''')
    body = '\n'.join(sections)
    return f'''{head(title, desc, url, 'website')}
<body>
    <div class="page q-page">
        <header class="q-head">
            <p class="wordmark"><a href="../">{BRAND}</a> · Questions</p>
            <h1 class="q-title">The world in 100</h1>
            <p class="q-ask">{len(questions)} questions about everyone alive, each answered with the latest world figure. Guess before you look.</p>
        </header>

        {PLAY}

{body}
    </div>
</body>
</html>
'''


def sitemap(questions):
    def url(loc, freq, prio):
        return f'''  <url>
    <loc>{loc}</loc>
    <lastmod>{TODAY}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{prio}</priority>
  </url>'''
    entries = [url(SITE, 'daily', '1.0'), url(f'{SITE}q/', 'weekly', '0.9')]
    for q in sorted(questions, key=lambda q: q['slug']):
        entries.append(url(f'{SITE}q/{q["slug"]}.html', 'monthly', '0.8'))
    for path in sorted(glob.glob(os.path.join(ROOT, 'details', '*.html'))):
        name = os.path.basename(path)
        if name == 'placeholder.html':
            continue
        entries.append(url(f'{SITE}details/{name}', 'monthly', '0.6'))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + '\n'.join(entries) + '\n</urlset>\n')


def main():
    with open(os.path.join(ROOT, 'data', 'daily-questions.json'), encoding='utf-8') as f:
        questions = json.load(f)['questions']
    with open(os.path.join(ROOT, 'data', 'question-trends.json'), encoding='utf-8') as f:
        trends = json.load(f)
    out = os.path.join(ROOT, 'q')
    os.makedirs(out, exist_ok=True)
    keep = {'index.html', 'q.css', 'q.js'}
    for q in questions:
        name = f'{q["slug"]}.html'
        keep.add(name)
        others = [o for o in questions if o['id'] != q['id']]
        with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
            f.write(question_page(q, trends.get(q['id'], []), others))
    for stale in os.listdir(out):
        if stale.endswith('.html') and stale not in keep:
            os.remove(os.path.join(out, stale))
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(index_page(questions))
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(sitemap(questions))
    print(f'Wrote {len(questions)} question pages, q/index.html and sitemap.xml')


if __name__ == '__main__':
    main()
