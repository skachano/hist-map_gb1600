from bailliage import config


def test_year_range():
    assert (config.YEAR_MIN, config.YEAR_MAX) == (1600, 1632)


def test_paths_are_under_root():
    for p in (config.PDF_DIR, config.RAW_DIR, config.CURATED_DIR, config.WEB_DATA_DIR):
        assert config.ROOT in p.parents


def test_heavy_deps_importable():
    import fitz  # noqa: F401  (pymupdf)
    import geopandas  # noqa: F401
    import pydantic  # noqa: F401
    import anthropic  # noqa: F401
