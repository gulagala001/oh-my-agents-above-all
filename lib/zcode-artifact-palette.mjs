// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.
const ARTIFACT_CHART_MAX_SERIES = 6;
function artifactSeriesColorVar(index) {
  return `var(--color-usage-chart-${index % ARTIFACT_CHART_MAX_SERIES + 1})`;
}
const SERIES_DASH = [
  void 0,
  "6 3",
  "2 3",
  "9 3 2 3",
  "1 3",
  "12 4"
];
function artifactSeriesDash(index) {
  return SERIES_DASH[index % SERIES_DASH.length];
}
const SERIES_SYMBOL = ["circle", "cross", "diamond", "square", "triangle", "star"];
function artifactSeriesSymbol(index) {
  return SERIES_SYMBOL[index % SERIES_SYMBOL.length];
}
export {
  ARTIFACT_CHART_MAX_SERIES,
  artifactSeriesColorVar,
  artifactSeriesDash,
  artifactSeriesSymbol
};
