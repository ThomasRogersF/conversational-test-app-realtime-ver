/**
 * AudioWorklet processor that converts float32 mic input to Int16 PCM.
 * Posts Int16Array buffers to the main thread using transferable objects.
 */
class PCM16Processor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const float32 = input[0]; // mono channel 0
    if (!float32 || float32.length === 0) return true;

    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.port.postMessage(int16, [int16.buffer]);
    return true;
  }
}

registerProcessor("pcm16-processor", PCM16Processor);
