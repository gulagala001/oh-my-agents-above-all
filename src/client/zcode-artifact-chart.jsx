import React, { lazy, Suspense, useMemo } from 'react';
import { ScopedErrorBoundary } from './zcode-artifact-primitives.jsx';

// Keep Recharts initialization out of the first render, as the fixed upstream
// ArtifactChart entry does. The actual plot/legend/tooltip is the original leaf.
const ArtifactChartView = lazy(() => import('./zcode-artifact-chart-view.jsx'));
const labels = { otherColumn: '其他', empty: '等待 report 数据…', itemsCount: count => `${count} 条` };

export function ZCodeArtifactChart({ spec, items, aggregate }) {
  const leafSpec = useMemo(() => ({ ...spec, title: undefined, description: undefined }), [spec]);
  const nativeModel = aggregate?.scope === 'full-run' && aggregate.model?.kind === 'chart' ? aggregate.model : undefined;
  return <div className="omaa-zcode-native-chart"><ScopedErrorBoundary resetKeys={[spec]} scope="workflow-artifact-chart">
    <Suspense fallback={<div className="omaa-zcode-chart-skeleton" aria-label="正在加载图表" data-testid="artifact-chart-skeleton"/>}>
      <ArtifactChartView spec={leafSpec} items={items} labels={labels} nativeModel={nativeModel}/>
    </Suspense>
  </ScopedErrorBoundary></div>;
}
