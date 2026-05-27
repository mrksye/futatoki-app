import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 予告チャイム (残り 15 / 10 / 5 分) の音声アセットを生成するワンショットスクリプト。
 *
 * チャイムはもともと実行時に Web Audio のオシレータで合成していたが、ライブ合成は Android で発火が不安定
 * だった (完了アラームの decode 済みバッファ再生は安定)。そこで「同じ合成音を一度だけ音声ファイルに焼き込み、
 * 実行時はアラームと同じバッファ再生経路で鳴らす」方針にした。このスクリプトがその m4a を作る (合成した WAV を
 * ffmpeg で AAC/m4a にエンコード = 完了アラームと同じ形式・小サイズ)。音色を変えたいときは下のパラメータを変えて
 * `bun run build-tools/generate-chime-sounds.ts` で再生成し、出力 m4a をコミットする (要 ffmpeg)。
 *
 * 合成は timer-chime がオシレータでやっていたものと同一: 880Hz サイン波に、速いアタック (0.001→ピーク) の後
 * 指数減衰 (ピーク→0.001) のエンベロープをかけた「ポーン」を、オフセットを変えて重ねる。
 */

const SAMPLE_RATE = 22050; // 880Hz の純音には十分 (Nyquist 11025Hz)。ファイルを小さく保つ。
const FREQUENCY_HZ = 880;
const PEAK_GAIN = 0.3;
const ATTACK_SECONDS = 0.01;
const TAIL_SECONDS = 0.1; // 末尾の無音余白 (ブツ切れ防止)
const EPSILON = 0.001; // 指数ランプは 0 を取れないのでこの最小値から/まで

interface Beep {
  startOffsetSeconds: number;
  durationSeconds: number;
}

// 余韻 (「ポッ」=短い / 「ポーン」=中 / 「ポーーン」=やや長い / 「ポーーーーン」=長い) と onset 間隔。
const SHORT = 0.13;
const MEDIUM = 0.45;
const LONG = 0.7;
const LONGER = 1.5;
const SHORT_GAP = 0.22;
const TEN_MIN_GAP = 0.5; // 10 分前「ポーンポーーン」の 2 音の間隔

const PATTERNS: { name: string; beeps: Beep[] }[] = [
  // 残り 15 分: ポッポッポッ (短い「ポッ」を等間隔で 3 つ)
  {
    name: "chime-15min",
    beeps: [
      { startOffsetSeconds: 0, durationSeconds: SHORT },
      { startOffsetSeconds: SHORT_GAP, durationSeconds: SHORT },
      { startOffsetSeconds: SHORT_GAP * 2, durationSeconds: SHORT },
    ],
  },
  // 残り 10 分: ポーンポーーン (中くらいの「ポーン」のあと、間をあけて伸ばす「ポーーン」)
  {
    name: "chime-10min",
    beeps: [
      { startOffsetSeconds: 0, durationSeconds: MEDIUM },
      { startOffsetSeconds: TEN_MIN_GAP, durationSeconds: LONG },
    ],
  },
  // 残り 5 分: ポーーーーン
  {
    name: "chime-5min",
    beeps: [{ startOffsetSeconds: 0, durationSeconds: LONGER }],
  },
];

/** 1 つの beep の時刻 t (beep 開始からの秒) でのエンベロープ。Web Audio の setValueAtTime(EPSILON) →
 *  exponentialRampToValueAtTime(PEAK, ATTACK) → exponentialRampToValueAtTime(EPSILON, duration) と一致させる。 */
const envelopeAt = (t: number, durationSeconds: number): number => {
  if (t < ATTACK_SECONDS) {
    return EPSILON * Math.pow(PEAK_GAIN / EPSILON, t / ATTACK_SECONDS);
  }
  return PEAK_GAIN * Math.pow(EPSILON / PEAK_GAIN, (t - ATTACK_SECONDS) / (durationSeconds - ATTACK_SECONDS));
};

/** beeps を Float32 PCM (モノラル) に合成する。各 beep は自前の位相 (開始で 0) を持つ。 */
const synthesize = (beeps: Beep[]): Float32Array => {
  const endSeconds = Math.max(...beeps.map((b) => b.startOffsetSeconds + b.durationSeconds)) + TAIL_SECONDS;
  const samples = new Float32Array(Math.ceil(endSeconds * SAMPLE_RATE));
  for (const beep of beeps) {
    const startSample = Math.floor(beep.startOffsetSeconds * SAMPLE_RATE);
    const durationSamples = Math.floor(beep.durationSeconds * SAMPLE_RATE);
    for (let i = 0; i < durationSamples; i++) {
      const t = i / SAMPLE_RATE;
      samples[startSample + i]! += envelopeAt(t, beep.durationSeconds) * Math.sin(2 * Math.PI * FREQUENCY_HZ * t);
    }
  }
  return samples;
};

/** Float32 PCM を 16-bit モノラル WAV のバイト列にする。 */
const encodeWav = (samples: Float32Array): Buffer => {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt チャンク長
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // モノラル
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
};

const soundsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "timer", "sounds");
for (const pattern of PATTERNS) {
  const wav = encodeWav(synthesize(pattern.beeps));
  const outPath = join(soundsDir, `${pattern.name}.m4a`);
  // 合成した WAV を ffmpeg に stdin で渡して AAC/m4a にエンコードする (完了アラームと同じ形式で、WAV より小さい)。
  // 要 ffmpeg (このスクリプトは音を変えたいときだけ手で走らせる開発用なので外部ツール依存で可)。
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "96k", outPath],
    { input: wav },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${pattern.name}: ${result.stderr?.toString() ?? "(no stderr)"}`);
  }
  console.log(`wrote ${outPath}`);
}
