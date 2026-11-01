import unittest

from ongdu_training.compare_ocr import identity_score, summarize


class OcrComparisonTests(unittest.TestCase):
    def test_opposite_corner_labels_collapse_for_both_engines(self):
        score = identity_score(["AS", "AS", "KH", "KH"], ["KH", "AS", "AS"])
        self.assertTrue(score["exact_identity_set"])
        self.assertEqual(score["ground_truth_identities"], 2)
        self.assertEqual(score["correct"], 2)
        self.assertEqual(score["duplicate_identity_outputs"], 1)
        self.assertEqual(score["total_outputs"], 3)

    def test_unknowns_and_duplicates_are_visible_despite_exact_set(self):
        score = identity_score(["AS"], ["AS", "AS"], unknown=2)
        self.assertTrue(score["exact_identity_set"])
        self.assertEqual(score["unknown_outputs"], 2)
        self.assertEqual(score["total_outputs"], 4)

    def test_misses_extras_and_failed_scans_remain_in_denominator(self):
        hit = identity_score(["AS", "KH"], ["AS", "QD"])
        self.assertEqual(hit["missing"], ["KH"])
        self.assertEqual(hit["extra"], ["QD"])
        rows = [{"ocr": {"status": "ok", "elapsed_ms": 10, "score": hit}},
                {"ocr": {"status": "scan-error", "elapsed_ms": 20, "score": identity_score(["AS"], [])}}]
        report = summarize(rows, "ocr")
        self.assertEqual(report["errors"], 1)
        self.assertEqual(report["images"], 2)
        self.assertEqual(report["unique_identity_precision"], 0.5)
        self.assertAlmostEqual(report["unique_identity_recall"], 1 / 3)
        self.assertEqual(report["missing_identities"], 2)
        self.assertEqual(report["exact_identity_set_rate"], 0)


if __name__ == "__main__":
    unittest.main()
