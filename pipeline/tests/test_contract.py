from pipeline.contract import DEFAULT_DIR, validate


def test_web_data_matches_contract():
    # Runs against whatever is in web/public/data (fixtures now, real exports later).
    assert validate(DEFAULT_DIR) == []
