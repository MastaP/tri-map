import { Component, type ErrorInfo, type ReactNode } from 'react';
import { MapUnavailable } from './MapUnavailable.tsx';

interface Props {
  children: ReactNode;
  onError: () => void;
  onShowList?: () => void;
}

/**
 * Keeps a map failure (its code chunk failed to download, maplibre threw) local to the map:
 * the list, filters and race details keep working.
 */
export class MapBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('The map failed; the list keeps working.', error, info.componentStack);
    this.props.onError();
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <MapUnavailable reason="error" onRetry={() => window.location.reload()} onShowList={this.props.onShowList} />
    );
  }
}
