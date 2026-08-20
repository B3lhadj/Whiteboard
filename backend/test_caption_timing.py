import unittest

from backend.caption_timing import build_caption_cues


class CaptionTimingTests(unittest.TestCase):
    def test_preserves_word_timestamps_and_punctuation(self):
        cues = build_caption_cues([
            {"start": 0.12, "end": 0.42, "text": "Hello"},
            {"start": 0.43, "end": 0.51, "text": ","},
            {"start": 0.55, "end": 0.91, "text": "world"},
            {"start": 0.92, "end": 1.01, "text": "!"},
        ])

        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0]["text"], "Hello, world!")
        self.assertEqual(cues[0]["start"], 0.12)
        self.assertEqual(cues[0]["end"], 1.01)
        self.assertEqual(cues[0]["words"][2]["start"], 0.55)

    def test_starts_a_new_cue_after_silence(self):
        cues = build_caption_cues([
            {"start": 0.0, "end": 0.3, "text": "First"},
            {"start": 1.1, "end": 1.4, "text": "Second"},
        ])

        self.assertEqual([cue["text"] for cue in cues], ["First", "Second"])

    def test_ignores_invalid_words(self):
        cues = build_caption_cues([
            {"start": None, "end": 1, "text": "bad"},
            {"start": 1, "end": 1.4, "text": "good"},
            {"start": float("nan"), "end": 2, "text": "bad"},
        ])

        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0]["text"], "good")


if __name__ == "__main__":
    unittest.main()
