from bailliage import config


def main() -> None:
    print(f"bailliage pipeline — root: {config.ROOT}")
    try:
        print(f"source PDF: {config.source_pdf().name}")
    except FileNotFoundError as e:
        print(e)


if __name__ == "__main__":
    main()
