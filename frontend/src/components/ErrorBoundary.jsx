import { Component } from 'react';

/**
 * Penangkap error tingkat akar aplikasi.
 * Tanpa ini, satu exception (mis. ReferenceError) mengubah seluruh pohon React
 * menjadi layar kosong tanpa jalan pemulihan.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: (error && error.message) || 'Terjadi kesalahan tak terduga.' };
  }

  componentDidCatch(error, info) {
    try {
      console.error('[MONSA] ErrorBoundary menangkap:', error, info);
    } catch {
      // logging gagal bukan alasan untuk menjatuhkan aplikasi lagi
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center bg-slate-100 p-6"
        >
          <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
            <h1 className="text-lg font-bold text-slate-800">
              Aplikasi mengalami gangguan
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Data Anda tidak hilang. Muat ulang aplikasi untuk melanjutkan.
            </p>
            <p className="mt-3 break-words rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              {this.state.message}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="rounded-lg bg-[#0B2D52] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B2D52]/90"
              >
                Muat Ulang Aplikasi
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
