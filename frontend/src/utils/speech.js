export function isTtsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeech() {
  if (isTtsSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

export function speakText(text, onStateChange) {
  if (!isTtsSupported() || !text) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = 0.96;
    const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    const idVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('id'));
    if (idVoice) utter.voice = idVoice;
    utter.onstart = () => onStateChange && onStateChange(true);
    utter.onend = () => onStateChange && onStateChange(false);
    utter.onerror = () => onStateChange && onStateChange(false);
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    onStateChange && onStateChange(false);
    return false;
  }
}

export function isSttSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startDictation({ onResult, onError, onEnd }) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) {
    onError && onError('Browser ini belum mendukung dikte suara otomatis. Gunakan Chrome/Android atau ketik manual.');
    return null;
  }
  const recognition = new SR();
  recognition.lang = 'id-ID';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || [])
      .map((r) => r[0]?.transcript || '')
      .join(' ')
      .trim();
    if (transcript && onResult) onResult(transcript);
  };
  recognition.onerror = (event) => {
    const msg =
      event?.error === 'not-allowed'
        ? 'Izin mikrofon ditolak. Aktifkan izin mikrofon di browser untuk dikte suara.'
        : 'Tidak dapat menangkap suara dengan jelas. Silakan coba lagi.';
    onError && onError(msg);
  };
  recognition.onend = () => onEnd && onEnd();
  recognition.start();
  return recognition;
}
