// Restyles the per-page Chart.js configs to the home palette.
// Load after chart.js and before the page's own chart script.
(function () {
    if (!window.Chart) return;

    var INK = '#1c1b19';
    var MUTED = '#6f6b62';
    var RULE = '#d9d4c8';
    var PAPER = '#f6f4ee';
    var ACCENT = '#c4410c';
    var MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

    var Base = window.Chart;
    Base.defaults.font.family = "'IBM Plex Sans', -apple-system, sans-serif";
    Base.defaults.color = MUTED;

    function isLast(c) { return c.dataIndex === c.dataset.data.length - 1; }

    function restyle(cfg) {
        var data = cfg.data || {};
        (data.datasets || []).forEach(function (ds) {
            ds.borderColor = INK;
            ds.backgroundColor = 'rgba(28, 27, 25, 0.05)';
            ds.borderWidth = 2;
            ds.pointRadius = function (c) { return isLast(c) ? 5 : 3; };
            ds.pointHoverRadius = 6;
            ds.pointBackgroundColor = function (c) { return isLast(c) ? ACCENT : INK; };
            ds.pointBorderColor = PAPER;
            ds.pointBorderWidth = 1.5;
        });

        var opts = cfg.options = cfg.options || {};
        var plugins = opts.plugins = opts.plugins || {};
        plugins.legend = Object.assign(plugins.legend || {}, { display: false });
        plugins.tooltip = Object.assign(plugins.tooltip || {}, {
            backgroundColor: INK,
            titleColor: PAPER,
            bodyColor: PAPER,
            cornerRadius: 0,
            padding: 10,
            titleFont: { family: MONO, size: 12 },
            bodyFont: { family: MONO, size: 12 }
        });

        var scales = opts.scales = opts.scales || {};
        ['x', 'y'].forEach(function (k) { scales[k] = scales[k] || {}; });
        Object.keys(scales).forEach(function (k) {
            var s = scales[k];
            s.grid = Object.assign(s.grid || {}, { color: RULE, tickColor: RULE });
            s.border = Object.assign(s.border || {}, { color: RULE });
            s.ticks = Object.assign(s.ticks || {}, { color: MUTED, font: { family: MONO, size: 11 } });
            if (s.title) s.title = Object.assign(s.title, { color: MUTED, font: { family: MONO, size: 11 } });
        });
        return cfg;
    }

    window.Chart = class extends Base {
        constructor(ctx, cfg) { super(ctx, restyle(cfg)); }
    };
})();
