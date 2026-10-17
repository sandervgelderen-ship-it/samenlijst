import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state">
        <strong>Er ging iets mis</strong>
        <p>Laad de app opnieuw. Je lijsten zijn veilig opgeslagen.</p>
        <p><button className="btn" onClick={() => location.reload()}>Opnieuw laden</button></p>
      </div>
    );
  }
}
