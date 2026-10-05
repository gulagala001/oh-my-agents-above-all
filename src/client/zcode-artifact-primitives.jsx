import React from 'react';

// A chart failure only affects its artifact. Host conversation/settings panes
// remain mounted, and a new artifact definition permits an explicit retry.
export class ScopedErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(previous) {
    if (this.state.error && (previous.resetKeys || []).some((value, index) => value !== this.props.resetKeys?.[index])) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div role="alert" className="omaa-error"><p>此图表暂时无法渲染：{this.state.error.message || String(this.state.error)}</p><button type="button" onClick={() => this.setState({ error: null })}>重新加载图表</button></div>;
  }
}
