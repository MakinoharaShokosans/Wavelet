import { Component, type ErrorInfo, type ReactNode } from 'react';
import { SvgIcons } from './SvgIcons.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Wavelet ErrorBoundary] 捕获到未处理的组件渲染异常:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-[var(--bg-canvas)] flex items-center justify-center p-6 select-none font-sans">
          <div className="max-w-md w-full bg-white border border-[var(--border-subtle)] rounded-3xl p-8 shadow-xl text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-mint)] mb-5">
              <SvgIcons name="alert" size={28} />
            </div>

            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              界面渲染遇到异常
            </h2>

            <p className="text-sm text-[var(--text-secondary)] mb-4">
              播放器已自动拦截错误以防止页面损坏，你可以尝试重置界面或重新载入应用。
            </p>

            {this.state.error && (
              <div className="w-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xl p-3 mb-6 text-left overflow-auto max-h-32 text-xs font-mono text-[var(--text-tertiary)]">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors text-sm font-medium cursor-pointer"
              >
                重置界面
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--text-primary)] text-white hover:opacity-90 transition-opacity text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <SvgIcons name="refresh" size={16} />
                <span>重新加载</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
