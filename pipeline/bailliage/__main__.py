import argparse

from bailliage import config


def main() -> None:
    parser = argparse.ArgumentParser(prog="bailliage")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("info", help="show paths and the source PDF")
    sub.add_parser("extract-text", help="Stage 1: PDF -> pages, sections, index CSVs in data/raw/")
    sub.add_parser("validate", help="Stage 2: check data/curated/ against schema and vocabularies")
    sub.add_parser("schema", help="Stage 2: export JSON Schema per table to data/schema/")
    sub.add_parser("curate", help="Stage 4: build data/curated/*.csv from extracted + manual rows + rules")
    sub.add_parser("geocode", help="Stage 5: coordinates and fr/de/en names -> data/curated/geocoding.csv")
    sub.add_parser("geometry", help="Stage 6: settlement cells and territory areas -> data/geometry/")
    sub.add_parser("build-data", help="Stage 7: compile the dataset into web/public/data/")
    llm = sub.add_parser("extract-llm", help="Stage 3: extract facts per section with the Claude API")
    llm.add_argument("--sections", default="priority",
                     help="'priority' (default), 'all', or comma-separated section ids like L1-C06-S01")
    mode = llm.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true", help="count tokens and estimate cost; make no model calls")
    mode.add_argument("--realtime", action="store_true", help="call the API directly (full price)")
    mode.add_argument("--submit", action="store_true", help="submit pending chunks as a batch (half price)")
    mode.add_argument("--collect", action="store_true", help="fetch finished batches and parse their results")
    llm.add_argument("--wait", action="store_true", help="with --collect: poll until the batches end")
    llm.add_argument("--model", default="claude-opus-5")
    llm.add_argument("--effort", default="medium", choices=["low", "medium", "high", "xhigh", "max"])
    llm.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    if args.cmd == "extract-text":
        from bailliage.text import extract
        extract.run()
    elif args.cmd == "validate":
        from bailliage.data import store, validate
        ds = store.load()
        issues = validate.validate(ds)
        for issue in issues:
            if issue.level != "info":
                print(issue)
        for line in validate.coverage(ds):
            print(line)
        counts = {lvl: sum(i.level == lvl for i in issues) for lvl in ("error", "warning", "info")}
        print(f"{counts['error']} error(s), {counts['warning']} warning(s), {counts['info']} info")
        errors = counts["error"]
        raise SystemExit(1 if errors else 0)
    elif args.cmd == "extract-llm":
        from bailliage.extract import run
        jobs = run.build_jobs(run.select_sections(args.sections), args.model, args.effort)
        if args.realtime:
            run.run_realtime(jobs, args.model, args.effort, args.workers)
        elif args.submit:
            run.submit_batch(jobs, args.model, args.effort)
        elif args.collect:
            run.collect_batches(jobs, args.effort, args.wait)
        else:
            run.plan(jobs, args.model, args.effort)
    elif args.cmd == "build-data":
        from bailliage import web_data
        web_data.run()
    elif args.cmd == "geometry":
        from bailliage.geo import territories
        territories.run()
    elif args.cmd == "geocode":
        from bailliage.geo import geocode
        geocode.run()
    elif args.cmd == "curate":
        from bailliage.curate import build
        raise SystemExit(build.run())
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
