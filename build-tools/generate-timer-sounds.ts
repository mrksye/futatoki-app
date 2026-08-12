import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * たいむモードの音声アセット (予告チャイム 3 種 + 完了アラーム) を生成するワンショットスクリプト。
 *
 * チャイムはもともと実行時に Web Audio のオシレータで合成していたが、ライブ合成は Android で発火が不安定
 * だった (decode 済みバッファ再生は安定)。そこで「同じ合成音を一度だけ音声ファイルに焼き込み、
 * 実行時はバッファ再生経路で鳴らす」方針にした。このスクリプトがその m4a を作る (合成した WAV を
 * ffmpeg で AAC/m4a にエンコード)。音を変えたいときは下のパラメータを変えて
 * `bun run build-tools/generate-timer-sounds.ts` で再生成し、出力 m4a をコミットする (要 ffmpeg)。
 *
 * 予告チャイムと完了アラームは音源を全部この場で合成する方針で、第三者の権利が一切乗らない状態を保つ。
 * リポジトリが MIT でフォークの再配布を歓迎している以上、音源だけベンダーの利用規約に依存していると
 * その約束が成立しなくなるため、外部で生成した素材を持ち込まない。
 *
 * 2 系統の音は役割が違うので音色も分ける:
 *
 *   - 予告チャイム (残り 15 / 10 / 5 分): 880Hz の純サイン波 1 本に、速いアタック (0.001→ピーク) の後
 *     指数減衰 (ピーク→0.001) をかけた「ポーン」。timer-chime がオシレータでやっていた合成と一致させて
 *     あるので、エンベロープ式と定数は変えない。
 *
 *   - 完了アラーム: 倍音を重ねたオルゴール / 鉄琴系の音色で短いメロディを鳴らす。予告と同じ「ポーン」に
 *     すると区別がつかず、純サイン波 1 本では電子ビープに聞こえて完了の祝福感が出ないため。鳴り続ける
 *     (loop 再生) 前提なので、繰り返し聴いても角が立たない範囲に収める。
 */

const TAIL_SECONDS = 0.1; // 末尾の無音余白 (ブツ切れ防止)

// ---------------------------------------------------------------------------
// 予告チャイム
// ---------------------------------------------------------------------------

const CHIME_SAMPLE_RATE = 22050; // 880Hz の純音には十分 (Nyquist 11025Hz)。ファイルを小さく保つ。
const FREQUENCY_HZ = 880;
const PEAK_GAIN = 0.3;
const ATTACK_SECONDS = 0.01;
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

