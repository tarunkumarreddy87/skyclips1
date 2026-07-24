"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a broken scene/asset from taking down the whole editor shell.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[editor:${this.props.label ?? "root"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 bg-[#121212] px-6 text-center"
          data-error-boundary
          role="alert"
        >
          <AlertTriangle className="size-8 text-amber-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-zinc-100">
              {this.props.label ?? "Editor"} hit an error
            </p>
            <p className="mt-1 max-w-md text-xs text-zinc-500">
              {this.state.error.message || "Something went wrong rendering this panel."}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw className="size-3.5" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
