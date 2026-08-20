import json
import math
import os
import struct
import tempfile
import wave
from pathlib import Path

import requests


def create_silent_wav(path: Path):
    sample_rate = 16000
    duration_seconds = 1
    samples = sample_rate * duration_seconds
    with wave.open(str(path), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        frames = bytearray()
        for index in range(samples):
            value = int(0 * math.sin(index))
            frames.extend(struct.pack('<h', value))
        audio.writeframes(bytes(frames))


def main():
    url = os.environ.get('TRANSCRIBE_TEST_URL', 'http://localhost:5000/api/transcribe-video')
    with tempfile.TemporaryDirectory(prefix='transcribe_test_') as temp_dir:
        audio_path = Path(temp_dir) / 'silent.wav'
        create_silent_wav(audio_path)
        with open(audio_path, 'rb') as audio_file:
            response = requests.post(
                url,
                files={'file': ('silent.wav', audio_file, 'audio/wav')},
                timeout=120,
            )
    print(response.status_code)
    print(json.dumps(response.json(), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