const CHIME_PATTERNS: { name: string; beeps: Beep[] }[] = [
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
const synthesizeChime = (beeps: Beep[]): Float32Array => {
  const endSeconds = Math.max(...beeps.map((b) => b.startOffsetSeconds + b.durationSeconds)) + TAIL_SECONDS;
  const samples = new Float32Array(Math.ceil(endSeconds * CHIME_SAMPLE_RATE));
  for (const beep of beeps) {
    const startSample = Math.floor(beep.startOffsetSeconds * CHIME_SAMPLE_RATE);
    const durationSamples = Math.floor(beep.durationSeconds * CHIME_SAMPLE_RATE);
    for (let i = 0; i < durationSamples; i++) {
      const t = i / CHIME_SAMPLE_RATE;
      samples[startSample + i]! += envelopeAt(t, beep.durationSeconds) * Math.sin(2 * Math.PI * FREQUENCY_HZ * t);
    }
  }
  return samples;
};

// ---------------------------------------------------------------------------
// 完了アラーム
// ---------------------------------------------------------------------------

const ALARM_SAMPLE_RATE = 44100; // 最上倍音 (E6 の 4.2 倍音 ≒ 5.5kHz) に余裕を持たせる。
const ALARM_ATTACK_SECONDS = 0.004;
const ALARM_TAIL_SECONDS = 0.25; // ループ時に音が途切れて聞こえるための間。

/** 音名 → 周波数 (A4 = 440Hz)。予告チャイムの 880Hz (A5) と同じ音域帯に置いて世界観を揃える。 */
const NOTE_HZ: Record<string, number> = {
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.51,
};

/**
 * オルゴール / 鉄琴系の倍音構成。高い倍音ほど速く減衰させる (decayScale が小さい) と、
 * アタックだけキラッと鳴って余韻は基音が残る = 実際の鳴り物の挙動になる。
 */
const ALARM_PARTIALS: { ratio: number; gain: number; decayScale: number }[] = [
  { ratio: 1.0, gain: 1.0, decayScale: 1.0 },
  { ratio: 2.0, gain: 0.32, decayScale: 0.55 },
  { ratio: 3.0, gain: 0.11, decayScale: 0.32 },
  { ratio: 4.2, gain: 0.05, decayScale: 0.2 },
];

interface Note {
  note: keyof typeof NOTE_HZ | string;
  startSeconds: number;
  durationSeconds: number;
  gain: number;
}

/**
 * 完了アラームのメロディ。ド-ソ-ミ-ソ-ド-ミ と上下してから最高音で伸ばす 6 音で、
 * 音同士を重ねて (前の音が減衰しきる前に次を出す) オルゴールのつながりを作る。
 */
const ALARM_NOTES: Note[] = [
  { note: "C6", startSeconds: 0.0, durationSeconds: 0.7, gain: 0.85 },
  { note: "G5", startSeconds: 0.18, durationSeconds: 0.7, gain: 0.8 },
  { note: "E5", startSeconds: 0.36, durationSeconds: 0.8, gain: 0.8 },
  { note: "G5", startSeconds: 0.54, durationSeconds: 0.8, gain: 0.85 },
  { note: "C6", startSeconds: 0.72, durationSeconds: 1.0, gain: 0.9 },
  { note: "E6", startSeconds: 0.9, durationSeconds: 1.8, gain: 1.0 },
];

/** 1 音を PCM に足し込む。倍音ごとに独立した指数減衰をかける。 */
const renderNote = (samples: Float32Array, note: Note): void => {
  const frequency = NOTE_HZ[note.note];
  if (frequency === undefined) throw new Error(`unknown note: ${note.note}`);

  const startSample = Math.floor(note.startSeconds * ALARM_SAMPLE_RATE);
  const durationSamples = Math.floor(note.durationSeconds * ALARM_SAMPLE_RATE);

  for (let i = 0; i < durationSamples; i++) {
    const t = i / ALARM_SAMPLE_RATE;
    // アタックだけ短い線形立ち上がりにしてクリックを避け、以降は倍音ごとの指数減衰に任せる。
    const attack = t < ALARM_ATTACK_SECONDS ? t / ALARM_ATTACK_SECONDS : 1;
    let value = 0;
    for (const partial of ALARM_PARTIALS) {
      const decay = Math.exp((-5.0 * t) / (note.durationSeconds * partial.decayScale));
      value += partial.gain * decay * Math.sin(2 * Math.PI * frequency * partial.ratio * t);
    }
    const index = startSample + i;
    if (index < samples.length) samples[index]! += attack * note.gain * value;
  }
};

const synthesizeAlarm = (notes: Note[]): Float32Array => {
  const endSeconds =
    Math.max(...notes.map((n) => n.startSeconds + n.durationSeconds)) + ALARM_TAIL_SECONDS;
  const samples = new Float32Array(Math.ceil(endSeconds * ALARM_SAMPLE_RATE));
  for (const note of notes) renderNote(samples, note);

  // 倍音と音の重なりで振幅が積み上がるのでピーク基準で正規化する。0.89 は AAC エンコード後の
  // オーバーシュートでクリップしないための余裕。
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) {
    const scale = 0.89 / peak;
    for (let i = 0; i < samples.length; i++) samples[i]! *= scale;
  }
  return samples;
};

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

/** Float32 PCM を 16-bit モノラル WAV のバイト列にする。 */
const encodeWav = (samples: Float32Array, sampleRate: number): Buffer => {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt チャンク長
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // モノラル
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
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

/** 合成した WAV を ffmpeg に stdin で渡して AAC/m4a にエンコードする (WAV より小さい)。
 *  要 ffmpeg (このスクリプトは音を変えたいときだけ手で走らせる開発用なので外部ツール依存で可)。 */
const writeM4a = (name: string, samples: Float32Array, sampleRate: number, bitrate: string): void => {
  const outPath = join(soundsDir, `${name}.m4a`);
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", bitrate, outPath],
    { input: encodeWav(samples, sampleRate) },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${name}: ${result.stderr?.toString() ?? "(no stderr)"}`);
  }
  console.log(`wrote ${outPath}`);
};

for (const pattern of CHIME_PATTERNS) {
  writeM4a(pattern.name, synthesizeChime(pattern.beeps), CHIME_SAMPLE_RATE, "96k");
}
writeM4a("timer-end", synthesizeAlarm(ALARM_NOTES), ALARM_SAMPLE_RATE, "64k");
