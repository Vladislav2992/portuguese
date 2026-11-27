import sys
from pathlib import Path

packages = Path(__file__).resolve().parents[1] / '.piper' / 'packages'
sys.path.insert(0, str(packages))

import lameenc
from piper import PiperVoice, SynthesisConfig


def main():
    text = sys.stdin.buffer.read(8193)
    if not text or len(text) > 8192:
        raise ValueError('Invalid input length')

    model = PiperVoice.load(sys.argv[1])
    encoder = None
    for audio in model.synthesize(text.decode('utf-8'), SynthesisConfig(length_scale=1.1)):
        if encoder is None:
            encoder = lameenc.Encoder()
            encoder.set_in_sample_rate(audio.sample_rate)
            encoder.set_channels(audio.sample_channels)
            encoder.set_bit_rate(48)
        sys.stdout.buffer.write(encoder.encode(audio.audio_int16_bytes))

    if encoder is None:
        raise ValueError('No speech was generated')
    sys.stdout.buffer.write(encoder.flush())


if __name__ == '__main__':
    main()
