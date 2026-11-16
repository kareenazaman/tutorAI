/**
 * TutorAI — Chart.js theme (used from the dashboard/progress stages)
 * ------------------------------------------------------------------
 * Load AFTER chart.umd.min.js. Sets TutorAI fonts, colours and soft
 * gridlines as Chart.js defaults, and exposes the series palette:
 *
 *   new Chart(ctx, { data: { datasets: [{ backgroundColor: TutorAI.chartColors.series[0] }] } })
 */
(function (T) {
  'use strict';

  T.chartColors = {
    series: ['#18181B', '#8B78D6', '#5B93D3', '#4FA67A', '#E0788A', '#E3B21B'],
    fills:  ['#E9E3FA', '#DCEBFB', '#D8F0E3', '#FBE1E4', '#FFF1B8', '#FFE4D1'],
    grid:   '#EFEFEC',
    text:   '#6B6B76',
    ink:    '#18181B'
  };

  if (!window.Chart) return;

  const d = Chart.defaults;
  d.font.family = "'Inter', system-ui, sans-serif";
  d.font.size = 12;
  d.color = T.chartColors.text;
  d.borderColor = T.chartColors.grid;
  d.maintainAspectRatio = false;
  d.plugins.legend.labels.usePointStyle = true;
  d.plugins.legend.labels.boxWidth = 8;
  d.plugins.legend.labels.boxHeight = 8;
  d.plugins.tooltip.backgroundColor = T.chartColors.ink;
  d.plugins.tooltip.padding = 10;
  d.plugins.tooltip.cornerRadius = 8;
  d.plugins.tooltip.titleFont = { weight: '600' };
  d.elements.line.tension = 0.35;
  d.elements.line.borderWidth = 2;
  d.elements.point.radius = 0;
  d.elements.point.hoverRadius = 5;
  d.elements.bar.borderRadius = 6;
  d.scale.grid.color = T.chartColors.grid;
  d.scale.border = { display: false };
})(window.TutorAI = window.TutorAI || {});
