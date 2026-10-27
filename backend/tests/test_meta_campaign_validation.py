import unittest
from datetime import datetime, timedelta

from app.meta_ads import planned_spend, validate_campaign_plan


class MetaCampaignValidationTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 27, 6)
        self.campaign = {
            "objective": "OUTCOME_TRAFFIC",
            "dailyBudget": None,
            "lifetimeBudget": None,
            "maxTotalSpend": None,
        }
        self.ad_set = {
            "dailyBudget": 50000,
            "lifetimeBudget": None,
            "startTime": self.now,
            "endTime": self.now + timedelta(days=10),
            "promotedObject": None,
        }

    def test_daily_ad_set_spend_uses_bounded_schedule(self):
        self.assertEqual(planned_spend(self.campaign, [self.ad_set], self.now), 500000)

    def test_spending_limit_blocks_oversized_plan(self):
        campaign = self.campaign | {"maxTotalSpend": 400000}
        result = validate_campaign_plan(campaign, [self.ad_set], [{}], [{}], self.now)
        self.assertFalse(result["ready"])
        self.assertIn("Planned spend exceeds the campaign spending limit.", result["blockingIssues"])

    def test_unbounded_daily_budget_is_visible(self):
        result = validate_campaign_plan(self.campaign, [self.ad_set | {"endTime": None}], [{}], [{}], self.now)
        self.assertIsNone(result["maximumPlannedSpend"])
        self.assertTrue(any("unbounded" in warning for warning in result["warnings"]))

    def test_sales_campaign_requires_pixel(self):
        campaign = self.campaign | {"objective": "OUTCOME_SALES"}
        result = validate_campaign_plan(campaign, [self.ad_set], [{}], [{}], self.now)
        self.assertFalse(result["ready"])
        self.assertTrue(any("Meta Pixel" in issue for issue in result["blockingIssues"]))


if __name__ == "__main__":
    unittest.main()
