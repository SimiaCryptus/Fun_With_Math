/** Microphone input. Processing constraints OFF or the spectrum gets mangled. */
export class MicSource {
  static async create(ctx) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      video: false,
    });
    return new MicSource(ctx, stream);
  }

  constructor(ctx, stream) {
    this.stream = stream;
    this.node = ctx.createMediaStreamSource(stream);
    this.monitor = false;
    this.title = 'Microphone';
  }

  connect(dst) { this.node.connect(dst); }
  disconnect() { this.node.disconnect(); }
  get playing() { return true; }
  stop() { this.stream.getTracks().forEach((t) => t.stop()); }
}