import argparse

from bailliage import config


def main() -> None:
    parser = argparse.ArgumentParser(prog="bailliage")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("info", help="show paths and the source PDF")
    sub.add_parser("extract-text", help="Stage 1: PDF -> pages, sections, index CSVs in data/raw/")
    args = parser.parse_args()

    if args.cmd == "extract-text":
        from bailliage.text import extract
        extract.run()
    else:
        print(f"bailliage pipeline — root: {config.ROOT}")
        try:
            print(f"source PDF: {config.source_pdf().name}")
        except FileNotFoundError as e:
            print(e)


if __name__ == "__main__":
    main()
