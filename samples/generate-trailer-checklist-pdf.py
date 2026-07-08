#!/usr/bin/env python3
"""Generate a vintage paper-style Trailer inspection checklist PDF for demos."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from fpdf import FPDF
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "checklists.default.json"
OUTPUT_PATH = Path(__file__).resolve().parent / "trailer-inspection-checklist.pdf"
IMAGE_CANDIDATES = [
    ROOT / "public" / "container.png",
    ROOT / "container.png",
    ROOT / "images" / "container.png",
]

PAGE_W = 215.9
PAGE_H = 279.4
MARGIN = 14
PAPER_RGB = (244, 236, 220)
# Stock diagram images use magenta as a transparency key (same as the inspection app).
CHROMA_KEY = (255, 128, 255)
CHROMA_TOLERANCE = 36


class VintageChecklistPDF(FPDF):
    def __init__(self) -> None:
        super().__init__(unit="mm", format="letter")
        self.set_auto_page_break(auto=True, margin=16)
        self.set_margins(MARGIN, MARGIN, MARGIN)

    def header(self) -> None:
        pass

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Courier", "", 7)
        self.set_text_color(110, 100, 85)
        self.cell(0, 4, "WMS INSPECTION CHECKLIST - TRAILER", align="C")
        self.ln(3)
        self.cell(0, 4, f"Form WMS-INS-TR-01    Page {self.page_no()}", align="C")


def load_trailer_fields() -> list[dict]:
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    fields = data["checklists"]["trailer"]["fields"]
    seen_labels: set[str] = set()
    result: list[dict] = []
    for field in fields:
        label = field.get("label", "")
        if label in seen_labels:
            continue
        seen_labels.add(label)
        result.append(field)
    return result


def find_container_image() -> Path | None:
    for path in IMAGE_CANDIDATES:
        if path.is_file():
            return path
    return None


def is_chroma_pixel(r: int, g: int, b: int) -> bool:
    return (
        abs(r - CHROMA_KEY[0]) <= CHROMA_TOLERANCE
        and abs(g - CHROMA_KEY[1]) <= CHROMA_TOLERANCE
        and abs(b - CHROMA_KEY[2]) <= CHROMA_TOLERANCE
    )


def prepare_container_image(source: Path, paper_rgb: tuple[int, int, int] = PAPER_RGB) -> Path:
    """Replace magenta chroma-key pixels with the paper color so the diagram blends in."""
    img = Image.open(source).convert("RGB")
    pixels = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = pixels[x, y]
            if is_chroma_pixel(r, g, b):
                pixels[x, y] = paper_rgb
    out = Path(tempfile.gettempdir()) / "trailer-checklist-container.png"
    img.save(out, format="PNG")
    return out


def paper_background(pdf: VintageChecklistPDF) -> None:
    pdf.set_fill_color(*PAPER_RGB)
    pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")
    pdf.set_draw_color(190, 175, 150)
    pdf.set_line_width(0.4)
    pdf.rect(8, 8, PAGE_W - 16, PAGE_H - 16)
    pdf.set_line_width(0.2)
    pdf.rect(9.5, 9.5, PAGE_W - 19, PAGE_H - 19)


def draw_title_block(pdf: VintageChecklistPDF) -> None:
    pdf.set_text_color(45, 40, 35)
    pdf.set_font("Courier", "B", 18)
    pdf.cell(0, 10, "INSPECTION CHECKLIST", ln=True, align="C")
    pdf.set_font("Courier", "", 9)
    pdf.set_text_color(90, 80, 70)
    pdf.cell(0, 5, "TRAILER RECEIVING / YARD INSPECTION", ln=True, align="C")
    pdf.ln(2)
    pdf.set_font("Courier", "", 8)
    pdf.cell(0, 4, "Rev 03/98  -  Retain copy with shipping documents", ln=True, align="C")
    pdf.ln(5)


def draw_header_fields(pdf: VintageChecklistPDF) -> None:
    pdf.set_text_color(35, 32, 28)
    pdf.set_font("Courier", "B", 9)
    pdf.cell(0, 5, "HEADER INFORMATION", ln=True)
    pdf.set_font("Courier", "", 9)
    pdf.ln(1)

    rows = [
        ("Trailer ID / #:", 118),
        ("Inspection Date:", 55),
        ("Inspector Name:", 118),
        ("Location / Yard:", 118),
        ("ORG / Facility:", 118),
    ]

    for label, line_w in rows:
        pdf.set_x(MARGIN)
        pdf.cell(38, 7, label)
        x = pdf.get_x()
        y = pdf.get_y()
        pdf.set_draw_color(60, 55, 48)
        pdf.line(x, y + 6, x + line_w, y + 6)
        pdf.ln(8)

    pdf.ln(2)


def draw_checkbox(pdf: VintageChecklistPDF, x: float, y: float, size: float = 3.2) -> None:
    pdf.rect(x, y, size, size)


def draw_pass_fail_row(pdf: VintageChecklistPDF, label: str, required: bool = False) -> None:
    pdf.set_font("Courier", "", 9)
    pdf.set_text_color(35, 32, 28)
    star = " *" if required else ""
    pdf.cell(0, 6, f"{label}{star}", ln=True)
    y = pdf.get_y()
    x = MARGIN + 4
    for option in ("Pass", "Fail"):
        draw_checkbox(pdf, x, y - 0.5)
        pdf.set_xy(x + 4.5, y - 1)
        pdf.cell(18, 5, option)
        x += 28
    pdf.ln(7)


def draw_yes_no_row(pdf: VintageChecklistPDF, label: str, required: bool = False) -> None:
    pdf.set_font("Courier", "", 9)
    star = " *" if required else ""
    pdf.cell(0, 6, f"{label}{star}", ln=True)
    y = pdf.get_y()
    x = MARGIN + 4
    for option in ("Yes", "No"):
        draw_checkbox(pdf, x, y - 0.5)
        pdf.set_xy(x + 4.5, y - 1)
        pdf.cell(16, 5, option)
        x += 26
    pdf.ln(7)


def draw_option_row(pdf: VintageChecklistPDF, label: str, options: list[str], required: bool = False) -> None:
    pdf.set_font("Courier", "", 9)
    star = " *" if required else ""
    pdf.cell(0, 6, f"{label}{star}", ln=True)
    y = pdf.get_y()
    x = MARGIN + 4
    col = 0
    for option in options:
        draw_checkbox(pdf, x, y - 0.5)
        pdf.set_xy(x + 4.5, y - 1)
        w = pdf.get_string_width(option) + 6
        pdf.cell(w, 5, option)
        x += w + 8
        col += 1
        if col >= 2 and x > PAGE_W - MARGIN - 40:
            y += 6
            x = MARGIN + 4
            col = 0
            pdf.set_y(y)
    pdf.ln(8)


def draw_blank_line_row(pdf: VintageChecklistPDF, label: str, required: bool = False) -> None:
    pdf.set_font("Courier", "", 9)
    star = " *" if required else ""
    pdf.cell(55, 6, f"{label}{star}")
    x = pdf.get_x()
    y = pdf.get_y()
    pdf.line(x, y + 5, PAGE_W - MARGIN, y + 5)
    pdf.ln(9)


def draw_question(pdf: VintageChecklistPDF, field: dict) -> None:
    label = field.get("label", "")
    required = bool(field.get("required"))
    ftype = field.get("type", "")
    options = field.get("options") or []

    if ftype in ("segmented", "toggle_pair") and set(options) <= {"Pass", "Fail"}:
        draw_pass_fail_row(pdf, label, required)
    elif ftype in ("segmented", "toggle_pair") and set(options) <= {"Yes", "No"}:
        draw_yes_no_row(pdf, label, required)
    elif ftype == "dropdown" and options:
        draw_option_row(pdf, label, options, required)
    else:
        draw_blank_line_row(pdf, label, required)


def draw_damage_diagram(pdf: VintageChecklistPDF, image_path: Path | None) -> None:
    pdf.ln(2)
    pdf.set_font("Courier", "B", 9)
    pdf.cell(0, 6, "DAMAGE DIAGRAM - MARK AREAS OF DAMAGE ON CONTAINER", ln=True)
    pdf.set_font("Courier", "", 7)
    pdf.set_text_color(90, 80, 70)
    pdf.cell(0, 4, "Circle or mark damage on the diagram below", ln=True)
    pdf.ln(2)

    x = MARGIN
    y = pdf.get_y()
    box_w = PAGE_W - (MARGIN * 2)
    box_h = 52

    pdf.set_fill_color(*PAPER_RGB)
    pdf.set_draw_color(80, 75, 68)
    pdf.set_line_width(0.3)
    pdf.rect(x, y, box_w, box_h, style="FD")

    rendered = False
    if image_path:
        try:
            prepared = prepare_container_image(image_path)
            pdf.image(str(prepared), x + 4, y + 3, w=box_w - 8, h=box_h - 6)
            rendered = True
        except Exception:
            rendered = False

    if not rendered:
        pdf.set_xy(x, y + box_h / 2 - 4)
        pdf.set_font("Courier", "I", 10)
        pdf.set_text_color(120, 110, 95)
        pdf.cell(box_w, 8, "[ Container diagram ]", align="C")

    pdf.set_y(y + box_h + 4)
    pdf.set_text_color(35, 32, 28)


def draw_signature_block(pdf: VintageChecklistPDF) -> None:
    pdf.ln(4)
    pdf.set_font("Courier", "B", 9)
    pdf.cell(0, 6, "INSPECTOR'S SIGNATURE", ln=True)
    pdf.ln(8)
    x = MARGIN
    y = pdf.get_y()
    pdf.line(x, y, x + 95, y)
    pdf.set_xy(x, y + 2)
    pdf.set_font("Courier", "", 8)
    pdf.set_text_color(90, 80, 70)
    pdf.cell(95, 4, "Sign here")
    pdf.set_xy(x + 110, y - 1)
    pdf.set_text_color(35, 32, 28)
    pdf.cell(20, 5, "Date:")
    pdf.line(x + 125, y + 4, PAGE_W - MARGIN, y + 4)


def build_pdf() -> Path:
    fields = load_trailer_fields()
    image_path = find_container_image()

    pdf = VintageChecklistPDF()
    pdf.add_page()
    paper_background(pdf)
    pdf.set_y(MARGIN + 2)

    draw_title_block(pdf)
    draw_header_fields(pdf)

    pdf.set_font("Courier", "B", 9)
    pdf.set_text_color(35, 32, 28)
    pdf.cell(0, 5, "INSPECTION ITEMS", ln=True)
    pdf.set_font("Courier", "", 7)
    pdf.set_text_color(90, 80, 70)
    pdf.cell(0, 4, "* Required field", ln=True)
    pdf.ln(2)

    for field in fields:
        if pdf.get_y() > PAGE_H - 70:
            pdf.add_page()
            paper_background(pdf)
            pdf.set_y(MARGIN + 2)
        draw_question(pdf, field)

    if pdf.get_y() > PAGE_H - 95:
        pdf.add_page()
        paper_background(pdf)
        pdf.set_y(MARGIN + 2)

    draw_damage_diagram(pdf, image_path)
    draw_signature_block(pdf)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_PATH))
    return OUTPUT_PATH


if __name__ == "__main__":
    out = build_pdf()
    print(f"Wrote {out}")
