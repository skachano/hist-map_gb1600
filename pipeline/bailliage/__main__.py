import argparse

from bailliage import config


def main() -> None:
    parser = argparse.ArgumentParser(prog="bailliage")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("info", help="show paths and the source PDF")
    sub.add_parser("extract-text", help="Stage 1: PDF -> pages, sections, index CSVs in data/raw/")
    sub.add_parser("validate", help="Stage 2: check data/curated/ against schema and vocabularies")
    sub.add_parser("schema", help="Stage 2: export JSON Schema per table to data/schema/")
    args = parser.parse_args()

    if args.cmd == "extract-text":
        from bailliage.text import extract
        extract.run()
    elif args.cmd == "validate":
        from bailliage.data import store, validate
        ds = store.load()
        issues = validate.validate(ds)
        for issue in issues:
            print(issue)
        for line in validate.coverage(ds):
            print(line)
        errors = sum(i.level == "error" for i in issues)
        print(f"{errors} error(s), {len(issues) - errors} warning(s)")
        raise SystemExit(1 if errors else 0)
    elif args.cmd == "schema":
        from bailliage.data import schema
        for path in schema.export():
            print(f"wrote {path.relative_to(config.ROOT)}")
    else:
        print(f"bailliage pipeline — root: {config.ROOT}")
        try:
            print(f"source PDF: {config.source_pdf().name}")
        except FileNotFoundError as e:
            print(e)


if __name__ == "__main__":
    main()
