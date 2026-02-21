"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string; // Component name for debugging
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 rounded-lg bg-ast-pink/10 border border-ast-pink/30 text-center">
          <div className="text-ast-pink text-sm font-medium mb-1">
            Something went wrong
          </div>
          <div className="text-ast-muted text-xs">
            {this.props.name ? `Error in ${this.props.name}` : "An error occurred"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-2 px-3 py-1 text-xs rounded border border-ast-pink/30 text-ast-pink hover:bg-ast-pink/10 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper components with pre-configured error boundaries
export function SignalPanelBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      name="SignalPanel"
      fallback={
        <div className="p-4 rounded-lg bg-ast-surface border border-ast-border text-center">
          <div className="text-ast-muted text-sm">
            Signal panel temporarily unavailable
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function CompanyDrawerBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      name="CompanyDrawer"
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-ast-surface border border-ast-border rounded-lg p-6 max-w-sm mx-4 text-center">
            <div className="text-ast-pink text-sm font-medium mb-2">
              Failed to load company details
            </div>
            <div className="text-ast-muted text-xs mb-3">
              Please try again or refresh the page
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs rounded border border-ast-accent/30 text-ast-accent hover:bg-ast-accent/10 transition-colors"
            >
              Refresh page
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function CompanyTrayBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      name="CompanyTray"
      fallback={
        <div className="h-full flex flex-col bg-ast-bg">
          <div className="px-3 py-2 border-b border-ast-border">
            <span className="text-ast-mint text-xs font-semibold tracking-wide">📈 PUBLIC MARKETS</span>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="text-ast-pink text-sm font-medium mb-2">
                Market data unavailable
              </div>
              <div className="text-ast-muted text-xs mb-3">
                Stock data failed to load
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-xs rounded border border-ast-accent/30 text-ast-accent hover:bg-ast-accent/10 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
